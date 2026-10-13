import type { SemanaDoRelatorio } from "@/lib/orcamento";

/**
 * Orçamento × pedido × recebido, semana a semana, e o CMV pelas compras: o
 * que chegou dividido pelo que a semana faturou. É a resposta a "o que eu
 * recebi ficou dentro do orçamento?", sem depender de contagem (o CMV pelo
 * consumo, `cmvReal`, só sai com duas contagens na semana).
 *
 * Sem banco, para caber num teste. As semanas vêm de `orcamentosSemanais`.
 */

export type SemanaComparada = SemanaDoRelatorio & {
  /** recebido ÷ faturamento da semana, em %. Nulo até o faturamento dela ser digitado. */
  cmvCompras: number | null;
  /** pedido ÷ faturamento da semana, em %. */
  cmvPedido: number | null;
  /** orçamento − recebido. Negativo é estouro. Nulo sem orçamento. */
  sobra: number | null;
  /** recebido − pedido: o que chegou a mais (ou a menos) do que foi pedido na semana. */
  diferenca: number;
};

const arred = (n: number) => Math.round(n * 100) / 100;
const pct = (parte: number, todo: number | null) => (todo ? (parte / todo) * 100 : null);

export function compararSemana(s: SemanaDoRelatorio): SemanaComparada {
  return {
    ...s,
    cmvCompras: pct(s.recebido, s.faturamentoDaSemana),
    cmvPedido: pct(s.pedido, s.faturamentoDaSemana),
    sobra: s.orcamento === null ? null : arred(s.orcamento - s.recebido),
    diferenca: arred(s.recebido - s.pedido),
  };
}

export type TotaisDoComparativo = {
  /** Só das semanas que têm orçamento. */
  orcamento: number | null;
  pedido: number;
  recebido: number;
  /** O recebido das semanas com orçamento, para comparar com ele. */
  recebidoComOrcamento: number;
  /** orçamento − recebido das semanas com orçamento. Negativo é estouro. */
  sobra: number | null;
  /** Só das semanas com o faturamento já digitado. */
  faturamento: number | null;
  /** recebido ÷ faturamento, só das semanas com faturamento. */
  cmvCompras: number | null;
  cmvPedido: number | null;
  /** A meta média, pesada pelo faturamento de cada semana. */
  metaCmv: number | null;
};

export function totaisDoComparativo(semanas: SemanaComparada[]): TotaisDoComparativo {
  const comOrcamento = semanas.filter((s) => s.orcamento !== null);
  const comFaturamento = semanas.filter((s) => s.faturamentoDaSemana);
  const soma = (l: SemanaComparada[], f: (s: SemanaComparada) => number) => arred(l.reduce((t, s) => t + f(s), 0));

  const orcamento = comOrcamento.length > 0 ? soma(comOrcamento, (s) => s.orcamento!) : null;
  const recebidoComOrcamento = soma(comOrcamento, (s) => s.recebido);
  const faturamento = comFaturamento.length > 0 ? soma(comFaturamento, (s) => s.faturamentoDaSemana!) : null;
  const comMeta = comFaturamento.filter((s) => s.metaCmv !== null);
  const faturamentoComMeta = soma(comMeta, (s) => s.faturamentoDaSemana!);

  return {
    orcamento,
    pedido: soma(semanas, (s) => s.pedido),
    recebido: soma(semanas, (s) => s.recebido),
    recebidoComOrcamento,
    sobra: orcamento === null ? null : arred(orcamento - recebidoComOrcamento),
    faturamento,
    cmvCompras: pct(soma(comFaturamento, (s) => s.recebido), faturamento),
    cmvPedido: pct(soma(comFaturamento, (s) => s.pedido), faturamento),
    metaCmv: faturamentoComMeta > 0 ? soma(comMeta, (s) => s.metaCmv! * s.faturamentoDaSemana!) / faturamentoComMeta : null,
  };
}
