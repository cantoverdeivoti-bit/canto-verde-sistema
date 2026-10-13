/**
 * Compra no atacado: o pedido direto de um atacado nasce sem link, sem
 * previsão de entrega e com o estimado congelado; o de um fornecedor normal
 * continua com link. Roda no banco, dentro de uma transação desfeita no fim —
 * nada fica gravado.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/test-atacado.ts
 */
import { prisma } from "@/lib/db";
import { ultimoCustoPorProduto } from "@/lib/historico";
import { dadosDoPedidoDireto } from "@/lib/pedido-direto";
import { rotuloDoPedido } from "@/lib/cotacao-labels";
import { Prisma } from "@/generated/prisma/client";

class Desfazer extends Error {}

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "✓" : "✗"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas += 1;
}

async function main() {
  // Dois com histórico de preço e um sem: o estimado tem que vir num e ficar
  // em branco no outro.
  const [comHistorico, semHistorico] = await Promise.all([
    prisma.historicoPrecosCompra.findMany({ distinct: ["produtoId"], select: { produtoId: true }, take: 2 }),
    prisma.product.findFirst({ where: { isActive: true, historico: { none: {} } }, select: { id: true } }),
  ]);
  const ids = [...comHistorico.map((h) => h.produtoId), ...(semHistorico ? [semHistorico.id] : [])];
  const custo = await ultimoCustoPorProduto(ids);
  const itens = ids.map((produtoId) => ({ produtoId, quantidade: new Prisma.Decimal(2) }));

  try {
    await prisma.$transaction(async (tx) => {
      const [atacado, normal] = await Promise.all([
        tx.supplier.create({ data: { name: "TESTE atacado", compraNoAtacado: true, deliveryDays: 3 } }),
        tx.supplier.create({ data: { name: "TESTE normal", deliveryDays: 3 } }),
      ]);

      const pa = await tx.pedidoCompra.create({
        data: { fornecedorId: atacado.id, ...dadosDoPedidoDireto(atacado, itens, custo) },
        include: { itens: true },
      });
      confere("atacado sem token", pa.token === null);
      confere("atacado sem previsão de entrega", pa.dataEntregaPrevista === null);
      confere("atacado com preço combinado em branco", pa.itens.every((i) => i.precoUnitario === null));
      confere(
        "atacado com o estimado = último custo",
        pa.itens.every((i) => {
          const u = custo.get(i.produtoId)?.valor;
          return u === undefined ? i.precoEstimado === null : i.precoEstimado?.toNumber() === u;
        }),
        pa.itens.map((i) => i.precoEstimado?.toString() ?? "—").join(", "),
      );

      const pn = await tx.pedidoCompra.create({
        data: { fornecedorId: normal.id, ...dadosDoPedidoDireto(normal, itens, custo) },
        include: { itens: true },
      });
      confere("normal com token", typeof pn.token === "string" && pn.token.length > 0);
      confere("normal com previsão pelo prazo", pn.dataEntregaPrevista !== null);
      confere("normal sem estimado", pn.itens.every((i) => i.precoEstimado === null));

      throw new Desfazer();
    });
  } catch (e) {
    if (!(e instanceof Desfazer)) throw e;
  }

  confere("rótulo do atacado", rotuloDoPedido("CRIADO", true).texto === "a comprar no atacado");
  confere("rótulo normal intacto", rotuloDoPedido("CRIADO").texto === "a enviar");
  confere("atacado recebido continua 'entregue'", rotuloDoPedido("ENTREGUE", true).texto === "entregue");

  const sobrou = await prisma.supplier.count({ where: { name: { startsWith: "TESTE " } } });
  confere("nada ficou no banco", sobrou === 0);

  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main();
