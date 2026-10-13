/**
 * A aritmética de um calendário mensal — só a conta, sem nenhuma opinião
 * sobre como desenhar.
 *
 * Duas telas precisam da mesma grade com interações diferentes: o painel
 * navega por links (`?date=`), a página pública por botões que mudam estado
 * no cliente. Compartilhar o componente forçaria uma abstração torta; a conta
 * é que vale a pena ter num lugar só.
 *
 * Tudo em UTC de propósito: as datas do sistema são "YYYY-MM-DD" puros, sem
 * hora, e converter para o fuso local do navegador desloca o dia.
 */

export const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "2026-08" -> { year: 2026, monthIndex: 7 } */
export function parseMonth(month: string): { year: number; monthIndex: number } {
  return {
    year: Number(month.slice(0, 4)),
    monthIndex: Number(month.slice(5, 7)) - 1,
  };
}

/** Nome do mês por extenso com o ano: "agosto de 2026". */
export function monthLabel(month: string): string {
  const { year, monthIndex } = parseMonth(month);
  return `${MONTH_NAMES[monthIndex]} de ${year}`;
}

/** Mês vizinho, `step` meses adiante (ou atrás, com negativo). */
export function shiftMonth(month: string, step: number): string {
  const { year, monthIndex } = parseMonth(month);
  const d = new Date(Date.UTC(year, monthIndex + step, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * As casas da grade: `null` para os vazios antes do dia 1, e a data ISO de
 * cada dia do mês. O consumidor decide o que renderizar em cada casa.
 */
export function monthCells(month: string): Array<string | null> {
  const { year, monthIndex } = parseMonth(month);
  const leadingBlanks = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  return [
    ...Array.from<null>({ length: leadingBlanks }).fill(null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
    ),
  ];
}

/** Só o número do dia de uma data ISO, para escrever na casa. */
export function dayNumber(iso: string): number {
  return Number(iso.slice(8, 10));
}
