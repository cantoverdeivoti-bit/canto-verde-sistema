"use server";

import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth-guard";
import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { limparContadores } from "@/lib/contadores";
import { DIAS_DA_SEMANA, diaDaqui, lerNumeroBR } from "@/lib/format";
import { nomeDaLista } from "@/lib/lista-compra";
import { foraDoLote } from "@/lib/pedido";
import { inicioDeHoje } from "@/lib/requisicao";
import { novoToken } from "@/lib/token";
import { Prisma } from "@/generated/prisma/client";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type Simples = { ok: boolean; message?: string };

function diaValido(dia: number) {
  return Number.isInteger(dia) && dia >= 0 && dia <= 6;
}

function feito() {
  revalidatePath("/admin/compras", "layout");
  limparContadores();
}

/**
 * A compra de rotina é fornecedor + dia da semana (`ListaCompra`), com os
 * produtos e o estoque ideal de cada um naquele dia (`ListaCompraItem`).
 * Cadastra-se um dia por vez: "Hortifruti, segunda: abacaxi 10, morango 20".
 * O ideal é obrigatório e só dela; o do cadastro do produto não entra.
 */

export type ItemDoDia = { produtoId: number; ideal: string };

/** "10" ou "2,5" → número; vazio, negativo ou absurdo → nulo. */
function lerIdeal(texto: string): number | null {
  const n = lerNumeroBR(texto.trim());
  return n === null || !Number.isFinite(n) || n <= 0 || n > 999999 ? null : n;
}

/**
 * Grava um dia da compra de rotina, inteiro: cria (sem `listaId`) ou troca
 * os produtos e ideais do dia pelo que veio. Produto que saiu da tela sai do
 * dia; os pedidos que já saíram dele continuam.
 */
export async function salvarDiaDaRotina(dados: {
  listaId: number | null;
  fornecedorId: number;
  dia: number;
  itens: ItemDoDia[];
}): Promise<Result<{ listaId: number }>> {
  await requireModule("compras", { atalho: true });
  if (!diaValido(dados.dia)) return { ok: false, message: "Escolha o dia da semana." };
  if (dados.itens.length === 0) return { ok: false, message: "Escolha ao menos um produto." };

  const produtoIds = dados.itens.map((i) => i.produtoId);
  if (produtoIds.some((id) => !Number.isInteger(id)) || new Set(produtoIds).size !== produtoIds.length) {
    return { ok: false, message: "Produto repetido. Recarregue a tela." };
  }
  const [fornecedor, produtos] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: dados.fornecedorId, isActive: true }, select: { name: true, apelido: true } }),
    prisma.product.findMany({ where: { id: { in: produtoIds }, isActive: true }, select: { id: true, name: true } }),
  ]);
  if (!fornecedor) return { ok: false, message: "Escolha o fornecedor." };
  const nomeDo = new Map(produtos.map((p) => [p.id, p.name]));

  const ideais: { produtoId: number; ideal: Prisma.Decimal }[] = [];
  for (const i of dados.itens) {
    const nome = nomeDo.get(i.produtoId);
    if (!nome) return { ok: false, message: "Um dos produtos foi desativado. Recarregue a tela." };
    const ideal = lerIdeal(i.ideal);
    if (ideal === null) return { ok: false, message: `Digite o estoque ideal de ${nome}.` };
    ideais.push({ produtoId: i.produtoId, ideal: new Prisma.Decimal(ideal.toFixed(3)) });
  }

  try {
    const listaId = await prisma.$transaction(async (tx) => {
      // O mesmo fornecedor e dia é uma compra de rotina só. A trava é a do
      // fornecedor: dois "Salvar" ao mesmo tempo não criam dois dias iguais.
      await tx.$queryRaw`SELECT id FROM "suppliers" WHERE id = ${dados.fornecedorId} FOR UPDATE`;
      const outra = await tx.listaCompra.findFirst({
        where: {
          fornecedorId: dados.fornecedorId,
          diaSemana: dados.dia,
          ...(dados.listaId === null ? {} : { id: { not: dados.listaId } }),
        },
        select: { id: true },
      });
      if (outra) throw new Error("DIA_JA_EXISTE");

      let id = dados.listaId;
      if (id === null) {
        id = (
          await tx.listaCompra.create({
            data: { fornecedorId: dados.fornecedorId, diaSemana: dados.dia, nome: nomeDaLista(fornecedor, dados.dia) },
            select: { id: true },
          })
        ).id;
      } else {
        const r = await tx.listaCompra.updateMany({
          where: { id, fornecedorId: dados.fornecedorId },
          data: { diaSemana: dados.dia, nome: nomeDaLista(fornecedor, dados.dia) },
        });
        if (r.count === 0) throw new Error("SUMIU");
      }
      await tx.listaCompraItem.deleteMany({ where: { listaId: id, produtoId: { notIn: produtoIds } } });
      for (const i of ideais) {
        await tx.listaCompraItem.upsert({
          where: { listaId_produtoId: { listaId: id, produtoId: i.produtoId } },
          create: { listaId: id, produtoId: i.produtoId, idealStock: i.ideal },
          update: { idealStock: i.ideal },
        });
      }
      return id;
    });
    feito();
    return { ok: true, data: { listaId } };
  } catch (err) {
    if (err instanceof Error && err.message === "DIA_JA_EXISTE") {
      return { ok: false, message: `${fornecedor.apelido ?? fornecedor.name} já tem compra de rotina na ${DIAS_DA_SEMANA[dados.dia]}.` };
    }
    if (err instanceof Error && err.message === "SUMIU") return { ok: false, message: "Esta compra de rotina foi apagada." };
    console.error("[salvarDiaDaRotina] falha:", err);
    return { ok: false, message: "Não foi possível salvar." };
  }
}

