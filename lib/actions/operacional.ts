"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireModule } from "@/lib/auth-guard";
import { toDateOnly } from "@/lib/availability";
import { limparContadores } from "@/lib/contadores";
import { prisma } from "@/lib/db";
import { chave } from "@/lib/format";
import { moverNaLista, type Momento } from "@/lib/operacional-regras";
import { dateString } from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";

/**
 * As ações do módulo Operacional. Ver e imprimir é de quem tem o módulo;
 * mudar qualquer coisa pede "configurar".
 */

type Simples = { ok: boolean; message?: string };
type ComId = { ok: true; id: number } | { ok: false; message: string };

const MODULO = "operacional";
const CONFIGURAR = { configure: true } as const;

const primeiroErro = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";

async function gravar(nome: string, fn: () => Promise<unknown>): Promise<Simples> {
  try {
    await fn();
    revalidatePath("/admin/operacional", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, message: "Isso não existe mais. Recarregue a página." };
    }
    console.error(`[operacional:${nome}] falha:`, error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

const texto = (max: number, nome: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${nome}: no máximo ${max} letras.` })
    .transform((v) => v || null);

// ---------------------------------------------------------------------------
// Funções
// ---------------------------------------------------------------------------

export async function salvarDescricaoDaFuncao(funcaoId: number, descricao: string): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const d = texto(2000, "Descrição").safeParse(descricao);
  if (!d.success) return { ok: false, message: primeiroErro(d.error) };
  return gravar("descricao", () => prisma.funcao.update({ where: { id: funcaoId }, data: { descricao: d.data } }));
}

/** Liga ou desliga um processo como obrigatório da função. */
export async function marcarObrigatorio(funcaoId: number, processoId: number, obrigatorio: boolean): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const r = await gravar("obrigatorio", () =>
    obrigatorio
      ? prisma.processoDaFuncao.upsert({
          where: { funcaoId_processoId: { funcaoId, processoId } },
          create: { funcaoId, processoId },
          update: {},
        })
      : prisma.processoDaFuncao.deleteMany({ where: { funcaoId, processoId } }),
  );
  if (r.ok) limparContadores();
  return r;
}

// ---------------------------------------------------------------------------
// Checklists: folhas por departamento e subdepartamento, para imprimir
// ---------------------------------------------------------------------------

const nomeDoLugar = (o: string) =>
  z
    .string()
    .trim()
    .min(2, { error: `Dê um nome ao ${o}.` })
    .max(60, { error: "O nome pode ter no máximo 60 letras." });

const naoExiste = { ok: false as const, message: "Isso não existe mais. Recarregue a página." };

/** Cria o departamento com a folha dele (a do departamento todo). Devolve o id da folha. */
export async function criarDepartamento(nome: string): Promise<ComId> {
  await requireModule(MODULO, CONFIGURAR);
  const n = nomeDoLugar("departamento").safeParse(nome);
  if (!n.success) return { ok: false, message: primeiroErro(n.error) };
  const todos = await prisma.checklistDepartamento.findMany({ select: { nome: true } });
  if (todos.some((d) => chave(d.nome) === chave(n.data))) return { ok: false, message: `Já existe o departamento "${n.data}".` };
  try {
    const d = await prisma.checklistDepartamento.create({
      data: { nome: n.data, folhas: { create: { nome: null } } },
      select: { folhas: { select: { id: true } } },
    });
    revalidatePath("/admin/operacional", "layout");
    return { ok: true, id: d.folhas[0].id };
  } catch (error) {
    console.error("[operacional:criarDepartamento] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

export async function renomearDepartamento(id: number, nome: string): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const n = nomeDoLugar("departamento").safeParse(nome);
  if (!n.success) return { ok: false, message: primeiroErro(n.error) };
  const todos = await prisma.checklistDepartamento.findMany({ select: { id: true, nome: true } });
  if (todos.some((d) => d.id !== id && chave(d.nome) === chave(n.data))) return { ok: false, message: `Já existe o departamento "${n.data}".` };
  return gravar("renomearDepartamento", () => prisma.checklistDepartamento.update({ where: { id }, data: { nome: n.data } }));
}

/** Apaga o departamento com os subdepartamentos e as tarefas. */
export async function apagarDepartamento(id: number): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  return gravar("apagarDepartamento", () => prisma.checklistDepartamento.delete({ where: { id } }));
}

/** Cria um subdepartamento (Salão / Caixa). Devolve o id da folha. */
export async function criarSubdepartamento(departamentoId: number, nome: string): Promise<ComId> {
  await requireModule(MODULO, CONFIGURAR);
  const n = nomeDoLugar("subdepartamento").safeParse(nome);
  if (!n.success) return { ok: false, message: primeiroErro(n.error) };
  const irmaos = await prisma.checklistLista.findMany({ where: { departamentoId }, select: { nome: true } });
  if (irmaos.some((l) => l.nome !== null && chave(l.nome) === chave(n.data))) return { ok: false, message: `Já existe "${n.data}" neste departamento.` };
  try {
    const l = await prisma.checklistLista.create({ data: { departamentoId, nome: n.data }, select: { id: true } });
    revalidatePath("/admin/operacional", "layout");
    return { ok: true, id: l.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return naoExiste;
    console.error("[operacional:criarSubdepartamento] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

export async function renomearSubdepartamento(id: number, nome: string): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const n = nomeDoLugar("subdepartamento").safeParse(nome);
  if (!n.success) return { ok: false, message: primeiroErro(n.error) };
  const folha = await prisma.checklistLista.findUnique({ where: { id }, select: { departamentoId: true, nome: true } });
  if (!folha) return naoExiste;
  if (folha.nome === null) return { ok: false, message: "Esta é a folha do departamento todo: troque o nome do departamento." };
  const irmaos = await prisma.checklistLista.findMany({ where: { departamentoId: folha.departamentoId, NOT: { id } }, select: { nome: true } });
  if (irmaos.some((l) => l.nome !== null && chave(l.nome) === chave(n.data))) return { ok: false, message: `Já existe "${n.data}" neste departamento.` };
  return gravar("renomearSub", () => prisma.checklistLista.update({ where: { id }, data: { nome: n.data } }));
}

/** Apaga um subdepartamento com as tarefas. A folha do departamento todo não se apaga sozinha. */
export async function apagarSubdepartamento(id: number): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const folha = await prisma.checklistLista.findUnique({ where: { id }, select: { nome: true } });
  if (!folha) return naoExiste;
  if (folha.nome === null) return { ok: false, message: "Esta é a folha do departamento todo: para tirar, apague o departamento." };
  return gravar("apagarSub", () => prisma.checklistLista.delete({ where: { id } }));
}

const tarefaDoChecklist = z.object({
  listaId: z.number().int().positive(),
  momento: z.enum(["ABERTURA", "FECHAMENTO"], { error: "Escolha abertura ou fechamento." }),
  texto: z.string().trim().min(2, { error: "Escreva a tarefa." }).max(200, { error: "A tarefa pode ter no máximo 200 letras." }),
});
export type TarefaDoChecklistInput = z.input<typeof tarefaDoChecklist>;

/** A próxima ordem do momento: a tarefa nova (ou que mudou de momento) vai para o fim. */
async function ordemNoFim(listaId: number, momento: Momento) {
  const ultima = await prisma.checklistTarefa.aggregate({ where: { listaId, momento }, _max: { ordem: true } });
  return (ultima._max.ordem ?? 0) + 1;
}

/** Cria (id nulo) ou muda uma tarefa. Trocada de momento, vai para o fim do outro. */
export async function salvarTarefaDoChecklist(id: number | null, raw: TarefaDoChecklistInput): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const p = tarefaDoChecklist.safeParse(raw);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  const v = p.data;
  if (id === null) {
    const ordem = await ordemNoFim(v.listaId, v.momento);
    return gravar("criarTarefa", () => prisma.checklistTarefa.create({ data: { ...v, ordem } }));
  }
  const antes = await prisma.checklistTarefa.findUnique({ where: { id }, select: { momento: true } });
  if (!antes) return naoExiste;
  const ordem = antes.momento === v.momento ? undefined : await ordemNoFim(v.listaId, v.momento);
  return gravar("salvarTarefa", () => prisma.checklistTarefa.update({ where: { id }, data: { texto: v.texto, momento: v.momento, ordem } }));
}

export async function apagarTarefaDoChecklist(id: number): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  return gravar("apagarTarefa", () => prisma.checklistTarefa.delete({ where: { id } }));
}

/** Sobe ou desce uma tarefa no momento dela. Renumera o momento todo: ordens repetidas param de atrapalhar. */
export async function moverTarefaDoChecklist(id: number, sentido: -1 | 1): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const t = await prisma.checklistTarefa.findUnique({ where: { id }, select: { listaId: true, momento: true } });
  if (!t) return naoExiste;
  const irmas = await prisma.checklistTarefa.findMany({ where: { listaId: t.listaId, momento: t.momento }, select: { id: true, ordem: true } });
  const nova = moverNaLista(irmas, id, sentido)
    .map((x, i) => ({ id: x.id, antes: x.ordem, ordem: i + 1 }))
    .filter((x) => x.antes !== x.ordem);
  return gravar("moverTarefa", () => prisma.$transaction(nova.map((x) => prisma.checklistTarefa.update({ where: { id: x.id }, data: { ordem: x.ordem } }))));
}

// ---------------------------------------------------------------------------
// Processos
// ---------------------------------------------------------------------------

const processoSchema = z.object({
  titulo: z.string().trim().min(3, { error: "Dê um título ao processo." }).max(120, { error: "Título muito longo." }),
  objetivo: texto(500, "Objetivo"),
  passos: z
    .array(z.string().trim().max(500, { error: "Cada passo pode ter no máximo 500 letras." }))
    .transform((p) => p.filter((x) => x !== ""))
    .pipe(z.array(z.string()).min(1, { error: "Escreva pelo menos um passo." }).max(60, { error: "No máximo 60 passos." })),
  observacoes: texto(2000, "Observações"),
});
export type ProcessoInput = z.input<typeof processoSchema>;

/** Cria ou muda um processo. Salvar conta como revisado hoje. */
export async function salvarProcesso(id: number | null, raw: ProcessoInput): Promise<ComId> {
  await requireModule(MODULO, CONFIGURAR);
  const p = processoSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  const data = { ...p.data, revisadoEm: toDateOnly(new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })) };
  try {
    const r = id === null ? await prisma.processo.create({ data, select: { id: true } }) : await prisma.processo.update({ where: { id }, data, select: { id: true } });
    revalidatePath("/admin/operacional", "layout");
    return { ok: true, id: r.id };
  } catch (error) {
    console.error("[operacional:salvarProcesso] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

export async function ligarProcesso(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const r = await gravar("ligarProcesso", () => prisma.processo.update({ where: { id }, data: { ativo } }));
  if (r.ok) limparContadores();
  return r;
}

/** Apagar só o processo sem treinamento registrado: com histórico, o caminho é desligar. */
export async function apagarProcesso(id: number): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const treinos = await prisma.treinamento.count({ where: { processoId: id } });
  if (treinos > 0) return { ok: false, message: "Já tem treinamento registrado neste processo. Desligue em vez de apagar." };
  const r = await gravar("apagarProcesso", () => prisma.processo.delete({ where: { id } }));
  if (r.ok) limparContadores();
  return r;
}

// ---------------------------------------------------------------------------
// Treinamento
// ---------------------------------------------------------------------------

const treinamentoSchema = z.object({
  colaboradorId: z.number({ error: "Escolha quem foi treinado." }).int().positive({ error: "Escolha quem foi treinado." }),
  processoIds: z.array(z.number().int().positive()).min(1, { error: "Marque pelo menos um processo." }).max(60),
  data: dateString,
  instrutor: texto(80, "Instrutor"),
  observacao: texto(500, "Observação"),
});
export type TreinamentoInput = z.input<typeof treinamentoSchema>;

/** Registra que alguém foi treinado em um ou mais processos, na data. Repetir é reciclagem. */
export async function registrarTreinamento(raw: TreinamentoInput): Promise<Simples> {
  const user = await requireModule(MODULO, CONFIGURAR);
  const p = treinamentoSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  const v = p.data;
  if (v.data > new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })) {
    return { ok: false, message: "A data do treinamento não pode ser no futuro." };
  }
  const r = await gravar("registrarTreinamento", () =>
    prisma.treinamento.createMany({
      data: v.processoIds.map((processoId) => ({
        colaboradorId: v.colaboradorId,
        processoId,
        data: toDateOnly(v.data),
        instrutor: v.instrutor,
        observacao: v.observacao,
        registradoPorId: user.id,
      })),
    }),
  );
  if (r.ok) limparContadores();
  return r;
}

export async function apagarTreinamento(id: number): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const r = await gravar("apagarTreinamento", () => prisma.treinamento.delete({ where: { id } }));
  if (r.ok) limparContadores();
  return r;
}
