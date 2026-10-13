/**
 * O período dos relatórios, em datas do calendário da casa ("2026-09-01").
 *
 * Tudo aqui é string de dia, sem relógio: quem transforma dia em instante é a
 * página, com o fuso da casa. Assim "este mês" é o mês de Ivoti, e não o da
 * Vercel, que roda em UTC.
 */

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function paraData(dia: string) {
  return new Date(`${dia}T00:00:00.000Z`);
}
function paraDia(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Soma dias a uma data do calendário. */
export function somarDias(dia: string, n: number): string {
  const d = paraData(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return paraDia(d);
}

/** Quantos dias o período tem, contando o primeiro e o último. */
export function diasNoPeriodo(de: string, ate: string): number {
  return Math.round((paraData(ate).getTime() - paraData(de).getTime()) / 86_400_000) + 1;
}

export type Atalho = {
  chave: string;
  nome: string;
  /** O nome que cabe no celular, com os quatro atalhos numa linha. */
  curto: string;
  de: string;
  ate: string;
};

/** Os atalhos de período, calculados a partir de hoje (dia da casa). */
export function atalhosDePeriodo(hoje: string): Atalho[] {
  const d = paraData(hoje);
  // Semana começando na segunda, como a semana de compra da casa.
  const desdeSegunda = (d.getUTCDay() + 6) % 7;
  const inicioDoMes = `${hoje.slice(0, 8)}01`;
  const fimDoMesPassado = somarDias(inicioDoMes, -1);
  return [
    { chave: "semana", nome: "Esta semana", curto: "Semana", de: somarDias(hoje, -desdeSegunda), ate: hoje },
    { chave: "mes", nome: "Este mês", curto: "Mês", de: inicioDoMes, ate: hoje },
    {
      chave: "mes-passado",
      nome: "Mês passado",
      curto: "Mês ant.",
      de: `${fimDoMesPassado.slice(0, 8)}01`,
      ate: fimDoMesPassado,
    },
    { chave: "90", nome: "90 dias", curto: "90 dias", de: somarDias(hoje, -89), ate: hoje },
  ];
}

/** Dia que existe no calendário: "2026-02-31" tem o formato, mas não existe. */
export function diaValido(dia: string): boolean {
  return DIA.test(dia) && paraDia(paraData(dia)) === dia;
}

/**
 * O período pedido no endereço, ou o padrão (este mês, se a aba não tiver
 * outro). Dia que não existe, ou fim antes do começo, cai no padrão em vez de
 * mostrar um relatório vazio sem motivo. Fim depois de hoje vira hoje: o
 * futuro não tem compra, e contar dias vazios só baixa as médias.
 */
export function resolverPeriodo(
  de: string | undefined,
  ate: string | undefined,
  hoje: string,
  padrao?: { de: string; ate: string },
): { de: string; ate: string } {
  if (de && ate && diaValido(de) && diaValido(ate)) {
    const fim = ate > hoje ? hoje : ate;
    if (de <= fim) return { de, ate: fim };
  }
  if (padrao) return padrao;
  const mes = atalhosDePeriodo(hoje).find((a) => a.chave === "mes")!;
  return { de: mes.de, ate: mes.ate };
}

/** O período do mesmo tamanho logo antes deste — para comparar. */
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const n = diasNoPeriodo(de, ate);
  return { de: somarDias(de, -n), ate: somarDias(de, -1) };
}

/** Os períodos que o relatório por e-mail pode cobrir. */
export const PERIODOS_DO_RELATORIO = [
  { chave: "semana-passada", nome: "Semana passada (segunda a domingo)" },
  { chave: "7", nome: "Últimos 7 dias" },
  { chave: "14", nome: "Últimos 14 dias" },
  { chave: "mes-passado", nome: "Mês passado" },
  { chave: "mes", nome: "Mês até ontem" },
] as const;

export type PeriodoDoRelatorio = (typeof PERIODOS_DO_RELATORIO)[number]["chave"];

/**
 * O período que o relatório cobre, contado a partir do dia em que ele sai.
 * Sempre termina ontem ou antes: o dia do envio ainda está acontecendo, e um
 * dia pela metade só baixaria as médias. "Mês até ontem" no dia 1 não teria
 * dia nenhum, então vira o mês passado inteiro.
 */
export function periodoDoRelatorio(tipo: string, hoje: string): { de: string; ate: string } {
  const ontem = somarDias(hoje, -1);
  const inicioDoMes = `${hoje.slice(0, 8)}01`;
  const mesPassado = () => {
    const fim = somarDias(inicioDoMes, -1);
    return { de: `${fim.slice(0, 8)}01`, ate: fim };
  };
  switch (tipo) {
    case "7":
      return { de: somarDias(hoje, -7), ate: ontem };
    case "14":
      return { de: somarDias(hoje, -14), ate: ontem };
    case "mes-passado":
      return mesPassado();
    case "mes":
      return hoje === inicioDoMes ? mesPassado() : { de: inicioDoMes, ate: ontem };
    default: {
      // Semana passada: a segunda da semana anterior até o domingo.
      const desdeSegunda = (paraData(hoje).getUTCDay() + 6) % 7;
      const segunda = somarDias(hoje, -desdeSegunda - 7);
      return { de: segunda, ate: somarDias(segunda, 6) };
    }
  }
}

/** Dia da semana de uma data do calendário: 0 = domingo ... 6 = sábado. */
export function diaDaSemana(dia: string): number {
  return paraData(dia).getUTCDay();
}