/** Liga ou desliga um dia. Desligado, a contagem não vira pedido e ele some de hoje. */
export async function ligarDiaDaRotina(listaId: number, ativa: boolean): Promise<Simples> {
  await requireModule("compras", { atalho: true });
  await prisma.listaCompra.updateMany({ where: { id: listaId }, data: { ativa } });
  feito();
  return { ok: true };
}

/** Apaga um dia da compra de rotina. Os pedidos que saíram dele continuam. */
export async function apagarDiaDaRotina(listaId: number): Promise<Simples> {
  await requireModule("compras");
  await prisma.listaCompra.deleteMany({ where: { id: listaId } });
  feito();
  return { ok: true };
}

/**
 * O pedido da Requisição feito com a contagem geral do dia: a tela mostrou
 * a sugestão (`sugestaoDaRequisicao`), ele conferiu e ajustou, e aqui vale o
 * que ele mandou.
 *
 * Uma Requisição, um pedido por dia: a trava é a linha da Requisição
 * (`FOR UPDATE`), e não a leitura antes — dois toques no botão passariam os
 * dois por uma checagem solta e virariam dois pedidos iguais.
 *
 * A contagem geral não é ligada ao pedido: `contagemId` e `processadaEm` a
 * dariam por gasta, e ela ainda serve para a cotação dos outros produtos.
 */
