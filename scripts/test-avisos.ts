/**
 * Avisos de Compras: a resposta do fornecedor pelo link do pedido gera os
 * avisos certos, sem duplicar a falta ao reenviar, e o "em falta" some do
 * número do menu quando ele deixa de faltar.
 *
 * Cria um fornecedor e um pedido de TESTE, roda a ação de verdade e apaga
 * tudo no fim (o aviso cai junto com o pedido e o fornecedor — SetNull —, e é
 * apagado explicitamente). `--manter` deixa os dados para olhar na tela.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/test-avisos.ts [--manter]
 */
import { prisma } from "@/lib/db";
import { confirmarPedidoDireto } from "@/lib/actions/pedido";
import { novoToken } from "@/lib/token";

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "✓" : "✗"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas += 1;
}

async function main() {
  const manter = process.argv.includes("--manter");
  const produtos = await prisma.product.findMany({
    where: { isActive: true },
    select: { id: true },
    take: 2,
    orderBy: { id: "asc" },
  });
  const fornecedor = await prisma.supplier.create({ data: { name: "TESTE avisos (apagar)" } });
  const token = novoToken();
  const pedido = await prisma.pedidoCompra.create({
    data: {
      fornecedorId: fornecedor.id,
      token,
      precoTotal: 0,
      itens: { create: produtos.map((p) => ({ produtoId: p.id, quantidadeSolicitada: 4 })) },
    },
    select: { id: true, itens: { select: { id: true }, orderBy: { id: "asc" } } },
  });
  const [a, b] = pedido.itens.map((i) => i.id);
  const avisos = () =>
    prisma.avisoCompra.findMany({ where: { pedidoId: pedido.id }, orderBy: { id: "asc" } });
  const faltasAbertas = () =>
    prisma.avisoCompra.count({ where: { pedidoId: pedido.id, pedeAcao: true, resolvidoEm: null } });

  try {
    // As ações chamam revalidatePath, que fora do Next falha DEPOIS de gravar:
    // o teste confere o banco, não o retorno.
    const hoje = new Date().toISOString().slice(0, 10);
    await confirmarPedidoDireto(token, { [a]: { precoUnitario: 10, marca: "", observacoes: "" } }, hoje, [b]);
    let l = await avisos();
    confere("1º envio gera 'respondeu'", l.some((x) => x.tipo === "PEDIDO_RESPONDIDO"), l.map((x) => x.titulo).join(" | "));
    const falta = l.find((x) => x.tipo === "ITEM_EM_FALTA");
    confere("1º envio gera 'em falta' que pede ação", falta?.pedeAcao === true, falta?.detalhe ?? "—");
    confere("o 'em falta' guarda o item para comprar de outro", Array.isArray(falta?.itens) && (falta!.itens as unknown[]).length === 1);
    confere("o detalhe traz preço e entrega", /com preço/.test(l[0].detalhe ?? "") && /entrega/.test(l[0].detalhe ?? ""), l[0].detalhe ?? "");
    confere("uma falta aberta", (await faltasAbertas()) === 1);

    await confirmarPedidoDireto(token, { [a]: { precoUnitario: 11, marca: "", observacoes: "" } }, null, [b]);
    l = await avisos();
    confere("reenviar a mesma falta não duplica", l.filter((x) => x.tipo === "ITEM_EM_FALTA").length === 1);
    confere("reenviar gera outro 'respondeu'", l.filter((x) => x.tipo === "PEDIDO_RESPONDIDO").length === 2);

    await confirmarPedidoDireto(
      token,
      {
        [a]: { precoUnitario: 11, marca: "", observacoes: "" },
        [b]: { precoUnitario: 3, marca: "", observacoes: "" },
      },
      null,
      [],
    );
    confere("deixou de faltar: a falta se resolve sozinha", (await faltasAbertas()) === 0);

    if (manter) {
      // Volta a falta, para aparecer na tela.
      await confirmarPedidoDireto(token, { [a]: { precoUnitario: 11, marca: "", observacoes: "" } }, null, [b]);
      console.log(`\nMantido para olhar: fornecedor ${fornecedor.id}, pedido ${pedido.id}, token ${token}`);
    }
  } finally {
    if (!manter) {
      await prisma.avisoCompra.deleteMany({ where: { OR: [{ pedidoId: pedido.id }, { fornecedorId: fornecedor.id }] } });
      await prisma.pedidoCompra.delete({ where: { id: pedido.id } });
      await prisma.supplier.delete({ where: { id: fornecedor.id } });
      const sobrou = await prisma.supplier.count({ where: { name: { startsWith: "TESTE avisos" } } });
      confere("nada ficou no banco", sobrou === 0);
    }
  }

  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main();
