import { diariaDoDia } from "@/lib/escala";
import { formatMoney } from "@/lib/format";
import { porMes, type TipoContrato } from "@/lib/tipos-de-contrato";

/**
 * A projeção do CMO (custo de mão de obra) de um mês padrão, sem banco: o
 * quanto custa um mês com a equipe e a escala fixa de hoje.
 *
 * - CLT e fixo sem registro: o salário do mês.
 * - Free lancer: a diária de cada dia em que ele está na escala fixa (a
 *   daquele dia, ou a de sempre) × as semanas de um mês (365 ÷ 12 ÷ 7 = 4,35).
 * - Encargos e benefícios (Cadastros): cada item vale para os tipos
 *   marcados, com a exceção de cada pessoa por cima, e custa conforme a
 *   forma: % do salário, R$ por mês ou R$ por dia trabalhado.
 * - Faturamento de um mês: a média dos últimos meses digitados em
 *   Relatórios ou, sem nenhum, a média semanal do orçamento de Compras × as
 *   mesmas 4,35 semanas (quem escolhe é `lib/cmo-do-banco.ts`).
 *
 * Roda no servidor (o registro de cada mês) e no navegador (a simulação de
 * ligar e desligar pessoas), por isso não toca em banco nem em data.
 */

/** As semanas de um mês médio. */
export const SEMANAS_POR_MES = 365 / 12 / 7;

/** De onde veio o faturamento da projeção, para a tela dizer. */
export type FonteDoFaturamento = { de: "meses" | "semanas"; quantos: number } | null;

export type NaturezaDoItem = "ENCARGO" | "BENEFICIO" | "DESCONTO";
export type FormaDoItem = "PERCENTUAL_SALARIO" | "POR_MES" | "POR_DIA";

/** Um encargo ou benefício do cadastro. */
export type ItemDeCusto = {
  id: number;
  nome: string;
  natureza: NaturezaDoItem;
  forma: FormaDoItem;
  /** O % (forma PERCENTUAL_SALARIO) ou os R$. */
  valor: number;
  /** Quem recebe sem precisar marcar na ficha. */
  tipos: TipoContrato[];
  ativo: boolean;
};

/**
 * Os encargos do CLT que formam os 29%: 13º (1/12 do ano), férias com 1/3
 * (1/12 × 4/3) e FGTS de 8% sobre salário, 13º e férias (8% × 119,44%).
 */
export const ENCARGOS_PADRAO_DO_CLT: { nome: string; valor: number }[] = [
  { nome: "13º salário", valor: 8.33 },
  { nome: "Férias + 1/3", valor: 11.11 },
  { nome: "FGTS", valor: 9.56 },
];

export type PessoaDoCmo = {
  id: number;
  nome: string;
  tipo: TipoContrato;
  ativo: boolean;
  salario: number | null;
  diaria: number | null;
  /** O free que ganha diferente em algum dia: dia da semana (0 = domingo) → diária. */
  diariasPorDia?: Partial<Record<number, number>>;
  /** Os dias da semana em que está na escala fixa (0 a 7). */
  diasPorSemana: number;
  /** Quais dias (0 = domingo). Sem eles, a diária de sempre vale para todos. */
  diasDaSemana?: number[];
  /** A exceção de cada item (id do item → recebe ou não), por cima do tipo. */
  excecoes: Record<number, boolean>;
  /** O valor desta pessoa em cada item (id do item → % ou R$), por cima do cadastro. */
  valores: Record<number, number>;
};

export type ItemNaLinha = { id: number; nome: string; natureza: NaturezaDoItem; valor: number };

export type LinhaDoCmo = {
  id: number;
  nome: string;
  tipo: TipoContrato;
  ativo: boolean;
  /** CLT e fixo. */
  salario: number;
  /** Free: o valor das diárias do mês. */
  diarias: number;
  /** Os dias trabalhados num mês (dias por semana × 4,35). */
  diasNoMes: number;
  diasPorSemana: number;
  itens: ItemNaLinha[];
  encargos: number;
  beneficios: number;
  total: number;
  /** Sem salário ou diária no cadastro: entra com zero. */
  semValor: boolean;
  /** Os descontos do salário da pessoa (INSS dele, sindicato). Fora do `total`. */
  itensDeDesconto: ItemNaLinha[];
  descontos: number;
  /** Salário ou diárias menos os descontos: o que a pessoa recebe. */
  liquido: number;
};

