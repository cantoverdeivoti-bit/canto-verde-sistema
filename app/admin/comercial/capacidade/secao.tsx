import { Armchair, CalendarX, Clock } from "lucide-react";

import { CartaoDeSecao } from "@/components/pagina";
import { countSlotsForWindows, getSettings, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { plural } from "@/lib/format";

import { CapacityForm } from "./capacity-form";
import { HoursGrid } from "./hours-grid";
import { SpecialDates } from "./special-dates";

const DAY_NAMES = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export default async function CapacityPage() {
  const { capacity } = await getSettings();

  const [hours, specialDates] = await Promise.all([
    prisma.businessHours.findMany({
      orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }],
    }),
    prisma.specialDate.findMany({ orderBy: { date: "asc" } }),
  ]);

  // Alerta de grade rala: dia ativo que gera menos horários que o limiar.
  const sparseDays = Array.from({ length: 7 }, (_, day) => {
    const windows = hours
      .filter((h) => h.dayOfWeek === day && h.isActive)
      .map((h) => ({ opensAt: h.opensAt, closesAt: h.closesAt, shiftName: h.shiftName }));
    if (windows.length === 0) return null; // dia fechado é decisão, não erro
    const slots = countSlotsForWindows(windows, capacity);
    return slots < capacity.minSlotsWarningThreshold
      ? { day: DAY_NAMES[day], slots }
      : null;
  }).filter(Boolean) as { day: string; slots: number }[];

  const today = todayInTimezone(capacity.timezone);
  const pastDates = specialDates.filter(
    (d) => d.date.toISOString().slice(0, 10) < today,
  );

  return (
    <>
      {/* O salão: o número de lugares, que segura todas as reservas. */}
      <CartaoDeSecao id="capacidade" icone={Armchair} titulo="Salão" frase="Quantas pessoas cabem ao mesmo tempo.">
        <CapacityForm
          initial={{
            name: capacity.name,
            timezone: capacity.timezone,
            totalCapacity: capacity.totalCapacity,
            defaultDurationMinutes: capacity.defaultDurationMinutes,
            bufferMinutes: capacity.bufferMinutes,
            slotIntervalMinutes: capacity.slotIntervalMinutes,
            minSlotsWarningThreshold: capacity.minSlotsWarningThreshold,
          }}
        />
      </CartaoDeSecao>

      {/* A semana deitada precisa da largura inteira do cartão. */}
      <CartaoDeSecao id="horarios" icone={Clock} titulo="Horários da semana" frase="Quando o restaurante abre, turno por turno.">
        {sparseDays.length > 0 && (
          <div className="msg-warn">
            <p className="font-semibold">Grade de horários rala</p>
            <p className="mt-1">
              {sparseDays.map((d) => `${d.day} gera só ${plural(d.slots, "horário")}`).join("; ")}. Se o dia deveria estar
              aberto normalmente, confira abertura e fechamento: uma janela curta demais limita as reservas mais do que
              qualquer outra regra.
            </p>
          </div>
        )}
        <HoursGrid
          initial={hours.map((h) => ({
            dayOfWeek: h.dayOfWeek,
            shiftName: h.shiftName ?? "",
            opensAt: h.opensAt,
            closesAt: h.closesAt,
            isActive: h.isActive,
          }))}
        />
      </CartaoDeSecao>

      <CartaoDeSecao
        id="datas"
        icone={CalendarX}
        titulo="Feriados e datas especiais"
        frase="Fechar uma data, mudar o horário de um dia ou reduzir a lotação."
      >
        {pastDates.length > 0 && (
          <p className="rounded-lg bg-[var(--muted)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
            {plural(pastDates.length, "data já vencida", "datas já vencidas")} no cadastro. O calendário ignora; dá para
            remover abaixo.
          </p>
        )}
        <SpecialDates
          items={specialDates.map((d) => ({
            id: d.id,
            date: d.date.toISOString().slice(0, 10),
            isClosed: d.isClosed,
            opensAt: d.opensAt,
            closesAt: d.closesAt,
            capacityOverride: d.capacityOverride,
            note: d.note,
            isPast: d.date.toISOString().slice(0, 10) < today,
          }))}
        />
      </CartaoDeSecao>
    </>
  );
}
