import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

/**
 * Cenários dos problemas 3 e 4 da análise: data especial vencida deve ser
 * ignorada; feriado futuro deve fechar o dia; grade rala deve ser detectável.
 * Usa o banco de dev e restaura tudo ao final.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function fetchSlotsHttp(date: string): Promise<string[]> {
  // Página pública renderiza server-side; mais simples consultar a lógica
  // diretamente via import não dá aqui (alias @). Refaz a conta pelo banco:
  const { getAvailableSlots } = await import("../lib/availability");
  const slots = await getAvailableSlots(date, 2);
  return slots.map((s) => s.time);
}

async function main() {
  const FUTURE_HOLIDAY = "2026-09-07"; // Independência, segunda-feira
  const PAST_DATE = "2025-11-02"; // o nextClosingDate vencido da análise
  const NORMAL_DAY = "2026-09-08";

  // --- problema 3: data vencida --------------------------------------------
  await prisma.specialDate.upsert({
    where: { date: new Date(`${PAST_DATE}T00:00:00.000Z`) },
    update: {},
    create: {
      date: new Date(`${PAST_DATE}T00:00:00.000Z`),
      isClosed: true,
      note: "resquício de configuração antiga",
    },
  });

  const normalSlots = await fetchSlotsHttp(NORMAL_DAY);
  check(
    "data vencida no cadastro não afeta o calendário",
    normalSlots.length > 0,
    `${normalSlots.length} slots num dia normal`,
  );

  // --- feriado futuro fecha o dia ------------------------------------------
  await prisma.specialDate.upsert({
    where: { date: new Date(`${FUTURE_HOLIDAY}T00:00:00.000Z`) },
    update: { isClosed: true, note: "Independência" },
    create: {
      date: new Date(`${FUTURE_HOLIDAY}T00:00:00.000Z`),
      isClosed: true,
      note: "Independência",
    },
  });

  const holidaySlots = await fetchSlotsHttp(FUTURE_HOLIDAY);
  check("feriado futuro zera a grade", holidaySlots.length === 0);

  // --- override de lotação --------------------------------------------------
  const EVENT_DATE = "2026-09-10";
  await prisma.specialDate.upsert({
    where: { date: new Date(`${EVENT_DATE}T00:00:00.000Z`) },
    update: {},
    create: {
      date: new Date(`${EVENT_DATE}T00:00:00.000Z`),
      isClosed: false,
      opensAt: "19:00",
      closesAt: "22:00",
      capacityOverride: 10,
      note: "evento fechado",
    },
  });

  const { getAvailableSlots } = await import("../lib/availability");
  const eventSlotsFor8 = await getAvailableSlots(EVENT_DATE, 8);
  const eventSlotsTimes = await getAvailableSlots(EVENT_DATE, 2);
  check(
    "override de horário vale na data especial",
    eventSlotsTimes.every((s) => s.time >= "19:00" && s.time <= "20:30"),
    eventSlotsTimes.map((s) => s.time).join(","),
  );
  check(
    "lotação reduzida do evento é respeitada",
    eventSlotsFor8.every((s) => s.remaining <= 10),
    `remaining max ${Math.max(...eventSlotsFor8.map((s) => s.remaining))}`,
  );

  // --- problema 4: grade rala detectada ------------------------------------
  const { countSlotsForWindows } = await import("../lib/availability");
  const sparse = countSlotsForWindows(
    [{ opensAt: "11:30", closesAt: "13:00", shiftName: null }],
    { defaultDurationMinutes: 90, slotIntervalMinutes: 30 },
  );
  check("janela de 90min gera exatamente 1 slot (grade rala)", sparse === 1, `${sparse}`);

  // --- restaura -------------------------------------------------------------
  // --- o mês inteiro de uma vez (getMonthDays) -----------------------------
  const { getMonthDays } = await import("../lib/availability");
  const month = await getMonthDays(NORMAL_DAY.slice(0, 7));
  check(
    "getMonthDays cobre todos os dias do mês",
    Object.keys(month).length === 30,
    `${Object.keys(month).length} dias em setembro`,
  );
  check(
    "dia normal do mês vem aberto às 11:30",
    month[NORMAL_DAY]?.closed === false &&
      month[NORMAL_DAY]?.times[0] === "11:30",
    JSON.stringify(month[NORMAL_DAY]),
  );
  check(
    "feriado vem fechado, com a nota",
    month[FUTURE_HOLIDAY]?.closed === true &&
      month[FUTURE_HOLIDAY]?.note === "Independência",
    JSON.stringify(month[FUTURE_HOLIDAY]),
  );
  check(
    "data especial com janela própria usa o horário dela",
    month[EVENT_DATE]?.closed === false &&
      month[EVENT_DATE]?.times[0] === "19:00",
    JSON.stringify(month[EVENT_DATE]),
  );

  // --- a hora deriva do dia (getSeatingTimes) ------------------------------
  const { getSeatingTimes } = await import("../lib/availability");
  const normalSeating = await getSeatingTimes(NORMAL_DAY);
  check(
    "dia normal tem exatamente um horário de serviço (11:30)",
    normalSeating.length === 1 && normalSeating[0] === "11:30",
    normalSeating.join(","),
  );
  const holidaySeating = await getSeatingTimes(FUTURE_HOLIDAY);
  check("feriado não tem horário de serviço", holidaySeating.length === 0);
  const eventSeating = await getSeatingTimes(EVENT_DATE);
  check(
    "data especial usa o horário da própria janela",
    eventSeating.length > 0 && eventSeating[0] === "19:00",
    eventSeating.join(","),
  );

  await prisma.specialDate.deleteMany({
    where: {
      date: {
        in: [PAST_DATE, FUTURE_HOLIDAY, EVENT_DATE].map(
          (d) => new Date(`${d}T00:00:00.000Z`),
        ),
      },
    },
  });

  console.log(failures === 0 ? "\nTodos os cenários passaram." : `\n${failures} falha(s).`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
