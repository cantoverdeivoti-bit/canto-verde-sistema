"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { requireModule } from "@/lib/auth-guard";
import { todayInTimezone, toDateOnly } from "@/lib/availability";
import { ddmm } from "@/lib/buffet";
import { cardapioDoDiaCompleto } from "@/lib/buffet-dados";
import { DIAS_DA_SEMANA } from "@/lib/buffet-regras";
import { limparContadores } from "@/lib/contadores";
import { notificar } from "@/lib/notificar";
import { can, type CurrentUser } from "@/lib/roles";
import { FUSO_DA_CASA } from "@/lib/format";
import { prisma } from "@/lib/db";
import { custoKgPorCodigo } from "@/lib/receituario-buffet";
import {
  cardapioBuffetSchema,
  type CardapioBuffetInput,
  configuracaoBuffetSchema,
  dateString,
  type ConfiguracaoBuffetInput,
  grupoBuffetSchema,
  type GrupoBuffetInput,
  pratoBuffetSchema,
  type PratoBuffetInput,
  pesoBuffetSchema,
  type PesoBuffetInput,
  trocaBuffetSchema,
  type TrocaBuffetInput,
} from "@/lib/validations";
import { Prisma, type TipoSugestaoBuffet } from "@/generated/prisma/client";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type Simples = { ok: boolean; message?: string };

const MODULO = "buffet";
const CONFIGURAR = { configure: true } as const;

function primeiroErro(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}
const dec = (n: number | null) => (n === null ? null : new Prisma.Decimal(n));

/**
 * Falha de banco vira mensagem; o detalhe fica no log. Devolve só o que a
 * tela precisa: o registro do Prisma tem Decimal, que não atravessa para o
 * navegador.
 */
