"use server";

import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

export type ResultadoPainel = { ok: boolean; message?: string };

/** Guarda (ou apaga, em branco) o link do painel de reservas do Google. */
export async function salvarPainelReservas(_: ResultadoPainel | null, form: FormData): Promise<ResultadoPainel> {
  await requireModule("comercial", { configure: true });

  const url = String(form.get("url") ?? "").trim();
  if (url) {
    let ok = false;
    try {
      const u = new URL(url);
      ok = u.protocol === "https:" && (u.hostname === "script.google.com" || u.hostname.endsWith(".googleusercontent.com"));
    } catch {}
    if (!ok) return { ok: false, message: "Cole o link do painel, que começa com https://script.google.com/" };
  }

  await prisma.reservationRules.update({ where: { id: 1 }, data: { painelReservasUrl: url || null } });
  revalidatePath("/admin/comercial/painel");
  return { ok: true };
}
