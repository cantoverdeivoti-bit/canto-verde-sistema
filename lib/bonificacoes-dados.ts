import type { BonificacaoParaMostrar } from "@/lib/bonificacoes";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * As consultas das bonificações, para as telas: já no formato que os
 * componentes mostram (números simples, nome do produto resolvido).
 */

const CAMPOS = {
  id: true,
  tipo: true,
  estado: true,
  quantidade: true,
  valor: true,
  nota: true,
  quantidadeRecebida: true,
  fornecedorId: true,
  pedidoCompraId: true,
  produto: { select: { name: true, unit: true } },
} satisfies Prisma.BonificacaoSelect;

type Linha = Prisma.BonificacaoGetPayload<{ select: typeof CAMPOS }>;

export function paraMostrar(b: Linha): BonificacaoParaMostrar {
  return {
    id: b.id,
    tipo: b.tipo,
    estado: b.estado,
    produto: b.produto ? { nome: b.produto.name, unidade: b.produto.unit } : null,
    quantidade: b.quantidade?.toNumber() ?? null,
    valor: b.valor?.toNumber() ?? null,
    nota: b.nota,
    quantidadeRecebida: b.quantidadeRecebida?.toNumber() ?? null,
  };
}

/** As bonificações de uma cotação, por fornecedor — as ainda na cotação e as que já foram para o pedido. */
export async function bonificacoesDaCotacao(cotacaoId: number): Promise<Map<number, BonificacaoParaMostrar[]>> {
  const linhas = await prisma.bonificacao.findMany({
    where: { OR: [{ cotacaoId }, { pedidoCompra: { cotacaoId } }] },
    orderBy: { id: "asc" },
    select: CAMPOS,
  });
  const mapa = new Map<number, BonificacaoParaMostrar[]>();
  for (const l of linhas) mapa.set(l.fornecedorId, [...(mapa.get(l.fornecedorId) ?? []), paraMostrar(l)]);
  return mapa;
}

/** As bonificações de vários pedidos, por pedido. */
export async function bonificacoesDosPedidos(pedidoIds: number[]): Promise<Map<number, BonificacaoParaMostrar[]>> {
  if (pedidoIds.length === 0) return new Map();
  const linhas = await prisma.bonificacao.findMany({
    where: { pedidoCompraId: { in: pedidoIds } },
    orderBy: { id: "asc" },
    select: CAMPOS,
  });
  const mapa = new Map<number, BonificacaoParaMostrar[]>();
  for (const l of linhas) mapa.set(l.pedidoCompraId!, [...(mapa.get(l.pedidoCompraId!) ?? []), paraMostrar(l)]);
  return mapa;
}

/** Os produtos que podem vir de brinde: todos os ativos, no formato do seletor de produto. */
export async function produtosParaBrinde() {
  const produtos = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true },
  });
  return produtos.map((p) => ({ id: p.id, nome: p.name, unidade: p.unit, lote: null, doFornecedor: true }));
}
