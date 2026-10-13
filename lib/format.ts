import type { ProductUnit, ReservationStatus } from "@/generated/prisma/client";

/*
 * Datas com o `Intl` do próprio navegador (e do Node), e não com date-fns.
 *
 * Este arquivo é importado por quase toda tela do celular (preço, plural,
 * unidade), e o date-fns com o português vinha junto em todas: uns 10 KB
 * compactados por tela só para escrever "sábado, 3 de outubro". O `Intl`
 * já está no aparelho. A saída é a mesma de antes, conferida data a data
 * contra o date-fns (`scripts/test-datas.ts`).
 */

const formatadores = new Map<string, Intl.DateTimeFormat>();

/** As partes de um instante no fuso pedido, em português. */
function partes(date: Date, timeZone: string) {
  let f = formatadores.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("pt-BR", {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatadores.set(timeZone, f);
  }
  const p: Record<string, string> = {};
  for (const { type, value } of f.formatToParts(date)) p[type] = value;
  const mes = MESES.indexOf(p.month) + 1;
  return {
    semana: p.weekday,
    /** "sábado", "segunda": sem o "-feira", como o date-fns escrevia. */
    semanaCurta: p.weekday.replace("-feira", ""),
    dia: p.day,
    dd: p.day.padStart(2, "0"),
    mes: p.month,
    mm: String(mes).padStart(2, "0"),
    ano: p.year,
    hora: `${p.hour}:${p.minute}`,
  };
}

const MESES = [
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

/** Meio-dia UTC de uma data "2026-09-28": nenhum fuso a empurra de dia. */
const doCalendario = (date: string) => new Date(`${date}T12:00:00Z`);

/** "28/09/2026 às 15:30" */
export function formatDateTime(date: Date, timezone: string): string {
  const d = partes(date, timezone);
  return `${d.dd}/${d.mm}/${d.ano} às ${d.hora}`;
}

/** "15:30" */
export function formatTime(date: Date, timezone: string): string {
  return partes(date, timezone).hora;
}

/** "segunda-feira, 28 de setembro de 2026" */
export function formatLongDate(date: Date, timezone: string): string {
  const d = partes(date, timezone);
  return `${d.semana}, ${d.dia} de ${d.mes} de ${d.ano}`;
}

/**
 * Sem o ano — para a confirmação do cliente, onde a reserva é sempre em até
 * dois meses e o ano só ocupa espaço.
 */
export function formatDayAndMonth(date: Date, timezone: string): string {
  const d = partes(date, timezone);
  return `${d.semana}, ${d.dia} de ${d.mes}`;
}

/** "sexta-feira, 25/09" — o dia da semana e a data em número, sem hora. */
export function formatDiaNumerico(date: Date, timezone: string): string {
  const d = partes(date, timezone);
  return `${d.semana}, ${d.dd}/${d.mm}`;
}

/**
 * "sexta-feira, 11 de setembro às 15:30" — dia da semana e hora juntos.
 *
 * Para prazo que mata alguma coisa. O dia da semana é como a casa pensa
 * ("preciso disso antes de sexta"), e a hora é o que de fato vence: dizer só
 * "sexta-feira, 11 de setembro" faz um link que morre às 15:30 parecer bom
 * até a meia-noite.
 */
export function formatDayMonthTime(date: Date, timezone: string): string {
  const d = partes(date, timezone);
  return `${d.semana}, ${d.dia} de ${d.mes} às ${d.hora}`;
}

/**
 * "02/10": o dia em que a cotação começou, que é como a casa a chama. O
 * número dela (o `id`) segue no endereço, mas não aparece mais na tela.
 * O ano entra só quando não é o deste ano ("02/10/2025"), para o histórico
 * não confundir outubro passado com este.
 */
export function dataDaCotacao(dataInicio: Date, timezone: string = FUSO_DA_CASA): string {
  const d = partes(dataInicio, timezone);
  return d.ano === partes(new Date(), timezone).ano ? `${d.dd}/${d.mm}` : `${d.dd}/${d.mm}/${d.ano}`;
}

/** "Cotação de 02/10". */
export function nomeDaCotacao(dataInicio: Date, timezone: string = FUSO_DA_CASA): string {
  return `Cotação de ${dataDaCotacao(dataInicio, timezone)}`;
}

/** "2026-09-28" no calendário do fuso pedido. */
export function diaNoFuso(date: Date, timezone: string): string {
  const d = partes(date, timezone);
  return `${d.ano}-${d.mm}-${d.dd}`;
}

/**
 * Se um prazo já venceu. Mora aqui, e não no corpo da página, porque ler o
 * relógio lá é o que a regra `react-hooks/purity` recusa — com razão num
 * componente de cliente, e por tabela num de servidor.
 */
export function jaPassou(prazo: Date): boolean {
  return prazo.getTime() < Date.now();
}

/** 0 = domingo … 6 = sábado, a mesma conta de `Date.getDay()`. */
export const DIAS_DA_SEMANA = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

/**
 * O dia da semana de hoje NA CASA, e não no servidor: a Vercel roda em UTC, e
 * às 22h de domingo no Brasil já seria segunda lá. Aqui pelo mesmo motivo de
 * `jaPassou` — ler o relógio no corpo da página a regra de pureza recusa.
 */
export function diaDaSemanaHoje(timezone: string): number {
  const curto = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(
    new Date(),
  );
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(curto);
}

/** Se este instante caiu hoje, no calendário da casa. */
export function ehHoje(data: Date, timezone: string): boolean {
  const dia = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: timezone });
  return dia(data) === dia(new Date());
}

