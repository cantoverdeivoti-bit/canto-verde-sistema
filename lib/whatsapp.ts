import type { Reservation, ReservationStatus } from "@/generated/prisma/client";

import { PARTY_LABEL, formatDayAndMonth, formatTime } from "@/lib/format";

type Target = Pick<
  Reservation,
  "customerPhone" | "customerName" | "partySize" | "startTime" | "status"
>;

type Context = {
  timezone: string;
  restaurantName: string;
  /** Confirmada que já passou da tolerância: o assunto da conversa é outro. */
  late?: boolean;
};

/**
 * O número como o wa.me espera: só dígitos, com país, sem o "+".
 *
 * Tira exatamente um caractere, nunca um "+55" literal — `normalizePhone`
 * respeita outro país se a pessoa digitou um, e cortar dois dígitos ali
 * mandaria a conversa para outra pessoa. Sem "+" na origem não dá para saber
 * o país, e um palpite é pior que nenhum link.
 */
function waNumber(e164: string): string | null {
  if (!e164.startsWith("+")) return null;
  const digits = e164.slice(1).replace(/\D/g, "");

  // Brasileiro tem forma conhecida: 55 + DDD + 8 ou 9 dígitos. Um "+55"
  // fora dela é número incompleto — o libphonenumber ainda o aceita, mas
  // o link abriria uma conversa que não existe. É a mesma régua do
  // `formatPhone`: quando ele desiste de exibir e mostra o E.164 cru,
  // aqui também não há link a oferecer.
  if (digits.startsWith("55") && !/^55\d{10,11}$/.test(digits)) return null;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

type Vars = {
  hello: string;
  party: string;
  /** "sábado, 30 de agosto" */
  day: string;
  /** "12:30" */
  time: string;
  /** "sábado, 30 de agosto, às 12:30" */
  when: string;
};

/**
 * Um rascunho por estado — o dono lê, ajusta e envia; nada sai daqui sozinho.
 * É a primeira frase de uma conversa, então cada uma termina devolvendo a
 * pergunta ao cliente.
 *
 * `Record` em vez de `switch` de propósito: um sexto status quebra o build
 * em vez de cair num texto genérico em silêncio.
 */
const DRAFT: Record<ReservationStatus, (v: Vars) => string> = {
  PENDING: ({ hello, party, when }) =>
    `${hello}\n\nRecebemos seu pedido de reserva para ${party}, ${when}. Posso confirmar para você?`,
  CONFIRMED: ({ hello, party, when }) =>
    `${hello}\n\nSua mesa para ${party} está guardada para ${when}. Está tudo certo?`,
  // "Consta como cancelada" e não "cancelamos"/"você cancelou": admin e
  // cliente caem no mesmo status, e o sistema não sabe qual dos dois foi.
  CANCELLED: ({ hello, when }) =>
    `${hello}\n\nSua reserva de ${when} consta como cancelada aqui. Quer que eu procure outro horário para você?`,
  NO_SHOW: ({ hello, day }) =>
    `${hello}\n\nSentimos sua falta na reserva de ${day}. Deu tudo certo por aí? Quando quiser remarcar, é só me chamar.`,
  COMPLETED: ({ hello, day }) =>
    `${hello}\n\nObrigado pela visita de ${day} — foi muito bom receber você! Quando quiser marcar a próxima, é só me chamar.`,
};

/**
 * Sem prometer segurar a mesa por mais tempo: isso é decisão do dono na hora,
 * não algo que o sistema possa comprometer no lugar dele.
 */
const LATE_DRAFT = ({ hello, party, time }: Vars) =>
  `${hello}\n\nSua mesa para ${party} está reservada para as ${time} de hoje e ainda não vimos você por aqui. Está a caminho?\n\nSe precisar mudar alguma coisa, é só avisar.`;

/**
 * Conversa aberta com um número, sem rascunho — para fornecedor, onde o
 * texto é montado na tela porque depende de um link que só o navegador sabe.
 */
export function whatsappNumberLink(e164: string | null): string | null {
  if (!e164) return null;
  const number = waNumber(e164);
  return number ? `https://wa.me/${number}` : null;
}

/** Conversa do WhatsApp já com o rascunho, ou null se o número não serve. */
export function whatsappLink(r: Target, ctx: Context): string | null {
  const number = waNumber(r.customerPhone);
  if (!number) return null;

  const day = formatDayAndMonth(r.startTime, ctx.timezone);
  const time = formatTime(r.startTime, ctx.timezone);
  const vars: Vars = {
    hello: `Olá, ${r.customerName.trim().split(/\s+/)[0]}! Aqui é do ${ctx.restaurantName}.`,
    party: PARTY_LABEL(r.partySize),
    day,
    time,
    when: `${day}, às ${time}`,
  };

  const text =
    r.status === "CONFIRMED" && ctx.late ? LATE_DRAFT(vars) : DRAFT[r.status](vars);

  // encodeURIComponent, nunca URLSearchParams: este codifica espaço como "+",
  // e o parâmetro `text` do WhatsApp não desfaz isso — a mensagem chegaria
  // com os "+" literais no lugar dos espaços.
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
