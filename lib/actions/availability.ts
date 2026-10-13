"use server";

import {
  getAvailableSlots,
  getDayWindows,
  getMonthDays,
  getSeatingTimes,
  getSettings,
  type DayStatus,
  type Slot,
} from "@/lib/availability";

export type SlotsResult = {
  slots: Slot[];
  /** Motivo de a lista vir vazia — para a tela explicar em vez de só sumir. */
  emptyReason: "CLOSED" | "FULL" | "PARTY_SIZE" | null;
  note: string | null;
};

/**
 * Grade de horários para a data e o tamanho de grupo escolhidos.
 * Chamada pelo formulário público a cada mudança de data ou nº de pessoas.
 */
export async function fetchSlots(
  date: string,
  partySize: number,
): Promise<SlotsResult> {
  const settings = await getSettings();

  if (
    partySize < settings.rules.minPartySize ||
    partySize > settings.rules.maxPartySize
  ) {
    return { slots: [], emptyReason: "PARTY_SIZE", note: null };
  }

  const day = await getDayWindows(date, settings.capacity);

  if (day.closed) {
    return { slots: [], emptyReason: "CLOSED", note: day.note };
  }

  const slots = await getAvailableSlots(date, partySize, settings);

  return {
    slots,
    emptyReason: slots.length === 0 ? "FULL" : null,
    note: day.note,
  };
}

/**
 * Horários de serviço da data, para os formulários do painel exibirem a hora
 * resolvida ao escolher o dia — a hora deriva do dia, ninguém digita.
 */
export async function fetchSeatingTimes(date: string): Promise<string[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  return getSeatingTimes(date);
}

/**
 * Situação de cada dia do mês, para o calendário da reserva guiada saber
 * quais dias abrem antes de o cliente tocar em qualquer um.
 */
export async function fetchMonthDays(
  month: string,
): Promise<Record<string, DayStatus>> {
  if (!/^\d{4}-\d{2}$/.test(month)) return {};
  return getMonthDays(month);
}