async function gravar<T = undefined>(nome: string, fn: () => Promise<unknown>, devolver?: (r: never) => T): Promise<Result<T>> {
  try {
    const bruto = await fn();
    const data = (devolver ? devolver(bruto as never) : undefined) as T;
    revalidatePath("/admin/buffet", "layout");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return { ok: false, message: "Já existe um com esse nome." };
      if (error.code === "P2025")
        return { ok: false, message: "Isso não existe mais. Recarregue a página." };
      if (error.code === "P2003")
        return { ok: false, message: "Está em uso num cardápio. Desligue em vez de apagar." };
    }
    console.error(`[buffet:${nome}] falha:`, error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

// ---------------------------------------------------------------------------
// Quem aprova
// ---------------------------------------------------------------------------

/**
 * Quem configura o buffet muda na hora. Quem não configura (o colaborador
 * que monta o cardápio junto) manda uma sugestão: mexer no cardápio, trocar
 * o prato de um dia e mexer no cadastro de pratos só valem depois que alguém
 * que configura aprova (decisão do dono). Cada mudança tem uma `checar`, que
 * só valida, e uma `aplicar`, que valida e grava: a sugestão passa pela
 * primeira ao nascer e pela segunda ao ser aprovada, com o banco de então.
 */
type Quem = { id: number };
type Mudanca<D> = {
  checar: (d: D) => Promise<string | null>;
  aplicar: (d: D, quem: Quem) => Promise<Simples>;
  resumo: (d: D) => Promise<string>;
  onde: (d: D) => { cardapioId?: number; data?: Date; diaSemana?: number; grupoId?: number; posicao?: number; pratoId?: number | null };
};

const nomeDoPrato = async (id: number | null) =>
  id === null ? "vazia" : ((await prisma.pratoBuffet.findUnique({ where: { id }, select: { nome: true } }))?.nome ?? "?");
const nomeDoGrupo = async (id: number) => (await prisma.grupoBuffet.findUnique({ where: { id }, select: { nome: true } }))?.nome ?? "?";
const reais = (n: number | null) => (n === null ? "sem custo" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

async function checarPosicao(grupoId: number, posicao: number, pratoId: number | null): Promise<string | null> {
  const grupo = await prisma.grupoBuffet.findUnique({ where: { id: grupoId }, select: { posicoes: true } });
  if (!grupo || !Number.isInteger(posicao) || posicao < 1 || posicao > grupo.posicoes) return "Posição inválida.";
  if (pratoId === null) return null;
  const prato = await prisma.pratoBuffet.findUnique({ where: { id: pratoId }, select: { grupoId: true, ativo: true } });
  if (!prato) return "Esse prato não existe mais.";
  if (prato.grupoId !== grupoId) return "Esse prato é de outro grupo.";
  if (!prato.ativo) return "Esse prato está desligado. Ligue em Pratos antes.";
  return null;
}

// ---------------------------------------------------------------------------
// Pratos
// ---------------------------------------------------------------------------

type DadosPrato = { id: number | null; raw: PratoBuffetInput };

const CAMPOS_DO_PRATO: [keyof PratoBuffetInput, string][] = [
  ["nome", "nome"],
  ["grupoId", "grupo"],
  ["categoria", "categoria"],
  ["custoKg", "custo/kg"],
  ["codFicha", "ficha"],
  ["alertaCusto", "ressalva do custo"],
  ["viabilidade", "viabilidade"],
  ["posto", "posto"],
  ["carga", "carga"],
  ["janela", "janela"],
  ["modo", "modo"],
  ["temperatura", "temperatura"],
  ["umidade", "umidade"],
  ["tempo", "tempo"],
  ["sonda", "sonda"],
  ["ajuste", "ajuste"],
  ["corForno", "cor no cardápio"],
  ["defumar", "defumação"],
  ["processoD1", "véspera"],
];

const mudancaDePrato: Mudanca<DadosPrato> = {
  async checar({ id, raw }) {
    const parsed = pratoBuffetSchema.safeParse(raw);
    if (!parsed.success) return primeiroErro(parsed.error);
    if (id === null) {
      const igual = await prisma.pratoBuffet.findUnique({ where: { nome: parsed.data.nome }, select: { id: true } });
      return igual ? "Já existe um prato com esse nome." : null;
    }
    // Mudar o grupo de um prato que está no cardápio deixaria ele numa posição
    // de outra estação: tira do cardápio antes.
    const atual = await prisma.pratoBuffet.findUnique({ where: { id }, select: { grupoId: true, _count: { select: { itens: true } } } });
    if (!atual) return "Esse prato não existe mais.";
    if (atual.grupoId !== parsed.data.grupoId && atual._count.itens > 0)
      return "Este prato está no cardápio. Tire ele do cardápio antes de mudar o grupo.";
    return null;
  },
  async aplicar(d) {
    const erro = await mudancaDePrato.checar(d);
    if (erro) return { ok: false, message: erro };
    const v = pratoBuffetSchema.parse(d.raw);
    // Ligado a uma ficha do Receituário, o custo/kg é o da ficha, não o digitado.
    const daFicha = v.codFicha ? (await custoKgPorCodigo()).get(v.codFicha.trim().toUpperCase()) : undefined;
    const custoKg = daFicha?.porKg != null ? Math.round(daFicha.porKg * 10000) / 10000 : v.custoKg;
    const dados = { ...v, custoKg: dec(custoKg) };
    if (d.id === null) return gravar("salvarPrato", () => prisma.pratoBuffet.create({ data: dados }));
    return gravar("salvarPrato", () => prisma.pratoBuffet.update({ where: { id: d.id! }, data: dados }));
  },
  async resumo({ id, raw }) {
    const v = pratoBuffetSchema.parse(raw);
    if (id === null) return `Prato novo: ${v.nome} (${await nomeDoGrupo(v.grupoId)}, ${reais(v.custoKg)}/kg)`;
    const atual = await prisma.pratoBuffet.findUnique({ where: { id } });
    if (!atual) return `Mudar prato ${v.nome}`;
    const antes: Record<string, unknown> = { ...atual, custoKg: atual.custoKg?.toNumber() ?? null };
    const mudou = CAMPOS_DO_PRATO.filter(([k]) => (antes[k] ?? null) !== ((v as Record<string, unknown>)[k] ?? null)).map(([k, rotulo]) =>
      k === "custoKg" ? `custo/kg ${reais(atual.custoKg?.toNumber() ?? null)} → ${reais(v.custoKg)}` : k === "nome" ? `nome → ${v.nome}` : rotulo,
    );
    return `Mudar ${atual.nome}: ${mudou.length ? mudou.join(", ") : "nada mudou"}`;
  },
  onde: ({ id }) => ({ pratoId: id }),
};

export async function salvarPrato(id: number | null, raw: PratoBuffetInput): Promise<Simples> {
  const user = await requireModule(MODULO);
  return executar(user, id === null ? "PRATO_NOVO" : "PRATO", { id, raw });
}

type DadosLigar = { id: number; ativo: boolean };
const mudancaDeLigar: Mudanca<DadosLigar> = {
  async checar({ id }) {
    return (await prisma.pratoBuffet.count({ where: { id } })) ? null : "Esse prato não existe mais.";
  },
  async aplicar({ id, ativo }) {
    return gravar("ligarPrato", () => prisma.pratoBuffet.update({ where: { id }, data: { ativo } }));
  },
  async resumo({ id, ativo }) {
    return `${ativo ? "Ligar" : "Desligar"} ${await nomeDoPrato(id)}`;
  },
  onde: ({ id }) => ({ pratoId: id }),
};

/** Desligado sai da lista de escolha; quem já está no cardápio continua até ser trocado. */
export async function ligarPrato(id: number, ativo: boolean): Promise<Simples> {
  const user = await requireModule(MODULO);
  return executar(user, "LIGAR_PRATO", { id, ativo });
}

// ---------------------------------------------------------------------------
// Cardápio-modelo
// ---------------------------------------------------------------------------

type DadosItem = { cardapioId: number; diaSemana: number; grupoId: number; posicao: number; pratoId: number | null };

const mudancaDeItem: Mudanca<DadosItem> = {
  async checar({ cardapioId, diaSemana, grupoId, posicao, pratoId }) {
    if (!Number.isInteger(diaSemana) || diaSemana < 1 || diaSemana > 7) return "Dia inválido.";
    if (!(await prisma.cardapioBuffet.count({ where: { id: cardapioId } }))) return "Esse cardápio não existe mais.";
    return checarPosicao(grupoId, posicao, pratoId);
  },
  async aplicar(d) {
    const erro = await mudancaDeItem.checar(d);
    if (erro) return { ok: false, message: erro };
    const { cardapioId, diaSemana, grupoId, posicao, pratoId } = d;
    if (pratoId === null)
      return gravar("tirarItem", () => prisma.cardapioBuffetItem.deleteMany({ where: { cardapioId, diaSemana, grupoId, posicao } }));
    return gravar("definirItem", () =>
      prisma.cardapioBuffetItem.upsert({
        where: { cardapioId_diaSemana_grupoId_posicao: { cardapioId, diaSemana, grupoId, posicao } },
        create: { cardapioId, diaSemana, grupoId, posicao, pratoId },
        update: { pratoId },
      }),
    );
  },
  async resumo({ cardapioId, diaSemana, grupoId, posicao, pratoId }) {
    const [cardapio, atual] = await Promise.all([
      prisma.cardapioBuffet.findUnique({ where: { id: cardapioId }, select: { nome: true } }),
      prisma.cardapioBuffetItem.findUnique({
        where: { cardapioId_diaSemana_grupoId_posicao: { cardapioId, diaSemana, grupoId, posicao } },
        select: { pratoId: true },
      }),
    ]);
    return `Cardápio ${cardapio?.nome ?? ""} · ${DIAS_DA_SEMANA[diaSemana - 1]} · ${await nomeDoGrupo(grupoId)} ${posicao}: ${await nomeDoPrato(atual?.pratoId ?? null)} → ${await nomeDoPrato(pratoId)}`;
  },
  onde: (d) => ({ cardapioId: d.cardapioId, diaSemana: d.diaSemana, grupoId: d.grupoId, posicao: d.posicao, pratoId: d.pratoId }),
};

/** Põe (ou tira, com `pratoId` nulo) o prato de uma posição num dia do modelo. */
export async function definirItemDoCardapio(
  cardapioId: number,
  diaSemana: number,
  grupoId: number,
  posicao: number,
  pratoId: number | null,
): Promise<Simples> {
  const user = await requireModule(MODULO);
  return executar(user, "CARDAPIO", { cardapioId, diaSemana, grupoId, posicao, pratoId });
}

/** Nome, período e os temas de cada dia. Com `copiarDe`, nasce com os pratos de outro modelo. */
export async function salvarCardapio(id: number | null, raw: CardapioBuffetInput, copiarDe?: number | null): Promise<Result<{ id: number }>> {
  // Criar cardápio, mudar o período e os temas é de quem configura.
  await requireModule(MODULO, CONFIGURAR);
  const parsed = cardapioBuffetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const dias = v.temas.map((tema, i) => ({
    diaSemana: i + 1,
    tema: tema || null,
  }));
  const base = {
    nome: v.nome,
    inicio: toDateOnly(v.inicio),
    fim: toDateOnly(v.fim),
  };
  if (id !== null)
    return gravar(
      "salvarCardapio",
      () =>
        prisma.$transaction(async (tx) => {
          await tx.cardapioBuffet.update({ where: { id }, data: base });
          for (const d of dias)
            await tx.cardapioBuffetDia.upsert({
              where: {
                cardapioId_diaSemana: {
                  cardapioId: id,
                  diaSemana: d.diaSemana,
                },
              },
              create: { cardapioId: id, ...d },
              update: { tema: d.tema },
            });
        }),
      () => ({ id }),
    );
  const origem = copiarDe
    ? await prisma.cardapioBuffetItem.findMany({
        where: { cardapioId: copiarDe },
        select: {
          diaSemana: true,
          grupoId: true,
          posicao: true,
          pratoId: true,
        },
      })
    : [];
  return gravar(
    "criarCardapio",
    () =>
      prisma.cardapioBuffet.create({
        data: { ...base, dias: { create: dias }, itens: { create: origem } },
        select: { id: true },
      }),
    (c: { id: number }) => ({ id: c.id }),
  );
}

export async function apagarCardapio(id: number): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  return gravar("apagarCardapio", () => prisma.cardapioBuffet.delete({ where: { id } }));
}

// ---------------------------------------------------------------------------
// Trocas do dia
// ---------------------------------------------------------------------------

const mudancaDeTroca: Mudanca<TrocaBuffetInput> = {
  async checar(raw) {
    const parsed = trocaBuffetSchema.safeParse(raw);
    if (!parsed.success) return primeiroErro(parsed.error);
    return checarPosicao(parsed.data.grupoId, parsed.data.posicao, parsed.data.pratoId);
  },
  async aplicar(raw, quem) {
    const erro = await mudancaDeTroca.checar(raw);
    if (erro) return { ok: false, message: erro };
    const v = trocaBuffetSchema.parse(raw);
    const data = toDateOnly(v.data);
    const campos = { pratoId: v.pratoId, motivo: v.motivo, criadoPorId: quem.id };
    // O peso lançado era do prato que saiu: não vale para o que entrou.
    return gravar("trocarNoDia", () =>
      prisma.$transaction([
        prisma.trocaDoDiaBuffet.upsert({
          where: { data_grupoId_posicao: { data, grupoId: v.grupoId, posicao: v.posicao } },
          create: { data, grupoId: v.grupoId, posicao: v.posicao, ...campos },
          update: campos,
        }),
        prisma.pesoDoDiaBuffet.deleteMany({ where: { data, grupoId: v.grupoId, posicao: v.posicao, pratoId: { not: v.pratoId ?? -1 } } }),
      ]),
    );
  },
  async resumo(raw) {
    const v = trocaBuffetSchema.parse(raw);
    const dia = await cardapioDoDiaCompleto(v.data);
    const agora = dia?.itens.find((i) => i.grupoId === v.grupoId && i.posicao === v.posicao)?.prato?.nome ?? "vazia";
    return `Troca em ${ddmm(v.data)} · ${await nomeDoGrupo(v.grupoId)} ${v.posicao}: ${agora} → ${await nomeDoPrato(v.pratoId)}${v.motivo ? ` (${v.motivo})` : ""}`;
  },
  onde: (raw) => ({ data: toDateOnly(raw.data), grupoId: raw.grupoId, posicao: raw.posicao, pratoId: raw.pratoId }),
};

/** Troca o prato de uma posição só numa data, sem mexer no modelo (a coluna ALTERAÇÕES da planilha). */
export async function trocarNoDia(raw: TrocaBuffetInput): Promise<Simples> {
  const user = await requireModule(MODULO);
  return executar(user, "TROCA", raw);
}

type DadosDesfazer = { data: string; grupoId: number; posicao: number };
const mudancaDeDesfazer: Mudanca<DadosDesfazer> = {
  async checar({ data }) {
    return dateString.safeParse(data).success ? null : "Data inválida.";
  },
  async aplicar(d) {
    const erro = await mudancaDeDesfazer.checar(d);
    if (erro) return { ok: false, message: erro };
    const onde = { data: toDateOnly(d.data), grupoId: d.grupoId, posicao: d.posicao };
    return gravar("desfazerTroca", () =>
      prisma.$transaction([prisma.trocaDoDiaBuffet.deleteMany({ where: onde }), prisma.pesoDoDiaBuffet.deleteMany({ where: onde })]),
    );
  },
  async resumo({ data, grupoId, posicao }) {
    return `Desfazer a troca de ${ddmm(data)} · ${await nomeDoGrupo(grupoId)} ${posicao} (volta ao prato do cardápio)`;
  },
  onde: (d) => ({ data: toDateOnly(d.data), grupoId: d.grupoId, posicao: d.posicao }),
};

/** Desfaz a troca: a posição volta ao prato do modelo naquela data. */
export async function desfazerTroca(data: string, grupoId: number, posicao: number): Promise<Simples> {
  const user = await requireModule(MODULO);
  return executar(user, "DESFAZER_TROCA", { data, grupoId, posicao });
}

// ---------------------------------------------------------------------------
// Sugestões: criar, aprovar, recusar
// ---------------------------------------------------------------------------

const MUDANCAS: Record<TipoSugestaoBuffet, Mudanca<never>> = {
  CARDAPIO: mudancaDeItem as Mudanca<never>,
  TROCA: mudancaDeTroca as Mudanca<never>,
  DESFAZER_TROCA: mudancaDeDesfazer as Mudanca<never>,
  PRATO_NOVO: mudancaDePrato as Mudanca<never>,
  PRATO: mudancaDePrato as Mudanca<never>,
  LIGAR_PRATO: mudancaDeLigar as Mudanca<never>,
};

/** Quem configura aplica; os outros mandam para aprovação, já validado. */
async function executar(user: CurrentUser, tipo: TipoSugestaoBuffet, dados: unknown): Promise<Simples> {
  const m = MUDANCAS[tipo];
  if (can(user, MODULO, CONFIGURAR)) return m.aplicar(dados as never, user);
  const erro = await m.checar(dados as never);
  if (erro) return { ok: false, message: erro };
  const resumo = (await m.resumo(dados as never)).slice(0, 300);
  const r = await gravar(
    "sugerir",
    () =>
      prisma.sugestaoBuffet.create({
        data: { tipo, dados: dados as Prisma.InputJsonValue, resumo, criadoPorId: user.id, ...m.onde(dados as never) },
        select: { id: true },
      }),
    (s: { id: number }) => s.id,
  );
  if (!r.ok) return r;
  limparContadores();
  const quem = user.name ?? user.username;
  after(() =>
    notificar("buffet-sugestao", {
      titulo: "Sugestão no buffet",
      corpo: `${quem}: ${resumo}`,
      url: "/admin/buffet/sugestoes",
      etiqueta: `buffet-sugestao-${r.data}`,
    }),
  );
  return { ok: true, message: "Enviado para aprovação. Vale depois que for aprovado." };
}

export async function aprovarSugestao(id: number): Promise<Simples> {
  const user = await requireModule(MODULO, CONFIGURAR);
  // A trava primeiro: dois cliques, ou duas pessoas, não aplicam duas vezes.
  const trava = await prisma.sugestaoBuffet.updateMany({
    where: { id, status: "PENDENTE" },
    data: { status: "APROVADO", decididoPorId: user.id, decididoEm: new Date() },
  });
  if (trava.count === 0) return { ok: false, message: "Essa sugestão já foi decidida." };
  const s = await prisma.sugestaoBuffet.findUniqueOrThrow({ where: { id }, select: { tipo: true, dados: true, criadoPorId: true } });
  const r = await MUDANCAS[s.tipo].aplicar(s.dados as never, { id: s.criadoPorId ?? user.id });
  if (!r.ok) {
    // Não deu para aplicar (o prato foi desligado, a posição mudou): volta a esperar, com o motivo na tela.
    await prisma.sugestaoBuffet.update({ where: { id }, data: { status: "PENDENTE", decididoPorId: null, decididoEm: null } });
    return r;
  }
  limparContadores();
  revalidatePath("/admin/buffet", "layout");
  return { ok: true };
}

export async function recusarSugestao(id: number, motivo: string): Promise<Simples> {
  const user = await requireModule(MODULO, CONFIGURAR);
  const r = await prisma.sugestaoBuffet.updateMany({
    where: { id, status: "PENDENTE" },
    data: { status: "RECUSADO", decididoPorId: user.id, decididoEm: new Date(), motivoRecusa: motivo.trim().slice(0, 200) || null },
  });
  if (r.count === 0) return { ok: false, message: "Essa sugestão já foi decidida." };
  limparContadores();
  revalidatePath("/admin/buffet", "layout");
  return { ok: true };
}

/** Quem sugeriu pode desistir enquanto ninguém decidiu. */
export async function retirarSugestao(id: number): Promise<Simples> {
  const user = await requireModule(MODULO);
  const r = await prisma.sugestaoBuffet.deleteMany({ where: { id, status: "PENDENTE", criadoPorId: user.id } });
  if (r.count === 0) return { ok: false, message: "Essa sugestão já foi decidida." };
  limparContadores();
  revalidatePath("/admin/buffet", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Peso do dia
// ---------------------------------------------------------------------------

/**
 * O kg feito e a sobra de uma posição no dia. O prato é o do cardápio da data
 * (com as trocas), não o que a tela mandou; o custo/kg fica congelado no
 * primeiro lançamento. Vazio nos dois apaga.
 */
export async function lancarPeso(raw: PesoBuffetInput): Promise<Simples> {
  const user = await requireModule(MODULO);
  const parsed = pesoBuffetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  if (v.data > todayInTimezone(FUSO_DA_CASA)) return { ok: false, message: "O peso se lança no dia ou depois, não antes." };
  const data = toDateOnly(v.data);
  const onde = { data_grupoId_posicao: { data, grupoId: v.grupoId, posicao: v.posicao } };
  if (v.kgProduzido === null)
    return gravar("apagarPeso", () => prisma.pesoDoDiaBuffet.deleteMany({ where: { data, grupoId: v.grupoId, posicao: v.posicao } }));

  const dia = await cardapioDoDiaCompleto(v.data);
  const prato = dia?.itens.find((i) => i.grupoId === v.grupoId && i.posicao === v.posicao)?.prato;
  if (!prato) return { ok: false, message: "Esta posição está vazia neste dia." };
  const kg = { kgProduzido: dec(v.kgProduzido)!, kgSobra: dec(v.kgSobra), lancadoPorId: user.id };
  const atual = await prisma.pesoDoDiaBuffet.findUnique({ where: onde, select: { pratoId: true } });
  // Mesmo prato: o custo do primeiro lançamento fica. Outro prato: custo dele.
  const custo = atual?.pratoId === prato.id ? {} : { pratoId: prato.id, custoKg: dec(prato.custoKg) };
  return gravar("lancarPeso", () =>
    prisma.pesoDoDiaBuffet.upsert({
      where: onde,
      create: { data, grupoId: v.grupoId, posicao: v.posicao, pratoId: prato.id, custoKg: dec(prato.custoKg), ...kg },
      update: { ...kg, ...custo },
    }),
  );
}

/** Quantos clientes o buffet atendeu no dia. Vazio apaga. */
export async function lancarClientes(dataTexto: string, clientes: number | null): Promise<Simples> {
  await requireModule(MODULO);
  if (!dateString.safeParse(dataTexto).success) return { ok: false, message: "Data inválida." };
  if (clientes !== null && (!Number.isInteger(clientes) || clientes < 0 || clientes > 5000))
    return { ok: false, message: "Clientes: um número inteiro, ex.: 180." };
  const data = toDateOnly(dataTexto);
  if (clientes === null) return gravar("apagarClientes", () => prisma.clientesDoDiaBuffet.deleteMany({ where: { data } }));
  return gravar("lancarClientes", () =>
    prisma.clientesDoDiaBuffet.upsert({ where: { data }, create: { data, clientes }, update: { clientes } }),
  );
}

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------

export async function salvarGrupo(id: number, raw: GrupoBuffetInput): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const parsed = grupoBuffetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  // Diminuir as posições com prato nas que somem apagaria esses pratos do cardápio sem ninguém ver.
  const alem = await prisma.cardapioBuffetItem.count({
    where: { grupoId: id, posicao: { gt: v.posicoes } },
  });
  if (alem > 0)
    return {
      ok: false,
      message: `Há pratos no cardápio depois da posição ${v.posicoes}. Tire esses pratos antes de diminuir.`,
    };
  return gravar("salvarGrupo", () =>
    prisma.grupoBuffet.update({
      where: { id },
      data: { ...v, metaCustoKg: dec(v.metaCustoKg) },
    }),
  );
}

export async function salvarConfiguracaoBuffet(raw: ConfiguracaoBuffetInput): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const parsed = configuracaoBuffetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  if (v.limiteClasseB >= v.limiteClasseA)
    return { ok: false, message: "O limite da Classe B tem de ser menor que o da A." };
  const dados = {
    ...v,
    limiteClasseA: new Prisma.Decimal(v.limiteClasseA / 100),
    limiteClasseB: new Prisma.Decimal(v.limiteClasseB / 100),
  };
  return gravar("salvarConfiguracao", () =>
    prisma.configuracaoBuffet.upsert({
      where: { id: 1 },
      create: { id: 1, ...dados },
      update: dados,
    }),
  );
}
