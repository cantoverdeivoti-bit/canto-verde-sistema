import { prisma } from "@/lib/db";
import { arredondaMedia, chaveDaMarca, type Media } from "@/lib/qualidade-regra";

/**
 * As leituras das estrelas de qualidade. Média simples de todas as notas —
 * de quem recebeu e do dono —, e a tela sempre diz quantas são ("★ 4,2 (7)"):
 * uma nota sozinha não é média de nada.
 */

/** A média geral de cada produto avaliado. Sem lista, o catálogo inteiro. */
export async function mediasPorProduto(produtoIds?: number[]): Promise<Map<number, Media>> {
  if (produtoIds?.length === 0) return new Map();
  const linhas = await prisma.avaliacaoQualidade.groupBy({
    by: ["produtoId"],
    where: produtoIds ? { produtoId: { in: produtoIds } } : undefined,
    _sum: { nota: true },
    _count: { _all: true },
  });
  return new Map(
    linhas.map((l) => [l.produtoId, { media: arredondaMedia(l._sum.nota ?? 0, l._count._all), n: l._count._all }]),
  );
}

/** A média de cada fornecedor, em tudo o que ele entregou e foi avaliado. */
export async function mediasPorFornecedor(fornecedorIds?: number[]): Promise<Map<number, Media>> {
  if (fornecedorIds?.length === 0) return new Map();
  const linhas = await prisma.avaliacaoQualidade.groupBy({
    by: ["fornecedorId"],
    where: { fornecedorId: fornecedorIds ? { in: fornecedorIds } : { not: null } },
    _sum: { nota: true },
    _count: { _all: true },
  });
  return new Map(
    linhas
      .filter((l) => l.fornecedorId !== null)
      .map((l) => [l.fornecedorId!, { media: arredondaMedia(l._sum.nota ?? 0, l._count._all), n: l._count._all }]),
  );
}

/** A média de cada marca de cada produto: a chave é `produtoId|marca`. */
export async function mediasPorMarca(produtoIds: number[]): Promise<Map<string, Media>> {
  if (produtoIds.length === 0) return new Map();
  const notas = await prisma.avaliacaoQualidade.findMany({
    where: { produtoId: { in: produtoIds } },
    select: { produtoId: true, marca: true, nota: true },
  });
  const soma = new Map<string, { s: number; n: number }>();
  for (const a of notas) {
    const k = `${a.produtoId}|${chaveDaMarca(a.marca)}`;
    const atual = soma.get(k) ?? { s: 0, n: 0 };
    soma.set(k, { s: atual.s + a.nota, n: atual.n + 1 });
  }
  return new Map([...soma].map(([k, v]) => [k, { media: arredondaMedia(v.s, v.n), n: v.n }]));
}

export type EntregaAvaliada = {
  pedidoCompraItemId: number;
  pedidoId: number;
  /** ISO da entrega. */
  em: string | null;
  fornecedor: string | null;
  marca: string | null;
  recebimento: { nota: number; comentario: string | null; autor: string | null } | null;
  dono: { nota: number; comentario: string | null } | null;
};

export type QualidadeDoProduto = {
  geral: Media | null;
  porMarca: (Media & { marca: string })[];
  porFornecedor: (Media & { fornecedor: string })[];
  entregas: EntregaAvaliada[];
};

/** Tudo o que o painel do produto mostra: médias e as últimas entregas avaliadas. */
export async function lerQualidadeDoProduto(produtoId: number): Promise<QualidadeDoProduto> {
  const notas = await prisma.avaliacaoQualidade.findMany({
    where: { produtoId },
    orderBy: { createdAt: "desc" },
    select: {
      pedidoCompraItemId: true,
      origem: true,
      nota: true,
      comentario: true,
      marca: true,
      fornecedor: { select: { name: true, apelido: true } },
      autor: { select: { name: true, username: true } },
      pedidoCompraItem: { select: { pedidoCompraId: true, pedidoCompra: { select: { dataEntregaReal: true } } } },
    },
  });

  const agrupa = <K extends string>(chave: (a: (typeof notas)[number]) => K) => {
    const m = new Map<K, { s: number; n: number }>();
    for (const a of notas) {
      const k = chave(a);
      const atual = m.get(k) ?? { s: 0, n: 0 };
      m.set(k, { s: atual.s + a.nota, n: atual.n + 1 });
    }
    return [...m].map(([k, v]) => ({ k, media: arredondaMedia(v.s, v.n), n: v.n })).sort((x, y) => y.media - x.media);
  };

  // Uma entrega por item de pedido, com as duas notas lado a lado.
  const entregas = new Map<number, EntregaAvaliada>();
  for (const a of notas) {
    const e = entregas.get(a.pedidoCompraItemId) ?? {
      pedidoCompraItemId: a.pedidoCompraItemId,
      pedidoId: a.pedidoCompraItem.pedidoCompraId,
      em: a.pedidoCompraItem.pedidoCompra.dataEntregaReal?.toISOString() ?? null,
      fornecedor: a.fornecedor ? (a.fornecedor.apelido ?? a.fornecedor.name) : null,
      marca: a.marca,
      recebimento: null,
      dono: null,
    };
    if (a.origem === "RECEBIMENTO") {
      e.recebimento = { nota: a.nota, comentario: a.comentario, autor: a.autor?.name ?? a.autor?.username ?? null };
    } else {
      e.dono = { nota: a.nota, comentario: a.comentario };
    }
    entregas.set(a.pedidoCompraItemId, e);
  }

  const total = notas.reduce((s, a) => s + a.nota, 0);
  return {
    geral: notas.length === 0 ? null : { media: arredondaMedia(total, notas.length), n: notas.length },
    porMarca: agrupa((a) => (a.marca?.trim() ? a.marca.trim() : "sem marca")).map((x) => ({ marca: x.k, media: x.media, n: x.n })),
    porFornecedor: agrupa((a) => (a.fornecedor ? (a.fornecedor.apelido ?? a.fornecedor.name) : "—")).map((x) => ({
      fornecedor: x.k,
      media: x.media,
      n: x.n,
    })),
    entregas: [...entregas.values()].slice(0, 10),
  };
}