export async function pedidoDaRequisicao(
  listaId: number,
  quantidades: { produtoId: number; quantidade: number }[],
): Promise<Result<{ id: number }>> {
  await requireModule("compras", { atalho: true });

  const pedir = quantidades.filter((q) => Number.isFinite(q.quantidade) && q.quantidade > 0);
  if (pedir.length === 0) return { ok: false, message: "Nada a pedir: preencha ao menos uma quantidade." };
  if (pedir.some((q) => !Number.isInteger(q.produtoId) || q.quantidade > 999999)) {
    return { ok: false, message: "Quantidade inválida." };
  }

  const [lista, { capacity }] = await Promise.all([
    prisma.listaCompra.findUnique({
      where: { id: listaId },
      select: {
        fornecedorId: true,
        fornecedor: { select: { deliveryDays: true, isActive: true } },
        itens: {
          where: { produto: { isActive: true } },
          select: { produto: { select: { id: true, name: true, lotSize: true } } },
        },
      },
    }),
    getSettings(),
  ]);
  if (!lista) return { ok: false, message: "Compra de rotina não encontrada." };
  if (!lista.fornecedor.isActive) return { ok: false, message: "O fornecedor desta compra de rotina está desativado." };

  const daLista = new Map(lista.itens.map((i) => [i.produto.id, i.produto]));
  const porProduto = new Map<number, number>();
  for (const q of pedir) {
    const p = daLista.get(q.produtoId);
    if (!p) return { ok: false, message: "Um dos produtos não está mais na compra de rotina. Recarregue a tela." };
    const recusa = foraDoLote(p.name, q.quantidade, p.lotSize?.toNumber() ?? null);
    if (recusa) return { ok: false, message: recusa };
    porProduto.set(q.produtoId, q.quantidade);
  }

  try {
    const r = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "listas_compra" WHERE id = ${listaId} FOR UPDATE`;
      const ja = await tx.pedidoCompra.findFirst({
        where: {
          listaCompraId: listaId,
          createdAt: { gte: inicioDeHoje(capacity.timezone) },
          estatus: { not: "CANCELADO" },
        },
        select: { id: true },
      });
      if (ja) return { ja: ja.id };
      const prazo = lista.fornecedor.deliveryDays;
      const pedido = await tx.pedidoCompra.create({
        data: {
          fornecedorId: lista.fornecedorId,
          listaCompraId: listaId,
          dataEntregaPrevista: prazo === null ? null : diaDaqui(prazo),
          precoTotal: 0,
          itens: {
            createMany: {
              data: [...porProduto].map(([produtoId, q]) => ({
                produtoId,
                quantidadeSolicitada: new Prisma.Decimal(q.toFixed(3)),
                precoUnitario: null,
              })),
            },
          },
        },
        select: { id: true },
      });
      return { id: pedido.id };
    });
    if ("ja" in r) return { ok: false, message: `A compra de rotina de hoje já tem o pedido #${r.ja}.` };
    feito();
    return { ok: true, data: { id: r.id } };
  } catch (err) {
    console.error("[pedidoDaRequisicao] falha:", err);
    return { ok: false, message: "Não foi possível criar o pedido." };
  }
}

/**
 * Abre a contagem da compra de rotina: só os produtos dela, no link do
 * estoquista. Ao finalizar, o pedido direto para o fornecedor da lista nasce
 * na hora (`pedidoDaLista`), sem depender da contagem geral de estoque.
 *
 * Se a lista já tem uma contagem aberta (não finalizada, não cancelada e no
 * prazo), devolve essa: "Contar agora" e "Mandar link" abrem a mesma
 * contagem pelos dois lados, e duas abertas virariam dois pedidos.
 */
export async function abrirContagemDaLista(listaId: number): Promise<Result<{ id: number; token: string }>> {
  const usuario = await requireModule("compras", { atalho: true });

  const lista = await prisma.listaCompra.findUnique({
    where: { id: listaId },
    select: {
      ativa: true,
      prazoHoras: true,
      itens: { select: { produto: { select: { id: true, isActive: true, categoryId: true } } } },
    },
  });
  if (!lista) return { ok: false, message: "Compra de rotina não encontrada." };
  if (!lista.ativa) return { ok: false, message: "Esta compra de rotina está desligada. Ligue antes de contar." };

  const aberta = await prisma.contagem.findFirst({
    where: { listaCompraId: listaId, concluida: false, canceladaEm: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true },
  });
  if (aberta) return { ok: true, data: aberta };

  // Só os ativos, como na contagem por categoria: produto desligado não se
  // procura na prateleira.
  const produtos = lista.itens.map((i) => i.produto).filter((p) => p.isActive);
  if (produtos.length === 0) {
    return { ok: false, message: "A compra de rotina não tem produto ativo. Acrescente antes de contar." };
  }

  try {
    const contagem = await prisma.contagem.create({
      data: {
        token: novoToken(),
        expiresAt: new Date(Date.now() + lista.prazoHoras * 60 * 60 * 1000),
        categoryIds: [...new Set(produtos.map((p) => p.categoryId).filter((c): c is number => c !== null))],
        responsavelId: usuario.id,
        listaCompraId: listaId,
        itens: { createMany: { data: produtos.map((p) => ({ produtoId: p.id })) } },
      },
      select: { id: true, token: true },
    });
    feito();
    return { ok: true, data: contagem };
  } catch (err) {
    console.error("[abrirContagemDaLista] falha:", err);
    return { ok: false, message: "Não foi possível abrir a contagem." };
  }
}