/** Quanto falta, do jeito que se fala: "2 dias e 3 horas", "3 h 20 min", "20 min". */
export function formatarQuantoFalta(ms: number): string {
  const minutos = Math.max(0, Math.floor(ms / 60000));
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const min = minutos % 60;
  if (dias > 0) {
    const d = dias === 1 ? "1 dia" : `${dias} dias`;
    return horas > 0 ? `${d} e ${horas} ${horas === 1 ? "hora" : "horas"}` : d;
  }
  if (horas > 0) return `${horas} h ${min} min`;
  return `${min} min`;
}

/** "2026-08-30" -> "sábado, 30 de agosto" (sem conversão de fuso). */
export function formatDateString(date: string): string {
  return formatDayAndMonth(doCalendario(date), "UTC");
}

/** "2026-09-28" -> "segunda, 28/09" (sem conversão de fuso). Para linhas curtas. */
export function formatDiaCurtoString(date: string): string {
  const d = partes(doCalendario(date), "UTC");
  return `${d.semanaCurta}, ${d.dd}/${d.mm}`;
}

/** "2026-09-28" -> "segunda-feira, 28/09" (sem conversão de fuso). */
export function formatDiaNumericoString(date: string): string {
  return formatDiaNumerico(doCalendario(date), "UTC");
}

/**
 * O par que guarda a convenção do meio-dia.
 *
 * Previsão de entrega é data de calendário, não instante: "chega quinta" não
 * tem hora. Guardada à meia-noite, ela vira quarta-feira para quem está a
 * oeste de Greenwich — o restaurante está três horas atrás — e a agenda da
 * semana desenharia a entrega no dia anterior. Ao meio-dia UTC nenhum fuso
 * plausível a empurra para outro dia, e é a mesma convenção que
 * `formatDateString` já assume ao ler uma data de volta.
 */
