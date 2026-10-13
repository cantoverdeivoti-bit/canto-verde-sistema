"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireModule } from "@/lib/auth-guard";
import { toDateOnly } from "@/lib/availability";
import { limparContadores } from "@/lib/contadores";
import { prisma } from "@/lib/db";
import { esvaziarVencidos, guardarNaLixeira } from "@/lib/lixeira";
import { dateString } from "@/lib/validations";

type Simples = { ok: boolean; message?: string };

const MODULO = "pessoal";

function feito() {
  revalidatePath("/admin/pessoal", "layout");
  limparContadores();
}

const primeiroErro = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";

const entregaSchema = z.object({
  colaboradorId: z.number().int().positive({ error: "Escolha a pessoa." }),
  itemId: z.number().int().positive({ error: "Escolha o item." }),
  data: dateString,
  quantidade: z.number().int().min(1, { error: "Pelo menos 1." }).max(50, { error: "No máximo 50." }),
  tamanho: z
    .string()
    .trim()
    .max(10, { error: "Tamanho: no máximo 10 letras." })
    .transform((v) => v || null),
  proximaTroca: z.union([dateString, z.literal("")]).transform((v) => v || null),
  observacao: z
    .string()
    .trim()
    .max(200, { error: "Observação: no máximo 200 letras." })
    .transform((v) => v || null),
});
export type EntregaInput = z.input<typeof entregaSchema>;

/**
 * Registra a entrega de um EPI ou uniforme. A entrega anterior do mesmo item
 * para a mesma pessoa fica como substituída nesse dia: deixa de cobrar troca,
 * mas continua no termo.
 */
export async function registrarEntrega(raw: EntregaInput): Promise<Simples> {
  await requireModule(MODULO);
  const p = entregaSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  const v = p.data;
  if (v.proximaTroca && v.proximaTroca <= v.data) return { ok: false, message: "A troca tem de ser depois do dia da entrega." };
  const [pessoa, item] = await Promise.all([
    prisma.colaborador.findUnique({ where: { id: v.colaboradorId }, select: { ativo: true } }),
    prisma.itemDeEpi.findUnique({ where: { id: v.itemId }, select: { ativo: true } }),
  ]);
  if (!pessoa?.ativo) return { ok: false, message: "Essa pessoa não está ativa. Recarregue a página." };
  if (!item?.ativo) return { ok: false, message: "Esse item está desligado. Recarregue a página." };
  try {
    await prisma.$transaction([
      prisma.entregaDeEpi.updateMany({
        where: { colaboradorId: v.colaboradorId, itemId: v.itemId, substituidaEm: null },
        data: { substituidaEm: toDateOnly(v.data) },
      }),
      prisma.entregaDeEpi.create({
        data: {
          colaboradorId: v.colaboradorId,
          itemId: v.itemId,
          data: toDateOnly(v.data),
          quantidade: v.quantidade,
          tamanho: v.tamanho,
          proximaTroca: v.proximaTroca ? toDateOnly(v.proximaTroca) : null,
          observacao: v.observacao,
        },
      }),
    ]);
    feito();
    return { ok: true };
  } catch (error) {
    console.error("[registrarEntrega] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

/** Na conferência: a peça precisa de troca antes da data (ou voltou a estar boa). */
export async function marcarDesgastado(id: number, desgastado: boolean): Promise<Simples> {
  await requireModule(MODULO);
  try {
    await prisma.entregaDeEpi.update({ where: { id }, data: { desgastado } });
    feito();
    return { ok: true };
  } catch {
    return { ok: false, message: "Essa entrega não existe mais. Recarregue a página." };
  }
}

/**
 * Apaga uma entrega lançada por engano. A que ela tinha substituído volta a
 * valer, para a troca dessa continuar cobrada.
 */
export async function apagarEntrega(id: number): Promise<Simples & { lixeiraId?: number }> {
  const user = await requireModule(MODULO);
  const e = await prisma.entregaDeEpi.findUnique({
    where: { id },
    include: { item: { select: { nome: true } }, colaborador: { select: { nome: true, apelido: true } } },
  });
  if (!e) return { ok: false, message: "Essa entrega não existe mais. Recarregue a página." };
  const anterior =
    e.substituidaEm === null
      ? await prisma.entregaDeEpi.findFirst({
          where: { colaboradorId: e.colaboradorId, itemId: e.itemId, id: { not: id } },
          orderBy: [{ data: "desc" }, { id: "desc" }],
          select: { id: true, substituidaEm: true },
        })
      : null;
  const { item, colaborador, ...entrega } = e;
  // Vai para a lixeira com a anterior, para a volta deixar tudo como estava.
  const lixeiraId = await prisma.$transaction(async (tx) => {
    const guardado = await guardarNaLixeira(tx, {
      tipo: "entregaDeEpi",
      rotulo: `${item.nome} para ${colaborador.apelido ?? colaborador.nome}`,
      dados: { entrega, anterior },
      apagadoPor: user.name ?? user.username,
    });
    await tx.entregaDeEpi.delete({ where: { id } });
    if (anterior) await tx.entregaDeEpi.update({ where: { id: anterior.id }, data: { substituidaEm: null } });
    return guardado;
  });
  await esvaziarVencidos();
  feito();
  return { ok: true, lixeiraId };
}

const itemSchema = z.object({
  nome: z.string().trim().min(2, { error: "Digite o nome do item." }).max(60, { error: "Nome: no máximo 60 letras." }),
  ca: z
    .string()
    .trim()
    .max(20, { error: "CA: no máximo 20 letras." })
    .transform((v) => v || null),
  trocaEmDias: z.number().int().min(1, { error: "A troca é em pelo menos 1 dia." }).max(3650, { error: "No máximo 10 anos." }).nullable(),
});
export type ItemDeEpiInput = z.input<typeof itemSchema>;

/** Cria (id nulo) ou muda um item de EPI ou uniforme. Só quem configura o módulo. */
export async function salvarItemDeEpi(id: number | null, raw: ItemDeEpiInput): Promise<Simples> {
  await requireModule(MODULO, { configure: true });
  const p = itemSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  try {
    if (id === null) {
      const ultimo = await prisma.itemDeEpi.aggregate({ _max: { ordem: true } });
      await prisma.itemDeEpi.create({ data: { ...p.data, ordem: (ultimo._max.ordem ?? 0) + 1 } });
    } else {
      await prisma.itemDeEpi.update({ where: { id }, data: p.data });
    }
    feito();
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") return { ok: false, message: "Já existe um item com esse nome." };
    console.error("[salvarItemDeEpi] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

/** Desligado, o item sai da lista de entrega; as entregas dele ficam. */
export async function ligarItemDeEpi(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO, { configure: true });
  await prisma.itemDeEpi.update({ where: { id }, data: { ativo } });
  feito();
  return { ok: true };
}
