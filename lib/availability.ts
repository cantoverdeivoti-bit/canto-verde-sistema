import { add, addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import { prisma } from "@/lib/db";
import type {
  AdvanceUnit,
  BusinessHours,
  CapacitySettings,
  ReservationRules,
  SpecialDate,
} from "@/generated/prisma/client";

/**
 * Núcleo do sistema.
 *
 * A disponibilidade é medida em PESSOAS por intervalo de tempo, não em mesas.
 * Cada reserva ocupa [startTime, endTime) com peso `partySize`; a soma dos
 * pesos sobrepostos a um instante nunca pode ultrapassar a lotação do dia.
 *
 * Toda decisão de negócio ("já passou?", "está aberto?") é feita no fuso do
 * restaurante — nunca no fuso do navegador do cliente nem no UTC cru.
 */

/** Status que efetivamente ocupam lugar no salão. */
export const OCCUPYING_STATUSES = ["PENDING", "CONFIRMED"] as const;

export type OpenWindow = { opensAt: string; closesAt: string; shiftName: string | null };

export type DayWindows = {
  /** Fechado neste dia (sem turnos ativos ou marcado como feriado). */
  closed: boolean;
  windows: OpenWindow[];
  /** Lotação vigente no dia (override de data especial, se houver). */
  capacity: number;
  /** Preenchido quando o fechamento vem de uma data especial. */
  note: string | null;
};

export type Settings = {
  rules: ReservationRules;
  capacity: CapacitySettings;
};

export type UnavailableReason =
  | "RESERVATIONS_DISABLED"
  | "CLOSED_DAY"
  | "OUTSIDE_HOURS"
  | "PAST_DATE"
  | "TOO_SOON"
  | "TOO_FAR"
  | "PARTY_TOO_SMALL"
  | "PARTY_TOO_LARGE"
  | "NO_CAPACITY";

export type AvailabilityResult =
  | {
      ok: true;
      startTime: Date;
      endTime: Date;
      durationMinutes: number;
      /** Lugares ainda livres neste intervalo, já descontando a nova reserva. */
      remaining: number;
      /** Se true, a reserva entra como PENDING para aprovação manual. */
      needsManualApproval: boolean;
    }
  | { ok: false; reason: UnavailableReason; message: string };

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

async function lerConfiguracoes(): Promise<Settings> {
  const [rules, capacity] = await Promise.all([
    prisma.reservationRules.findUnique({ where: { id: 1 } }),
    prisma.capacitySettings.findUnique({ where: { id: 1 } }),
  ]);

  if (!rules || !capacity) {
    throw new Error(
      "Configuração ausente. Rode `npx prisma db seed` para criar as configurações iniciais.",
    );
  }

  return { rules, capacity };
}

/** A etiqueta do cache das configurações: `updateTag` nela ao salvar. */
export const TAG_CONFIGURACOES = "configuracoes-da-casa";

/**
 * Guardadas entre uma abertura e outra: quase toda tela pede as
 * configurações, e elas só mudam quando alguém salva em Configurações (que
 * limpa o cache na hora, `lib/actions/settings.ts`). Os cinco minutos são só
 * o teto, para uma mudança feita direto no banco também aparecer.
 *
 * O cache guarda em JSON: as datas voltam como texto e são refeitas aqui.
 */
const configuracoesGuardadas = unstable_cache(lerConfiguracoes, ["configuracoes-da-casa"], {
  tags: [TAG_CONFIGURACOES],
  revalidate: 300,
});

/**
 * As regras e a capacidade da casa.
 *
 * Com `cache()`, uma leitura por requisição; com o cache de cima, nenhuma ida
 * ao banco na maior parte das telas. Fora do Next (scripts de teste) o cache
 * não existe, e a leitura vai direto ao banco.
 */
export const getSettings = cache(async (): Promise<Settings> => {
  let s: Settings;
  try {
    s = await configuracoesGuardadas();
  } catch {
    return lerConfiguracoes();
  }
  const data = (d: Date | string) => new Date(d);
  return {
    rules: { ...s.rules, createdAt: data(s.rules.createdAt), updatedAt: data(s.rules.updatedAt) },
    capacity: { ...s.capacity, createdAt: data(s.capacity.createdAt), updatedAt: data(s.capacity.updatedAt) },
  };
});

// ---------------------------------------------------------------------------
// Datas e fuso horário
// ---------------------------------------------------------------------------

/** Data de hoje ("YYYY-MM-DD") no fuso do restaurante. */
export function todayInTimezone(timezone: string): string {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
}

/** Converte data+hora locais do restaurante no instante UTC correspondente. */
export function toInstant(date: string, time: string, timezone: string): Date {
  return fromZonedTime(`${date}T${time}:00`, timezone);
}

/**
 * `DateTime @db.Date` do Prisma é lido/escrito como meia-noite UTC.
 * Construir com `new Date("YYYY-MM-DD")` já produz meia-noite UTC.
 */
export function toDateOnly(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function dateOnlyToString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Dia da semana (0 = domingo) de uma data local do restaurante. */
export function dayOfWeekFor(date: string): number {
  // Interpretado como meia-noite UTC — getUTCDay evita deslocamento de fuso.
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function advanceDuration(value: number, unit: AdvanceUnit) {
  switch (unit) {
    case "MINUTES":
      return { minutes: value };
    case "HOURS":
      return { hours: value };
    case "DAYS":
      return { days: value };
    case "WEEKS":
      return { weeks: value };
    case "MONTHS":
      return { months: value };
  }
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Horário de funcionamento do dia
// ---------------------------------------------------------------------------

/**
 * Datas especiais no PASSADO nunca são consultadas — um feriado vencido
 * esquecido no cadastro não pode influenciar o calendário de hoje em diante.
 */
async function findSpecialDate(
  date: string,
  timezone: string,
): Promise<SpecialDate | null> {
  if (date < todayInTimezone(timezone)) return null;
  return prisma.specialDate.findUnique({ where: { date: toDateOnly(date) } });
}

/**
 * A regra de "como fica o dia", sem tocar no banco: a data especial manda
 * (fechamento, janela própria, override de lotação), senão vale a grade da
 * semana. Isolada como função pura para que o calendário do mês resolva
 * trinta e um dias com duas consultas em vez de sessenta e duas.
 */
export function resolveDayWindows(
  special: SpecialDate | null,
  weekdayHours: BusinessHours[],
  capacity: CapacitySettings,
): DayWindows {
  const dayCapacity = special?.capacityOverride ?? capacity.totalCapacity;

  if (special) {
    if (special.isClosed) {
      return { closed: true, windows: [], capacity: dayCapacity, note: special.note };
    }
    if (special.opensAt && special.closesAt) {
      return {
        closed: false,
        capacity: dayCapacity,
        note: special.note,
        windows: [
          { opensAt: special.opensAt, closesAt: special.closesAt, shiftName: null },
        ],
      };
    }
    // Data especial sem horário e sem fechamento: cai na grade normal, só o
    // override de lotação vale.
  }

  return {
    closed: weekdayHours.length === 0,
    capacity: dayCapacity,
    note: special?.note ?? null,
    windows: weekdayHours.map((h) => ({
      opensAt: h.opensAt,
      closesAt: h.closesAt,
      shiftName: h.shiftName,
    })),
  };
}

export async function getDayWindows(
  date: string,
  capacity: CapacitySettings,
): Promise<DayWindows> {
  const special = await findSpecialDate(date, capacity.timezone);

  // Data especial com janela própria dispensa consultar a grade da semana.
  const usesOwnWindow = Boolean(special?.isClosed || (special?.opensAt && special?.closesAt));
  const hours: BusinessHours[] = usesOwnWindow
    ? []
    : await prisma.businessHours.findMany({
        where: { dayOfWeek: dayOfWeekFor(date), isActive: true },
        orderBy: { opensAt: "asc" },
      });

  return resolveDayWindows(special, hours, capacity);
}

// ---------------------------------------------------------------------------
// Ocupação
// ---------------------------------------------------------------------------

type Busy = { startTime: Date; endTime: Date; partySize: number };

/**
 * Reservas que podem tocar a janela pedida. Uma única consulta serve para
 * calcular a grade inteira do dia em memória.
 */
async function loadBusyIntervals(from: Date, to: Date): Promise<Busy[]> {
  return prisma.reservation.findMany({
    where: {
      status: { in: [...OCCUPYING_STATUSES] },
      startTime: { lt: to },
      endTime: { gt: from },
    },
    select: { startTime: true, endTime: true, partySize: true },
  });
}

/** Soma das pessoas cujas reservas se sobrepõem a [start, end). */
export function occupancyIn(busy: Busy[], start: Date, end: Date): number {
  let total = 0;
  for (const b of busy) {
    // Sobreposição clássica de intervalos: A.start < B.end && A.end > B.start
    if (b.startTime < end && b.endTime > start) total += b.partySize;
  }
  return total;
}

/**
 * Pico de ocupação simultânea entre reservas ativas.
 *
 * "47 pessoas no dia" não diz nada sobre lotação — almoço e jantar não
 * disputam as mesmas cadeiras. O que importa para a operação é o momento em
 * que mais gente está sentada ao mesmo tempo. Varredura clássica de eventos:
 * +partySize na chegada, -partySize na saída, máximo da soma corrente.
 */
export function peakOccupancy(
  busy: Busy[],
): { peak: number; at: Date | null } {
  const events: Array<{ t: number; delta: number }> = [];
  for (const b of busy) {
    events.push({ t: b.startTime.getTime(), delta: b.partySize });
    events.push({ t: b.endTime.getTime(), delta: -b.partySize });
  }
  // Saída antes de entrada no mesmo instante: quem sai libera a cadeira
  // para quem chega no mesmo minuto.
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);

  let current = 0;
  let peak = 0;
  let at: number | null = null;
  for (const e of events) {
    current += e.delta;
    if (current > peak) {
      peak = current;
      at = e.t;
    }
  }
  return { peak, at: at === null ? null : new Date(at) };
}

// ---------------------------------------------------------------------------
// Grade de horários oferecida ao cliente
// ---------------------------------------------------------------------------

export type Slot = { time: string; remaining: number; shiftName: string | null };

/**
 * Horários que realmente comportam `partySize` na data pedida.
 * A página pública só mostra o que cabe, então o cliente nunca escolhe um
 * horário que será recusado depois.
 */
export async function getAvailableSlots(
  date: string,
  partySize: number,
  settings?: Settings,
): Promise<Slot[]> {
  const { rules, capacity } = settings ?? (await getSettings());

  if (!rules.isActive) return [];
  if (partySize < rules.minPartySize || partySize > rules.maxPartySize) return [];

  const day = await getDayWindows(date, capacity);
  if (day.closed) return [];

  const now = new Date();
  const earliest = add(now, advanceDuration(rules.minAdvanceValue, rules.minAdvanceUnit));
  const latest = add(now, advanceDuration(rules.maxAdvanceValue, rules.maxAdvanceUnit));

  const duration = capacity.defaultDurationMinutes;
  const occupiedSpan = duration + capacity.bufferMinutes;

  // Janela ampla o suficiente para pegar reservas que atravessam a meia-noite.
  const dayStart = toInstant(date, "00:00", capacity.timezone);
  const busy = await loadBusyIntervals(
    addMinutes(dayStart, -occupiedSpan),
    addMinutes(dayStart, 24 * 60 + occupiedSpan),
  );

  const slots: Slot[] = [];

  for (const window of day.windows) {
    const opens = timeToMinutes(window.opensAt);
    const closes = timeToMinutes(window.closesAt);

    // Último horário reservável: a refeição precisa caber antes do fechamento.
    // O buffer de turnover não conta aqui — a equipe limpa depois de fechar.
    for (let m = opens; m + duration <= closes; m += capacity.slotIntervalMinutes) {
      const time = minutesToTime(m);
      const start = toInstant(date, time, capacity.timezone);

      if (start < earliest || start > latest) continue;

      const end = addMinutes(start, occupiedSpan);
      const remaining = day.capacity - occupancyIn(busy, start, end);

      if (remaining >= partySize) {
        slots.push({ time, remaining, shiftName: window.shiftName });
      }
    }
  }

  return slots;
}

/**
 * Primeiro dia, a partir de hoje, que tem horário livre para `partySize`.
 *
 * A página abre nesta data em vez de hoje: quem chega às 22h de uma sexta não
 * deve encontrar "lotado" como primeira resposta — deve encontrar a próxima
 * mesa livre. Devolve `null` se nada couber na janela pesquisada.
 */
export async function findFirstAvailableDate(
  partySize: number,
  settings: Settings,
  searchDays = 14,
): Promise<string | null> {
  const today = todayInTimezone(settings.capacity.timezone);
  const cursor = new Date(`${today}T00:00:00.000Z`);
  const dias: string[] = [];
  for (let i = 0; i < searchDays; i++) {
    dias.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Os meses da janela de uma vez (três consultas cada, em paralelo), e não
  // um dia de cada vez: eram até 14 dias em fila, várias idas ao banco por
  // dia, antes de a página de reserva abrir.
  const { rules } = settings;
  if (!rules.isActive || partySize < rules.minPartySize || partySize > rules.maxPartySize) return null;
  const meses = [...new Set(dias.map((d) => d.slice(0, 7)))];
  const situacao = Object.assign({}, ...(await Promise.all(meses.map((m) => getMonthDays(m, settings)))));
  return dias.find((d) => (situacao[d]?.vagas ?? 0) >= partySize) ?? null;
}

// ---------------------------------------------------------------------------
// Checagem de uma reserva específica
// ---------------------------------------------------------------------------

type CheckInput = { date: string; time: string; partySize: number };

/**
 * Validação completa de um pedido de reserva.
 *
 * Sem transação — serve para pré-checagem na tela. A criação definitiva roda
 * de novo esta validação dentro de uma transação com advisory lock
 * (ver `lib/actions/reservations.ts`), que é o que impede overbooking em
 * pedidos simultâneos.
 */
export async function checkAvailability(
  input: CheckInput,
  settings?: Settings,
): Promise<AvailabilityResult> {
  const { rules, capacity } = settings ?? (await getSettings());
  const { date, time, partySize } = input;

  if (!rules.isActive) {
    return {
      ok: false,
      reason: "RESERVATIONS_DISABLED",
      message: "As reservas estão temporariamente indisponíveis.",
    };
  }

  if (partySize < rules.minPartySize) {
    return {
      ok: false,
      reason: "PARTY_TOO_SMALL",
      message: `Reservas a partir de ${rules.minPartySize} pessoa(s).`,
    };
  }

  if (partySize > rules.maxPartySize) {
    return {
      ok: false,
      reason: "PARTY_TOO_LARGE",
      message: `Para grupos acima de ${rules.maxPartySize} pessoas, fale com o restaurante — organizamos a reserva pessoalmente.`,
    };
  }

  const now = new Date();
  const start = toInstant(date, time, capacity.timezone);

  if (start <= now) {
    return {
      ok: false,
      reason: "PAST_DATE",
      message: "Este horário já passou.",
    };
  }

  const earliest = add(now, advanceDuration(rules.minAdvanceValue, rules.minAdvanceUnit));
  if (start < earliest) {
    return {
      ok: false,
      reason: "TOO_SOON",
      message: `Reservas precisam de ${rules.minAdvanceValue} ${advanceUnitLabel(rules.minAdvanceValue, rules.minAdvanceUnit)} de antecedência.`,
    };
  }

  const latest = add(now, advanceDuration(rules.maxAdvanceValue, rules.maxAdvanceUnit));
  if (start > latest) {
    return {
      ok: false,
      reason: "TOO_FAR",
      message: `Só aceitamos reservas com até ${rules.maxAdvanceValue} ${advanceUnitLabel(rules.maxAdvanceValue, rules.maxAdvanceUnit)} de antecedência.`,
    };
  }

  const day = await getDayWindows(date, capacity);
  if (day.closed) {
    return {
      ok: false,
      reason: "CLOSED_DAY",
      message: day.note
        ? `Estamos fechados nesta data (${day.note}).`
        : "Estamos fechados nesta data.",
    };
  }

  const duration = capacity.defaultDurationMinutes;
  const minutes = timeToMinutes(time);
  const insideWindow = day.windows.some(
    (w) =>
      minutes >= timeToMinutes(w.opensAt) &&
      minutes + duration <= timeToMinutes(w.closesAt),
  );

  if (!insideWindow) {
    return {
      ok: false,
      reason: "OUTSIDE_HOURS",
      message: "Este horário está fora do nosso funcionamento nesta data.",
    };
  }

  const end = addMinutes(start, duration + capacity.bufferMinutes);
  const busy = await loadBusyIntervals(start, end);
  const remaining = day.capacity - occupancyIn(busy, start, end);

  if (remaining < partySize) {
    return {
      ok: false,
      reason: "NO_CAPACITY",
      message:
        remaining > 0
          ? `Neste horário só temos ${remaining} lugar(es) disponível(is).`
          : "Este horário está lotado. Escolha outro horário.",
    };
  }

  return {
    ok: true,
    startTime: start,
    endTime: end,
    durationMinutes: duration,
    remaining: remaining - partySize,
    // A tríade de aprovação: acima do limite automático a reserva não é
    // recusada — ela entra como PENDING e aparece no painel.
    needsManualApproval:
      rules.manualIfOverLimit && partySize > rules.autoApproveUpTo,
  };
}

function advanceUnitLabel(value: number, unit: AdvanceUnit): string {
  const plural = value !== 1;
  switch (unit) {
    case "MINUTES":
      return plural ? "minutos" : "minuto";
    case "HOURS":
      return plural ? "horas" : "hora";
    case "DAYS":
      return plural ? "dias" : "dia";
    case "WEEKS":
      return plural ? "semanas" : "semana";
    case "MONTHS":
      return plural ? "meses" : "mês";
  }
}

// ---------------------------------------------------------------------------
// Horários de serviço de um dia
// ---------------------------------------------------------------------------

/**
 * Os horários de início de serviço de uma data — a fonte única de "que horas
 * o restaurante senta gente" naquele dia. No modelo atual do Canto Verde
 * devolve `["11:30"]`; num feriado fechado, `[]`; numa data especial com
 * janela própria, os horários dela.
 *
 * Aqui o horário é regra do restaurante, não escolha de quem digita: os
 * formulários do painel derivam a hora da data usando esta função, e o campo
 * de hora livre deixou de existir. SEM filtro de capacidade — lotação é
 * conferida na gravação, dentro da transação.
 */
export function seatingTimesFromWindows(
  windows: OpenWindow[],
  capacity: Pick<
    CapacitySettings,
    "defaultDurationMinutes" | "slotIntervalMinutes"
  >,
): string[] {
  const times: string[] = [];
  for (const w of windows) {
    const opens = timeToMinutes(w.opensAt);
    const closes = timeToMinutes(w.closesAt);
    for (
      let m = opens;
      m + capacity.defaultDurationMinutes <= closes;
      m += capacity.slotIntervalMinutes
    ) {
      times.push(minutesToTime(m));
    }
  }
  return times;
}

export async function getSeatingTimes(
  date: string,
  settings?: Settings,
): Promise<string[]> {
  const { capacity } = settings ?? (await getSettings());
  const day = await getDayWindows(date, capacity);
  if (day.closed) return [];
  return seatingTimesFromWindows(day.windows, capacity);
}

// ---------------------------------------------------------------------------
// O mês inteiro, para o calendário da página pública
// ---------------------------------------------------------------------------

export type DayStatus = {
  closed: boolean;
  /** Nota da data especial — o motivo do fechamento, quando há um. */
  note: string | null;
  /** Horários de serviço do dia; vazio quando fechado. */
  times: string[];
  /** O maior grupo que ainda cabe no melhor horário do dia (0 = cheio). */
  vagas: number;
  /** Nem o menor grupo cabe mais: o dia está lotado. */
  lotado: boolean;
  /** Ainda cabe, mas sobra menos de um terço do salão. */
  poucas: boolean;
};

/**
 * Situação de cada dia de um mês, em duas consultas.
 *
 * O calendário do cliente precisa saber, de uma vez, quais dias estão abertos
 * — chamar `getDayWindows` dia a dia custaria dezenas de idas ao banco. Aqui a
 * grade da semana e as datas especiais vêm em bloco e a decisão de cada dia
 * roda em memória, pela MESMA função pura que serve o caminho de um dia só.
 *
 * Sem contagem de reservas de propósito: quantos lugares sobram depende do
 * tamanho do grupo, que só é perguntado na etapa seguinte. Aqui a pergunta é
 * apenas "a casa abre neste dia?".
 */
export async function getMonthDays(
  month: string,
  settings?: Settings,
): Promise<Record<string, DayStatus>> {
  const { rules, capacity } = settings ?? (await getSettings());

  // A antecedência vale aqui pelo mesmo motivo que vale em `getAvailableSlots`:
  // hoje às 10h o almoço das 11:30 já passou do prazo, e um calendário que
  // ainda oferece esse dia empurra o erro para depois do toque.
  const now = new Date();
  const earliest = add(now, advanceDuration(rules.minAdvanceValue, rules.minAdvanceUnit));
  const latest = add(now, advanceDuration(rules.maxAdvanceValue, rules.maxAdvanceUnit));

  const [year, monthIndex] = [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1];
  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

  // Datas especiais vencidas nunca contam — mesma regra de `findSpecialDate`.
  const today = todayInTimezone(capacity.timezone);
  const from = monthStart < toDateOnly(today) ? toDateOnly(today) : monthStart;

  // As reservas do mês inteiro numa consulta só: é o que diz, dia a dia,
  // se ainda cabe gente ("poucas vagas", "lotado") sem uma ida por dia.
  const occupiedSpan = capacity.defaultDurationMinutes + capacity.bufferMinutes;
  const [specials, hours, busy] = await Promise.all([
    prisma.specialDate.findMany({
      where: { date: { gte: from, lt: monthEnd } },
    }),
    prisma.businessHours.findMany({
      where: { isActive: true },
      orderBy: { opensAt: "asc" },
    }),
    loadBusyIntervals(
      addMinutes(toInstant(`${month}-01`, "00:00", capacity.timezone), -occupiedSpan),
      addMinutes(toInstant(dateOnlyToString(monthEnd), "00:00", capacity.timezone), occupiedSpan),
    ),
  ]);

  const specialByDate = new Map(specials.map((s) => [dateOnlyToString(s.date), s]));
  const hoursByWeekday = new Map<number, BusinessHours[]>();
  for (const h of hours) {
    hoursByWeekday.set(h.dayOfWeek, [...(hoursByWeekday.get(h.dayOfWeek) ?? []), h]);
  }

  const result: Record<string, DayStatus> = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const day = resolveDayWindows(
      specialByDate.get(iso) ?? null,
      hoursByWeekday.get(dayOfWeekFor(iso)) ?? [],
      capacity,
    );
    const times = day.closed
      ? []
      : seatingTimesFromWindows(day.windows, capacity).filter((time) => {
          const start = toInstant(iso, time, capacity.timezone);
          return start >= earliest && start <= latest;
        });
    // A mesma conta de `getAvailableSlots`: lugares menos quem já está
    // sentado no intervalo da refeição, no melhor horário do dia.
    const vagas = times.reduce((melhor, time) => {
      const start = toInstant(iso, time, capacity.timezone);
      const livre = day.capacity - occupancyIn(busy, start, addMinutes(start, occupiedSpan));
      return Math.max(melhor, livre);
    }, 0);
    const lotado = times.length > 0 && vagas < rules.minPartySize;
    result[iso] = {
      closed: day.closed,
      note: day.note,
      times,
      vagas: Math.max(0, vagas),
      lotado,
      poucas: !lotado && times.length > 0 && vagas < day.capacity / 3,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Diagnóstico da grade (usado no painel de capacidade)
// ---------------------------------------------------------------------------

/**
 * Quantos horários um dia da semana gera com a configuração atual.
 * Um dia marcado como aberto que produz pouquíssimos horários costuma ser
 * erro de cadastro, não decisão — o painel avisa em vez de deixar passar.
 */
export function countSlotsForWindows(
  windows: OpenWindow[],
  capacity: Pick<
    CapacitySettings,
    "defaultDurationMinutes" | "slotIntervalMinutes"
  >,
): number {
  let count = 0;
  for (const w of windows) {
    const opens = timeToMinutes(w.opensAt);
    const closes = timeToMinutes(w.closesAt);
    for (
      let m = opens;
      m + capacity.defaultDurationMinutes <= closes;
      m += capacity.slotIntervalMinutes
    ) {
      count++;
    }
  }
  return count;
}