export function diaISO(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** O fuso da casa quando a tela não tem a configuração em mãos. */
export const FUSO_DA_CASA = "America/Sao_Paulo";

/**
 * Hoje mais N dias, ao meio-dia UTC. N zero é hoje.
 *
 * "Hoje" é o calendário do restaurante, não o de Greenwich: pelo relógio UTC,
 * depois das 21h em Ivoti já é amanhã, e o pedido feito à noite ganhava um
 * dia a mais de previsão.
 */
export function diaDaqui(dias: number, timezone: string = FUSO_DA_CASA, agora: Date = new Date()): Date {
  const d = new Date(`${diaNoFuso(agora, timezone)}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
}

export function formatPhone(e164: string): string {
  // +5551999998888 -> (51) 99999-8888
  const match = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(e164);
  if (!match) return e164;
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

export const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: "Aguardando aprovação",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  COMPLETED: "Concluída",
  NO_SHOW: "Não compareceu",
};

export const PARTY_LABEL = (n: number) => (n === 1 ? "1 pessoa" : `${n} pessoas`);

/**
 * "1 reserva" / "3 reservas". O plural entre parênteses — "3 reserva(s)" —
 * é jeito de formulário de cartório, não de gente falando: a tela sabe o
 * número, então sabe qual das duas palavras usar. Passe o plural quando ele
 * não for só um "s": plural(2, "data especial", "datas especiais").
 */
export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------

/**
 * Abreviação como se escreve na nota do fornecedor, não por extenso — e em
 * maiúsculas, a pedido do dono: "30 KG" se lê de relance ao lado do número.
 * Quem lê texto de unidade (a planilha, a embalagem gravada) compara sem
 * diferenciar maiúscula, então o que foi gravado em minúscula continua valendo.
 */
export const UNIT_LABEL: Record<ProductUnit, string> = {
  UN: "UN",
  KG: "KG",
  G: "G",
  L: "L",
  ML: "ML",
  CX: "CX",
  PCT: "PCT",
  MACO: "MAÇO",
  DZ: "DZ",
  FD: "FARDO",
};

/**
 * Categoria não tem rótulo fixo aqui: virou cadastro, e o nome vem do banco.
 *
 * O que sobrou de constante é como o vazio se lê. Produto sem categoria é
 * estado normal — item recém-importado que ainda não foi guardado em lugar
 * nenhum — e precisa de um nome na tela, senão a coluna aparece em branco e
 * parece defeito.
 */
export const SEM_CATEGORIA = "sem categoria";

/**
 * Texto reduzido à forma que serve para comparar: sem acento, sem caixa.
 *
 * É o que faz "Hortifrúti", "HORTIFRUTI" e "hortifruti" serem a mesma coisa.
 * Nasceu na importação de planilha, onde é necessidade — o Excel corrompe
 * acento ao converter entre CP1252 e UTF-8, então o arquivo que volta pode
 * não ter os mesmos bytes que saiu. Mora aqui porque a busca das telas
 * precisa exatamente da mesma régua: quem digita "hortifruti" correndo, sem
 * acento, está procurando hortifrúti.
 */
export function chave(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

/** "12.345.678/0001-90" — o CNPJ chega do banco só com dígitos. */
export function formatTaxId(digits: string | null): string {
  if (!digits) return "";
  const m = /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/.exec(digits);
  return m ? `${m[1]}.${m[2]}.${m[3]}/${m[4]}-${m[5]}` : digits;
}

/** "R$ 12,50" — preço como sai na nota. */
export function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Preço por unidade num campo de digitar: "2,50", e até quatro casas quando o
 * centavo não basta ("0,015" é a unidade de um pacote de 1000 por R$ 15).
 * Sem ponto de milhar, que o campo leria como separador.
 */
export function precoNoCampo(value: number | null): string {
  if (value === null) return "";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
    useGrouping: false,
  });
}

/** Quantidade de estoque sem zeros à toa: 2,5 e não 2,500. */
export function formatAmount(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/**
 * Número como uma pessoa daqui digita: "8,25", "1.234,5", "8.25".
 *
 * Devolve null para campo vazio ou impossível — vazio é "não respondi", e
 * confundir isso com zero é o erro caro: numa contagem de estoque, zero é
 * "acabou" e vazio é "não passei por esse item", e tratá-los igual faria a
 * casa comprar o que já tem.
 *
 * O ponto é ambíguo e o desempate é a vírgula: com vírgula presente, o ponto
 * só pode ser separador de milhar ("1.234,5"); sem vírgula nenhuma, o ponto
 * é a casa decimal de quem digitou no teclado numérico ("8.25"). Só cortar
 * todo ponto — como a planilha faz, onde o formato é garantido — transformaria
 * 8.25 em 825 num campo onde a pessoa escreve solto.
 */
export function lerNumeroBR(texto: string): number | null {
  const bruto = texto.trim();
  if (bruto === "") return null;
  const semMilhar = bruto.includes(",")
    ? bruto.split(".").join("")
    : bruto;
  const n = Number(semMilhar.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
