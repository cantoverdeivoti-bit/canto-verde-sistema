"use server";

import { revalidatePath, updateTag } from "next/cache";

import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import {
  businessHoursRowSchema,
  capacitySettingsSchema,
  notificationSettingsSchema,
  reservationRulesSchema,
  specialDateSchema,
} from "@/lib/validations";
import { getSettings, TAG_CONFIGURACOES, toDateOnly, todayInTimezone } from "@/lib/availability";
import { z } from "zod";

export type SettingsResult = { ok: boolean; message?: string };

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

function revalidateAll() {
  // As configurações ficam guardadas entre as telas (`getSettings`): limpa
  // agora, para a próxima tela já ler o valor novo.
  updateTag(TAG_CONFIGURACOES);
  // Configuração muda o que a página pública oferece — revalida as duas pontas.
  revalidatePath("/");
  revalidatePath("/admin", "layout");
}

// ---------------------------------------------------------------------------
// Domínio 1 — Regras
// ---------------------------------------------------------------------------

export async function updateRules(raw: unknown): Promise<SettingsResult> {
  await requireModule("comercial", { configure: true });

  const parsed = reservationRulesSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  await prisma.reservationRules.update({ where: { id: 1 }, data: parsed.data });
  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Domínio 2 — Capacidade
// ---------------------------------------------------------------------------

export async function updateCapacity(raw: unknown): Promise<SettingsResult> {
  await requireModule("comercial", { configure: true });

  const parsed = capacitySettingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  await prisma.capacitySettings.update({ where: { id: 1 }, data: parsed.data });
  revalidateAll();
  return { ok: true };
}

const weeklyHoursSchema = z.array(businessHoursRowSchema).max(30);

/** Substitui a grade semanal inteira — a tela edita a semana como um todo. */
export async function updateBusinessHours(raw: unknown): Promise<SettingsResult> {
  await requireModule("comercial", { configure: true });

  const parsed = weeklyHoursSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  // Turnos do mesmo dia não podem se sobrepor (almoço 11:30–15:00 e jantar
  // 15:00–23:00 são válidos; 11:30–16:00 e 15:00–23:00 não).
  for (let day = 0; day <= 6; day++) {
    const shifts = parsed.data
      .filter((h) => h.dayOfWeek === day)
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    for (let i = 1; i < shifts.length; i++) {
      if (shifts[i].opensAt < shifts[i - 1].closesAt) {
        return {
          ok: false,
          message: `Os turnos de ${DAY_NAMES[day]} se sobrepõem (${shifts[i - 1].opensAt}–${shifts[i - 1].closesAt} e ${shifts[i].opensAt}–${shifts[i].closesAt}).`,
        };
      }
    }
  }

  await prisma.$transaction([
    prisma.businessHours.deleteMany({}),
    prisma.businessHours.createMany({ data: parsed.data }),
  ]);

  revalidateAll();
  return { ok: true };
}

const DAY_NAMES = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];

export async function addSpecialDate(raw: unknown): Promise<SettingsResult> {
  await requireModule("comercial", { configure: true });

  const parsed = specialDateSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { date, ...rest } = parsed.data;

  await prisma.specialDate.upsert({
    where: { date: toDateOnly(date) },
    update: {
      isClosed: rest.isClosed,
      opensAt: rest.opensAt || null,
      closesAt: rest.closesAt || null,
      capacityOverride: rest.capacityOverride ?? null,
      note: rest.note || null,
    },
    create: {
      date: toDateOnly(date),
      isClosed: rest.isClosed,
      opensAt: rest.opensAt || null,
      closesAt: rest.closesAt || null,
      capacityOverride: rest.capacityOverride ?? null,
      note: rest.note || null,
    },
  });

  revalidateAll();
  return { ok: true };
}

const diaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida." });

/**
 * O cadeado da tela Reservas do dia: fecha o dia inteiro (feriado, evento
 * fechado). É a mesma data especial de Configurações, com `isClosed`: o link
 * de reservas para de oferecer o dia e o "Anotar reserva" recusa. As reservas
 * que já estavam marcadas continuam; quem fecha avisa os clientes.
 */
export async function fecharDia(data: string, motivo?: string): Promise<SettingsResult> {
  await requireModule("comercial", { configure: true });
  const d = diaSchema.safeParse(data);
  if (!d.success) return { ok: false, message: firstError(d.error) };
  const { capacity } = await getSettings();
  if (d.data < todayInTimezone(capacity.timezone)) return { ok: false, message: "Esse dia já passou." };
  const note = motivo?.trim().slice(0, 200) || null;
  await prisma.specialDate.upsert({
    where: { date: toDateOnly(d.data) },
    update: { isClosed: true, opensAt: null, closesAt: null, capacityOverride: null, note },
    create: { date: toDateOnly(d.data), isClosed: true, note },
  });
  revalidateAll();
  return { ok: true };
}

/**
 * Desfaz o cadeado: apaga o fechamento do dia. O dia fechado pela grade da
 * semana (sem horário naquele dia da semana) não abre por aqui: abrir um dia
 * desses pede um horário, e isso é em Configurações.
 */
export async function abrirDia(data: string): Promise<SettingsResult> {
  await requireModule("comercial", { configure: true });
  const d = diaSchema.safeParse(data);
  if (!d.success) return { ok: false, message: firstError(d.error) };
  const apagados = await prisma.specialDate.deleteMany({ where: { date: toDateOnly(d.data), isClosed: true } });
  if (apagados.count === 0) {
    return { ok: false, message: "Esse dia é fechado pelo horário da semana. Para abrir, use Configurações de reservas." };
  }
  revalidateAll();
  return { ok: true };
}

export async function removeSpecialDate(id: number): Promise<SettingsResult> {
  await requireModule("comercial", { configure: true });

  await prisma.specialDate.delete({ where: { id } }).catch(() => null);
  revalidateAll();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Domínio 3 — Notificação
// ---------------------------------------------------------------------------

export async function updateNotifications(raw: unknown): Promise<SettingsResult> {
  await requireModule("comercial", { configure: true });

  const parsed = notificationSettingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  await prisma.notificationSettings.update({
    where: { id: 1 },
    data: parsed.data,
  });
  revalidateAll();
  return { ok: true };
}
