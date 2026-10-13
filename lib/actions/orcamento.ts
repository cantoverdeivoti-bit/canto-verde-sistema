"use server";

import { revalidatePath } from "next/cache";

import { getSettings, todayInTimezone } from "@/lib/availability";
import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { segundaDaSemana } from "@/lib/orcamento";

type Simples = { ok: boolean; message?: string };

/**
 * O orçamento da semana de hoje: faturamento da semana anterior e meta de CMV.
 * Pode ser chamada de novo na mesma semana para corrigir.
 */
export async function definirOrcamentoDaSemana(faturamento: number, metaCmv: number): Promise<Simples> {
  await requireModule("compras");
  if (!Number.isFinite(faturamento) || faturamento <= 0)
    return { ok: false, message: "Digite o faturamento da semana anterior." };
  if (!Number.isFinite(metaCmv) || metaCmv <= 0 || metaCmv > 100)
    return { ok: false, message: "A meta de CMV é uma porcentagem entre 1 e 100." };

  const { capacity } = await getSettings();
  const semana = new Date(`${segundaDaSemana(todayInTimezone(capacity.timezone))}T00:00:00.000Z`);
  const dados = {
    faturamentoAnterior: Math.round(faturamento * 100) / 100,
    metaCmv: Math.round(metaCmv * 100) / 100,
  };
  await prisma.orcamentoSemana.upsert({
    where: { semana },
    create: { semana, ...dados },
    update: dados,
  });
  revalidatePath("/admin/compras", "layout");
  return { ok: true };
}