type PorTipo = { base: number; encargos: number; beneficios: number; total: number };

export type ProjecaoDoCmo = {
  linhas: LinhaDoCmo[];
  clt: PorTipo;
  fixo: PorTipo;
  free: PorTipo & { diasNoMes: number };
  /** O total de cada item no mês, na ordem do cadastro. */
  itens: { id: number; nome: string; natureza: NaturezaDoItem; total: number }[];
  encargos: number;
  beneficios: number;
  /** O que sai do salário da equipe no mês. Não entra no total. */
  descontos: number;
  total: number;
  semValor: number;
  /** O faturamento de um mês usado na conta. Nulo sem faturamento. */
  faturamento: number | null;
  percentual: number | null;
};

const arred = (n: number) => Math.round(n * 100) / 100;

/** Os dias de trabalho de um mês médio, com uma casa: 5 por semana = 21,7. */
export const diasNoMes = (diasPorSemana: number) => Math.round(diasPorSemana * SEMANAS_POR_MES * 10) / 10;

/** Se a pessoa recebe o item: a exceção dela, se houver; senão, o tipo. */
export function recebeItem(item: ItemDeCusto, p: Pick<PessoaDoCmo, "tipo" | "excecoes">): boolean {
  if (!item.ativo) return false;
  const excecao = p.excecoes[item.id];
  return excecao ?? item.tipos.includes(p.tipo);
}

/** O valor do item para a pessoa: o dela, se tiver; senão, o do cadastro. */
export const valorDoItem = (item: ItemDeCusto, p: Pick<PessoaDoCmo, "valores">) => p.valores[item.id] ?? item.valor;

/** O custo de um mês do item para a pessoa. Zero quando não se aplica (% do salário no free). */
export function custoDoItem(item: ItemDeCusto, p: PessoaDoCmo): number {
  const valor = valorDoItem(item, p);
  if (item.forma === "PERCENTUAL_SALARIO") return porMes(p.tipo) ? arred(((p.salario ?? 0) * valor) / 100) : 0;
  if (item.forma === "POR_MES") return arred(valor);
  return arred(valor * diasNoMes(p.diasPorSemana));
}

