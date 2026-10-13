import { toInstant, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { sugeridoNaRequisicao } from "@/lib/requisicao-regras";
import type { Prisma, ProductUnit } from "@/generated/prisma/client";

export { sugeridoNaRequisicao };

/**
 * A compra de rotina (`ListaCompra`) é fornecedor + dia da semana:
 * "Hortifruti — segunda". Cada produto dela tem o ideal daquele dia,
 * obrigatório — o abacaxi da segunda cobre até quinta, o da quinta cobre o
 * fim de semana —, e o ideal do cadastro do produto não entra.
 *
 * O pedido dela nasce sozinho, ao finalizar a contagem da própria rotina
 * (`abrirContagemDaLista` e `pedidoDaLista`), ou à mão, em "Fazer pedido
 * agora", como saída de emergência. A conta é a mesma: ideal do dia menos o
 * contado, arredondado ao lote. A contagem geral de estoque não faz pedido
 * de rotina.
 *
 * Produto que está em alguma Requisição ativa não vai para a cotação: ele só
 * é pedido pelas Requisições (decisão do dono). `FORA_DAS_REQUISICOES` é o
 * filtro que a tela de conferência e a montagem da cotação usam juntas.
 */

/** Produtos que não estão em nenhuma Requisição ativa: os que podem ir para a cotação. */
export const FORA_DAS_REQUISICOES = {
  listasCompra: { none: { lista: { ativa: true } } },
} satisfies Prisma.ProductWhereInput;

/** O começo de hoje, no fuso da casa. */
export function inicioDeHoje(timezone: string): Date {
  return toInstant(todayInTimezone(timezone), "00:00", timezone);
}

/**
 * O último número contado hoje de cada produto, em qualquer contagem já
 * finalizada (a geral ou a da Requisição). A contagem que ainda está aberta
 * não vale: o número pode mudar até o estoquista finalizar.
 */
export async function contadosDeHoje(
  produtoIds: number[],
  timezone: string,
): Promise<Map<number, { quantidade: number; em: Date; contagemId: number }>> {
  if (produtoIds.length === 0) return new Map();
  const itens = await prisma.contagemItem.findMany({
    where: {
      produtoId: { in: produtoIds },
      quantidadeContada: { not: null },
      updatedAt: { gte: inicioDeHoje(timezone) },
      contagem: { concluida: true, canceladaEm: null },
    },
    orderBy: { updatedAt: "desc" },
    select: { produtoId: true, quantidadeContada: true, updatedAt: true, contagemId: true },
  });
  const out = new Map<number, { quantidade: number; em: Date; contagemId: number }>();
  for (const i of itens) {
    if (!out.has(i.produtoId)) {
      out.set(i.produtoId, { quantidade: i.quantidadeContada!.toNumber(), em: i.updatedAt, contagemId: i.contagemId });
    }
  }
  return out;
}

/** O pedido que a Requisição já tem hoje (pelos dois caminhos), se tem. */
export async function pedidoDeHojeDaRequisicao(listaId: number, timezone: string): Promise<number | null> {
  const p = await prisma.pedidoCompra.findFirst({
    where: { listaCompraId: listaId, createdAt: { gte: inicioDeHoje(timezone) }, estatus: { not: "CANCELADO" } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return p?.id ?? null;
}

export type LinhaDaRequisicao = {
  produtoId: number;
  nome: string;
  unidade: ProductUnit;
  /** O ideal deste dia na compra de rotina. */
  ideal: number | null;
  lote: number | null;
  contado: number | null;
  contadoEm: Date | null;
  sugerido: number | null;
  motivo: ReturnType<typeof sugeridoNaRequisicao>["motivo"];
  /** O estoquista sugeriu outro ideal e ninguém decidiu ainda. */
  idealSugeridoPendente: number | null;
};

/** O que a Requisição pede hoje, produto a produto, com a contagem de hoje. */
export async function sugestaoDaRequisicao(listaId: number, timezone: string): Promise<LinhaDaRequisicao[]> {
  const itens = await prisma.listaCompraItem.findMany({
    where: { listaId, produto: { isActive: true } },
    select: {
      idealStock: true,
      produto: { select: { id: true, name: true, unit: true, lotSize: true } },
    },
    orderBy: { produto: { name: "asc" } },
  });
  const ids = itens.map((i) => i.produto.id);
  const [contados, pendentes] = await Promise.all([
    contadosDeHoje(ids, timezone),
    prisma.sugestaoIdealRequisicao.findMany({
      where: { listaId, status: "PENDENTE" },
      orderBy: { createdAt: "desc" },
      select: { produtoId: true, idealSugerido: true },
    }),
  ]);
  const pendente = new Map<number, number>();
  for (const s of pendentes) if (!pendente.has(s.produtoId)) pendente.set(s.produtoId, s.idealSugerido.toNumber());

  return itens.map((i) => {
    const p = i.produto;
    const ideal = i.idealStock.toNumber();
    const lote = p.lotSize?.toNumber() ?? null;
    const c = contados.get(p.id) ?? null;
    const { quantidade, motivo } = sugeridoNaRequisicao(ideal, c?.quantidade ?? null, lote);
    return {
      produtoId: p.id,
      nome: p.name,
      unidade: p.unit,
      ideal,
      lote,
      contado: c?.quantidade ?? null,
      contadoEm: c?.em ?? null,
      sugerido: quantidade,
      motivo,
      idealSugeridoPendente: pendente.get(p.id) ?? null,
    };
  });
}
