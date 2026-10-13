/**
 * O desligamento: como a pessoa saiu (o tipo, que é do contrato) e por quê
 * (o motivo de verdade, que é o que a casa pode mudar). E a rotatividade do
 * mês, contada como a contabilidade conta: desligados ÷ média de ativos.
 *
 * Sem banco: datas em texto "2026-10-11". Testado em `scripts/test-prazos-pessoal.ts`.
 */

export type MotivoDesligamento =
  | "PEDIDO_DEMISSAO"
  | "SEM_JUSTA_CAUSA"
  | "JUSTA_CAUSA"
  | "FIM_EXPERIENCIA"
  | "FIM_CONTRATO"
  | "ACORDO"
  | "ABANDONO"
  | "OUTRO";

export const MOTIVO_DESLIGAMENTO: Record<MotivoDesligamento, string> = {
  PEDIDO_DEMISSAO: "Pediu demissão",
  SEM_JUSTA_CAUSA: "Dispensa sem justa causa",
  JUSTA_CAUSA: "Dispensa por justa causa",
  FIM_EXPERIENCIA: "Fim da experiência",
  FIM_CONTRATO: "Fim do contrato",
  ACORDO: "Acordo entre as partes",
  ABANDONO: "Abandono de emprego",
  OUTRO: "Outro",
};

export const ehMotivo = (v: unknown): v is MotivoDesligamento => typeof v === "string" && Object.hasOwn(MOTIVO_DESLIGAMENTO, v);

/** Por que saiu, de verdade. É daqui que sai a ação de retenção. */
export const RAZOES_DO_DESLIGAMENTO = [
  "Proposta melhor",
  "Salário",
  "Horário ou escala",
  "Distância ou transporte",
  "Ambiente ou liderança",
  "Mudou de cidade",
  "Estudos",
  "Saúde ou família",
  "Desempenho",
  "Faltas ou atrasos",
  "Comportamento",
  "Fim da temporada",
  "Outro",
] as const;

export type PessoaDaRotatividade = {
  /** Primeiro dia na casa. Nulo = já estava antes de qualquer mês olhado. */
  inicio: string | null;
  /** Dia do desligamento. Nulo = ativo. */
  fim: string | null;
};

export type MesDaRotatividade = {
  mes: string;
  admitidos: number;
  desligados: number;
  ativosNoInicio: number;
  ativosNoFim: number;
  /** Desligados ÷ média de ativos (início e fim do mês), em %. Nulo sem ninguém ativo. */
  percentual: number | null;
};

const ultimoDia = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/** Está na casa no dia: já começou e ainda não saiu (o dia do desligamento já não conta). */
const ativoEm = (p: PessoaDaRotatividade, dia: string) => (p.inicio === null || p.inicio <= dia) && (p.fim === null || p.fim > dia);

/** A rotatividade de cada mês "2026-10" pedido. */
export function rotatividadePorMes(pessoas: PessoaDaRotatividade[], meses: string[]): MesDaRotatividade[] {
  return meses.map((mes) => {
    const primeiro = `${mes}-01`;
    const ultimo = ultimoDia(mes);
    const noMes = (d: string | null) => d !== null && d >= primeiro && d <= ultimo;
    const ativosNoInicio = pessoas.filter((p) => ativoEm(p, primeiro)).length;
    const ativosNoFim = pessoas.filter((p) => ativoEm(p, ultimo)).length;
    const desligados = pessoas.filter((p) => noMes(p.fim)).length;
    const media = (ativosNoInicio + ativosNoFim) / 2;
    return {
      mes,
      admitidos: pessoas.filter((p) => noMes(p.inicio)).length,
      desligados,
      ativosNoInicio,
      ativosNoFim,
      percentual: media > 0 ? Math.round((desligados / media) * 1000) / 10 : null,
    };
  });
}

/** Os últimos `n` meses até `mes`, do mais antigo ao mais novo. */
export function mesesAte(mes: string, n: number): string[] {
  const [a, m] = mes.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

/** Contagem por motivo, do mais comum ao menos. */
export function contarMotivos<T extends string>(valores: (T | null)[]): { valor: T | null; n: number }[] {
  const contagem = new Map<T | null, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  return [...contagem.entries()].map(([valor, n]) => ({ valor, n })).sort((a, b) => b.n - a.n);
}
