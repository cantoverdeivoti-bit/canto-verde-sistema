/**
 * O orçamento do CMO (custo de mão de obra) e o custo de cada dia com
 * encargos e benefícios, sem banco.
 *
 * O orçamento do mês é a meta do CMO (em % do faturamento) vezes o
 * faturamento do mês. Cada dia recebe a parte do mês dele (o mês ÷ os dias
 * do mês), e a semana é a soma dos seus dias: a semana que vira o mês pega
 * um pedaço de cada um.
 *
 * O custo do dia segue a regra do CMO do mês: CLT e fixo custam todo dia o
 * mês inteiro deles (salário, encargos e benefícios) ÷ 30, escalados ou não;
 * o free custa a diária e os benefícios por dia só no dia em que trabalha.
 */
import { custoDoItem, linhaDoCmo, recebeItem, valorDoItem, type ItemDeCusto, type PessoaDoCmo } from "@/lib/cmo";
import { porMes } from "@/lib/tipos-de-contrato";

const arred = (n: number) => Math.round(n * 100) / 100;

/** Quantos dias tem o mês "2026-10". */
export function diasDoMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** O orçamento do mês em reais: meta (%) × faturamento. Nulo sem meta ou sem faturamento. */
export function orcamentoDoMes(metaPct: number | null, faturamento: number | null): number | null {
  if (metaPct === null || faturamento === null || faturamento <= 0) return null;
  return arred((faturamento * metaPct) / 100);
}

/**
 * O orçamento de um dia "2026-10-11": o do mês dele dividido pelos dias do
 * mês, em centavos. O centavo que sobra da divisão vai para os primeiros
 * dias, para a soma dos dias dar o mês exato (R$ 15.000 ÷ 31 não é redondo).
 */
export function orcamentoDoDia(data: string, metaPct: number | null, faturamentoDoMes: (mes: string) => number | null): number | null {
  const mes = data.slice(0, 7);
  const doMes = orcamentoDoMes(metaPct, faturamentoDoMes(mes));
  if (doMes === null) return null;
  const centavos = Math.round(doMes * 100);
  const n = diasDoMes(mes);
  const dia = Number(data.slice(8, 10));
  return (Math.floor(centavos / n) + (dia <= centavos % n ? 1 : 0)) / 100;
}

/**
 * O que a pessoa custa por dia além do salário e da diária que a escala já
 * conta: `sempre` entra todo dia (CLT e fixo: o mês inteiro ÷ 30; free: os
 * benefícios por mês ÷ 30) e `seEscalado` só no dia em que o free trabalha
 * (os benefícios por dia, como o vale-transporte).
 */
export function custoDiarioDaPessoa(p: PessoaDoCmo, itens: ItemDeCusto[]): { sempre: number; seEscalado: number } {
  if (porMes(p.tipo)) return { sempre: linhaDoCmo(p, itens).total / 30, seEscalado: 0 };
  const recebidos = itens.filter((i) => i.natureza !== "DESCONTO" && recebeItem(i, p));
  const porMesDoFree = recebidos.filter((i) => i.forma === "POR_MES").reduce((s, i) => s + custoDoItem(i, p), 0);
  const porDia = recebidos.filter((i) => i.forma === "POR_DIA").reduce((s, i) => s + valorDoItem(i, p), 0);
  return { sempre: porMesDoFree / 30, seEscalado: porDia };
}

/** Quanto sobra (positivo) ou passa (negativo) do orçamento. Nulo sem orçamento. */
export function sobraDoOrcamento(orcamento: number | null, custo: number): number | null {
  return orcamento === null ? null : arred(orcamento - custo);
}
