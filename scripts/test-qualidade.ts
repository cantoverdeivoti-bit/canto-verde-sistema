/**
 * Estrelas de qualidade: a regra da nota e as médias por produto e por marca.
 *
 * Cria um produto, um fornecedor e um pedido de TESTE, grava notas direto no
 * banco e confere as leituras; apaga tudo no fim.
 *
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/test-qualidade.ts
 */
import { prisma } from "@/lib/db";
import { lerQualidadeDoProduto, mediasPorMarca, mediasPorProduto } from "@/lib/qualidade";
import { chaveDaMarca, erroDaNota } from "@/lib/qualidade-regra";

let falhas = 0;
function confere(nome: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "✓" : "✗"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas += 1;
}

async function main() {
  // A regra.
  confere("sem nota é recusado", erroDaNota(null, "", "Tilápia") !== null);
  confere("nota 0 é recusada", erroDaNota(0, "", "Tilápia") !== null);
  confere("nota 6 é recusada", erroDaNota(6, "", "Tilápia") !== null);
  confere("nota 2,5 é recusada", erroDaNota(2.5, "", "Tilápia") !== null);
  confere("2 sem comentário é recusado", erroDaNota(2, "  ", "Tilápia") !== null, erroDaNota(2, "", "Tilápia") ?? "");
  confere("2 com comentário passa", erroDaNota(2, "peixe mole", "Tilápia") === null);
  confere("5 sem comentário passa", erroDaNota(5, "", "Tilápia") === null);
  confere("marca sem maiúscula e espaço", chaveDaMarca(" Leke ") === "leke" && chaveDaMarca(null) === "sem marca");

  // As médias, com dados de teste.
  const unidade = await prisma.product.findFirst({ select: { categoryId: true } });
  const produto = await prisma.product.create({
    data: { name: "TESTE qualidade (apagar)", unit: "KG", avaliarQualidade: true, categoryId: unidade?.categoryId ?? null },
  });
  const fornecedor = await prisma.supplier.create({ data: { name: "TESTE qualidade forn (apagar)" } });
  const pedidos: number[] = [];
  try {
    const itens: number[] = [];
    for (const marca of ["Leke", "leke ", "Outra"]) {
      const p = await prisma.pedidoCompra.create({
        data: {
          fornecedorId: fornecedor.id,
          precoTotal: 0,
          entregaConfirmada: true,
          itens: { create: { produtoId: produto.id, quantidadeSolicitada: 2, quantidadeRecebida: 2, marca } },
        },
        select: { id: true, itens: { select: { id: true } } },
      });
      pedidos.push(p.id);
      itens.push(p.itens[0].id);
    }
    const nota = (i: number, origem: "RECEBIMENTO" | "DONO", n: number, marca: string) =>
      prisma.avaliacaoQualidade.create({
        data: { produtoId: produto.id, pedidoCompraItemId: itens[i], fornecedorId: fornecedor.id, marca, origem, nota: n },
      });
    await nota(0, "RECEBIMENTO", 5, "Leke");
    await nota(0, "DONO", 4, "Leke");
    await nota(1, "RECEBIMENTO", 3, "leke ");
    await nota(2, "RECEBIMENTO", 1, "Outra");

    const geral = (await mediasPorProduto([produto.id])).get(produto.id);
    confere("média geral (5+4+3+1)/4 = 3,3", geral?.media === 3.3 && geral.n === 4, JSON.stringify(geral));
    const porMarca = await mediasPorMarca([produto.id]);
    const leke = porMarca.get(`${produto.id}|leke`);
    confere("Leke e 'leke ' são a mesma marca: (5+4+3)/3 = 4", leke?.media === 4 && leke.n === 3, JSON.stringify(leke));
    confere("Outra marca: 1", porMarca.get(`${produto.id}|outra`)?.media === 1);
    const painel = await lerQualidadeDoProduto(produto.id);
    const e0 = painel.entregas.find((e) => e.pedidoCompraItemId === itens[0]);
    confere("entrega junta as duas notas", e0?.recebimento?.nota === 5 && e0?.dono?.nota === 4);
    confere("três entregas no painel", painel.entregas.length === 3);

    let duplicou = false;
    try {
      await nota(0, "DONO", 2, "Leke");
      duplicou = true;
    } catch {
      duplicou = false;
    }
    confere("uma nota do dono por entrega", !duplicou);
  } finally {
    await prisma.avaliacaoQualidade.deleteMany({ where: { produtoId: produto.id } });
    await prisma.pedidoCompra.deleteMany({ where: { id: { in: pedidos } } });
    await prisma.product.delete({ where: { id: produto.id } });
    await prisma.supplier.delete({ where: { id: fornecedor.id } });
    const sobrou = await prisma.product.count({ where: { name: { startsWith: "TESTE qualidade" } } });
    confere("nada ficou no banco", sobrou === 0);
  }

  console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}

main();
