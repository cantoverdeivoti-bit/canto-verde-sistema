"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireModule } from "@/lib/auth-guard";
import { toDateOnly, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { ehDocumento, PARENTESCOS } from "@/lib/documentos-admissao";
import { FUSO_DA_CASA } from "@/lib/format";
import { cpfOpcional, dateString } from "@/lib/validations";

type Simples = { ok: boolean; message?: string };
const CONFIGURAR = { configure: true } as const;

const feito = (colaboradorId: number) => revalidatePath(`/admin/pessoal/colaboradores/${colaboradorId}`);

/**
 * O estado de um documento sem arquivo: entregue (a casa viu o original),
 * não se aplica, ou volta a faltar (apaga, e o arquivo vai junto).
 */
export async function marcarDocumento(colaboradorId: number, tipo: string, estado: "entregue" | "nao-se-aplica" | "falta"): Promise<Simples> {
  await requireModule("pessoal", CONFIGURAR);
  if (!ehDocumento(tipo)) return { ok: false, message: "Documento desconhecido." };
  const chave = { colaboradorId_tipo: { colaboradorId, tipo } };
  if (estado === "falta") {
    await prisma.documentoDoColaborador.deleteMany({ where: { colaboradorId, tipo } });
  } else {
    const dados = { naoSeAplica: estado === "nao-se-aplica", entregueEm: toDateOnly(todayInTimezone(FUSO_DA_CASA)) };
    await prisma.documentoDoColaborador.upsert({ where: chave, create: { colaboradorId, tipo, ...dados }, update: dados });
  }
  feito(colaboradorId);
  return { ok: true };
}

const dependenteSchema = z.object({
  nome: z.string().trim().min(2, { error: "Digite o nome." }).max(80, { error: "Nome muito longo." }),
  parentesco: z.enum(PARENTESCOS, { error: "Escolha o parentesco." }),
  nascimento: z.union([dateString, z.literal("")]).transform((v) => v || null),
  cpf: cpfOpcional,
});
export type DependenteInput = z.input<typeof dependenteSchema>;

export async function salvarDependente(colaboradorId: number, id: number | null, raw: DependenteInput): Promise<Simples> {
  await requireModule("pessoal", CONFIGURAR);
  const p = dependenteSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: p.error.issues[0]?.message ?? "Dados inválidos." };
  const dados = { ...p.data, nascimento: p.data.nascimento ? toDateOnly(p.data.nascimento) : null };
  if (id === null) await prisma.dependente.create({ data: { colaboradorId, ...dados } });
  else await prisma.dependente.update({ where: { id, colaboradorId }, data: dados });
  feito(colaboradorId);
  return { ok: true };
}

export async function apagarDependente(colaboradorId: number, id: number): Promise<Simples> {
  await requireModule("pessoal", CONFIGURAR);
  await prisma.dependente.deleteMany({ where: { id, colaboradorId } });
  feito(colaboradorId);
  return { ok: true };
}