/** "8,33% do salário", "R$ 250,00 por mês", "R$ 12,00 por dia trabalhado". */
export function descreverItem(forma: FormaDoItem, valor: number): string {
  if (forma === "PERCENTUAL_SALARIO") return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do salário`;
  return `${formatMoney(valor)} ${forma === "POR_MES" ? "por mês" : "por dia trabalhado"}`;
}

/** O custo de um mês padrão de uma pessoa, com os encargos e benefícios dela. */
export function linhaDoCmo(p: PessoaDoCmo, itens: ItemDeCusto[]): LinhaDoCmo {
  const mensal = porMes(p.tipo);
  const dias = diasNoMes(p.diasPorSemana);
  const salario = mensal ? (p.salario ?? 0) : 0;
  // A diária média dos dias da escala fixa: com valor diferente no sábado ou
  // no domingo, a semana pesa cada dia pelo que ele custa.
  const diasDoFree = p.diasDaSemana ?? [];
  const mediaDaDiaria =
    p.diasDaSemana && diasDoFree.length > 0
      ? diasDoFree.reduce((s, d) => s + (diariaDoDia(p, d) ?? 0), 0) / diasDoFree.length
      : (p.diaria ?? 0);
  const diarias = mensal ? 0 : arred(dias * mediaDaDiaria);
  const semDiaria = p.diasDaSemana ? diasDoFree.some((d) => diariaDoDia(p, d) === null) : p.diaria === null && p.diasPorSemana > 0;
  const todos: ItemNaLinha[] = itens
    .filter((i) => recebeItem(i, p))
    .map((i) => ({ id: i.id, nome: i.nome, natureza: i.natureza, valor: custoDoItem(i, p) }))
    .filter((i) => i.valor > 0);
  // O desconto sai do salário da pessoa: fica fora do custo (e do CMO).
  const seus = todos.filter((i) => i.natureza !== "DESCONTO");
  const itensDeDesconto = todos.filter((i) => i.natureza === "DESCONTO");
  const soma = (n: NaturezaDoItem) => arred(todos.filter((i) => i.natureza === n).reduce((s, i) => s + i.valor, 0));
  const encargos = soma("ENCARGO");
  const beneficios = soma("BENEFICIO");
  const descontos = soma("DESCONTO");
  return {
    id: p.id,
    nome: p.nome,
    tipo: p.tipo,
    ativo: p.ativo,
    salario,
    diarias,
    diasNoMes: dias,
    diasPorSemana: p.diasPorSemana,
    itens: seus,
    encargos,
    beneficios,
    total: arred(salario + diarias + encargos + beneficios),
    itensDeDesconto,
    descontos,
    liquido: arred(salario + diarias - descontos),
    semValor: mensal ? p.salario === null : semDiaria,
  };
}

/**
 * A projeção do mês com as pessoas de `incluidos` (os ids). Sem
 * `incluidos`, vale quem está ativo.
 */
export function projecaoDoMes({
  pessoas,
  itens,
  faturamentoMensal,
  incluidos,
}: {
  pessoas: PessoaDoCmo[];
  itens: ItemDeCusto[];
  /** O faturamento de um mês para comparar, ou nulo. */
  faturamentoMensal: number | null;
  incluidos?: ReadonlySet<number>;
}): ProjecaoDoCmo {
  const conta = pessoas.filter((p) => (incluidos ? incluidos.has(p.id) : p.ativo));
  const linhas = conta
    .map((p) => linhaDoCmo(p, itens))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR"));

  const somaDe = (tipo: TipoContrato): PorTipo => {
    const doTipo = linhas.filter((l) => l.tipo === tipo);
    const s = (f: (l: LinhaDoCmo) => number) => arred(doTipo.reduce((t, l) => t + f(l), 0));
    return {
      base: s((l) => l.salario + l.diarias),
      encargos: s((l) => l.encargos),
      beneficios: s((l) => l.beneficios),
      total: s((l) => l.total),
    };
  };
  const clt = somaDe("CLT");
  const fixo = somaDe("FIXO");
  const free = {
    ...somaDe("FREELANCER"),
    diasNoMes: Math.round(linhas.filter((l) => l.tipo === "FREELANCER").reduce((s, l) => s + l.diasNoMes, 0) * 10) / 10,
  };
  const totalDoItem = (id: number) =>
    arred(linhas.reduce((s, l) => s + (l.itens.find((i) => i.id === id)?.valor ?? 0), 0));
  const total = arred(clt.total + fixo.total + free.total);
  const faturamento = faturamentoMensal !== null && faturamentoMensal > 0 ? arred(faturamentoMensal) : null;

  return {
    linhas,
    clt,
    fixo,
    free,
    itens: itens
      .filter((i) => i.ativo)
      .map((i) => ({ id: i.id, nome: i.nome, natureza: i.natureza, total: totalDoItem(i.id) }))
      .filter((i) => i.total > 0),
    encargos: arred(clt.encargos + fixo.encargos + free.encargos),
    descontos: arred(linhas.reduce((s, l) => s + l.descontos, 0)),
    beneficios: arred(clt.beneficios + fixo.beneficios + free.beneficios),
    total,
    semValor: linhas.filter((l) => l.semValor).length,
    faturamento,
    percentual: percentualDoCmo(total, faturamento),
  };
}

/** CMO em % do faturamento, com uma casa: 31.4. */
export function percentualDoCmo(cmo: number, faturamento: number | null): number | null {
  return faturamento && faturamento > 0 ? Math.round((cmo / faturamento) * 1000) / 10 : null;
}

export type SituacaoDaMeta = "dentro" | "perto" | "acima";

/** Quanto acima da meta ainda é "perto" (amarelo): 10% dela. Meta de 30% fica amarela até 33%. */
export const FOLGA_DA_META = 0.1;

/** Verde até a meta, amarelo até 10% acima dela, vermelho passando disso. Nulo sem meta ou sem %. */
export function situacaoDaMeta(percentual: number | null, meta: number | null): SituacaoDaMeta | null {
  if (percentual === null || meta === null) return null;
  if (percentual <= meta) return "dentro";
  return percentual <= meta * (1 + FOLGA_DA_META) ? "perto" : "acima";
}
