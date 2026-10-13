import { prisma } from "../lib/db";
import { pedidoDaLista } from "../lib/lista-compra";
import { novoToken } from "../lib/token";

/**
 * A compra direta que nasce da contagem da compra de rotina (`pedidoDaLista`),
 * no banco: ideal menos contado, lote, o link de preço, juntar no pedido de
 * hoje ainda não enviado, o enviado que não muda, nada a pedir e o atacado.
 * Cria fornecedores, produtos e listas de teste e apaga no fim. Só no banco
 * local: `source /var/tmp/pgrender/env.sh && npx tsx scripts/test-rotina.ts`.
 */

let falhas = 0;
function igual<T>(nome: string, obtido: T, esperado: T) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) console.log(`ok  ${nome}`);
  else {
    falhas++;
    console.log(`ERRO ${nome}\n     obtido:   ${a}\n     esperado: ${b}`);
  }
}

const PREFIXO = "teste-rotina-";

async function limpar() {
  const fornecedores = await prisma.supplier.findMany({ where: { name: { startsWith: PREFIXO } }, select: { id: true } });
  const ids = fornecedores.map((f) => f.id);
  await prisma.pedidoCompra.deleteMany({ where: { fornecedorId: { in: ids } } });
  await prisma.contagem.deleteMany({ where: { listaCompra: { fornecedorId: { in: ids } } } });
  await prisma.listaCompra.deleteMany({ where: { fornecedorId: { in: ids } } });
  await prisma.product.deleteMany({ where: { name: { startsWith: PREFIXO } } });
  await prisma.supplier.deleteMany({ where: { id: { in: ids } } });
}

/** Uma contagem da lista com o que foi contado, e o pedido que sai ao fechar. */
async function contar(listaId: number, contados: Record<number, number>) {
  const contagem = await prisma.contagem.create({
    data: {
      token: novoToken(),
      expiresAt: new Date(Date.now() + 3600_000),
      categoryIds: [],
      listaCompraId: listaId,
      concluida: true,
      itens: {
        createMany: { data: Object.entries(contados).map(([id, q]) => ({ produtoId: Number(id), quantidadeContada: q })) },
      },
    },
    select: { id: true },
  });
  const r = await prisma.$transaction((tx) => pedidoDaLista(tx, contagem.id, listaId));
  return { ...r, contagemId: contagem.id };
}

async function itensDo(pedidoId: number) {
  const itens = await prisma.pedidoCompraItem.findMany({
    where: { pedidoCompraId: pedidoId },
    orderBy: { produtoId: "asc" },
    select: { produto: { select: { name: true } }, quantidadeSolicitada: true, precoEstimado: true },
  });
  return itens.map((i) => [i.produto.name.slice(PREFIXO.length), i.quantidadeSolicitada.toNumber(), i.precoEstimado?.toNumber() ?? null]);
}

async function main() {
  await limpar();
  const forn = await prisma.supplier.create({ data: { name: `${PREFIXO}hortifruti`, deliveryDays: 1 } });
  const [abacaxi, morango, alface] = await Promise.all(
    [
      { name: `${PREFIXO}abacaxi`, lotSize: null },
      { name: `${PREFIXO}morango`, lotSize: 6 },
      { name: `${PREFIXO}alface`, lotSize: null },
    ].map((p) => prisma.product.create({ data: { name: p.name, unit: "UN", lotSize: p.lotSize } })),
  );
  const lista = await prisma.listaCompra.create({
    data: {
      nome: "teste",
      fornecedorId: forn.id,
      diaSemana: 1,
      itens: {
        createMany: {
          data: [
            { produtoId: abacaxi.id, idealStock: 10 },
            { produtoId: morango.id, idealStock: 24 },
            { produtoId: alface.id, idealStock: 5 },
          ],
        },
      },
    },
  });

  // Abacaxi: 10 - 3 = 7. Morango: 24 - 10 = 14, lote de 6: 12. Alface não contado: fica de fora.
  const r1 = await contar(lista.id, { [abacaxi.id]: 3, [morango.id]: 10 });
  igual("pedido nasce", r1.pedidoId !== null, true);
  igual("ideal menos contado, no lote", await itensDo(r1.pedidoId!), [
    ["abacaxi", 7, null],
    ["morango", 12, null],
  ]);
  const p1 = await prisma.pedidoCompra.findUnique({
    where: { id: r1.pedidoId! },
    select: { token: true, contagemId: true, listaCompraId: true, estatus: true, dataEntregaPrevista: true },
  });
  igual("pedido direto: link de preço, contagem e lista", [p1!.token !== null, p1!.contagemId, p1!.listaCompraId, p1!.estatus, p1!.dataEntregaPrevista !== null], [true, r1.contagemId, lista.id, "CRIADO", true]);
  igual("contagem marcada como usada", (await prisma.contagem.findUnique({ where: { id: r1.contagemId } }))!.processadaEm !== null, true);

  // Contar de novo no mesmo dia: a alface que faltava entra no mesmo pedido.
  const r2 = await contar(lista.id, { [alface.id]: 1, [abacaxi.id]: 0 });
  igual("junta no pedido de hoje", r2.pedidoId, r1.pedidoId);
  igual("só o que faltava entra", await itensDo(r1.pedidoId!), [
    ["abacaxi", 7, null],
    ["morango", 12, null],
    ["alface", 4, null],
  ]);

  // Enviado, o pedido não muda.
  await prisma.pedidoCompra.update({ where: { id: r1.pedidoId! }, data: { estatus: "ENVIADO" } });
  await prisma.pedidoCompraItem.deleteMany({ where: { pedidoCompraId: r1.pedidoId!, produto: { name: `${PREFIXO}alface` } } });
  const r3 = await contar(lista.id, { [alface.id]: 0 });
  igual("enviado não muda", [r3.recado.includes("já foi enviado"), (await itensDo(r1.pedidoId!)).length], [true, 2]);

  // Outra lista, tudo no ideal: nada a pedir.
  const lista2 = await prisma.listaCompra.create({
    data: { nome: "teste 2", fornecedorId: forn.id, diaSemana: 2, itens: { create: { produtoId: abacaxi.id, idealStock: 10 } } },
  });
  const r4 = await contar(lista2.id, { [abacaxi.id]: 12 });
  igual("nada a pedir", [r4.pedidoId, r4.recado.startsWith("Nada para pedir")], [null, true]);

  // Atacado: sem link, com o preço estimado do último custo.
  const atacado = await prisma.supplier.create({ data: { name: `${PREFIXO}atacado`, compraNoAtacado: true, deliveryDays: 1 } });
  const lista3 = await prisma.listaCompra.create({
    data: { nome: "teste 3", fornecedorId: atacado.id, diaSemana: 3, itens: { create: { produtoId: abacaxi.id, idealStock: 10 } } },
  });
  const r5 = await contar(lista3.id, { [abacaxi.id]: 4 });
  const p5 = await prisma.pedidoCompra.findUnique({ where: { id: r5.pedidoId! }, select: { token: true, dataEntregaPrevista: true } });
  igual("atacado: sem link e sem previsão", [p5!.token, p5!.dataEntregaPrevista], [null, null]);

  await limpar();
  if (falhas > 0) {
    console.log(`\n${falhas} falha(s).`);
    process.exit(1);
  }
  console.log("\nTudo certo.");
}

main()
  .catch(async (e) => {
    console.error(e);
    await limpar();
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
