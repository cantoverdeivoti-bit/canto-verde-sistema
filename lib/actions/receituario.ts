"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { esvaziarVencidos, guardarNaLixeira } from "@/lib/lixeira";
import { atualizarBuffetSemFalhar, recalcularCustosDoBuffet } from "@/lib/receituario-buffet";
import { configDoReceituario } from "@/lib/receituario-dados";
import { CATEGORIAS, ehCorDaPaleta, ehOperacao } from "@/lib/receituario-regras";
import { Prisma } from "@/generated/prisma/client";

/**
 * As ações do Receituário. Ver a ficha é de quem tem o módulo; mudar
 * qualquer coisa (e ver o custo) pede "configurar".
 */

type Simples = { ok: boolean; message?: string };
type ComCodigo = { ok: true; codigo: string } | { ok: false; message: string };

const MODULO = "receituario";
const CONFIGURAR = { configure: true } as const;
const primeiroErro = (e: z.ZodError) => e.issues[0]?.message ?? "Dados inválidos.";

function revalidar() {
  revalidatePath("/admin/receituario", "layout");
}

const textoOpcional = (max: number, nome: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${nome}: no máximo ${max} letras.` })
    .transform((v) => v || null);

const unidadeDeUso = z.enum(["g", "mL", "un"], { error: "A unidade é g, mL ou un." });

// ---------------------------------------------------------------------------
// Fichas
// ---------------------------------------------------------------------------

const linhaSchema = z
  .object({
    insumoId: z.number().int().positive().nullable(),
    subFichaId: z.number().int().positive().nullable(),
    nomeLivre: textoOpcional(120, "Ingrediente"),
    quantidade: z.number({ error: "Quantidade inválida." }).positive({ error: "A quantidade de cada ingrediente tem de ser maior que zero." }).max(1_000_000),
    unidade: unidadeDeUso.nullable(),
    preparo: textoOpcional(160, "Preparo do item"),
  })
  .refine((l) => [l.insumoId, l.subFichaId, l.nomeLivre].filter((x) => x !== null).length === 1, {
    error: "Cada ingrediente é um insumo, um pré-preparo ou um nome livre.",
  });

const fichaSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .max(20, { error: "Código: no máximo 20 letras." })
    .transform((v) => v || null),
  nome: z.string().trim().min(2, { error: "Dê um nome à receita." }).max(120, { error: "Nome: no máximo 120 letras." }),
  categoria: z.string().refine((c) => CATEGORIAS.some((x) => x.nome === c), { error: "Escolha a categoria." }),
  tipo: z.enum(["PRONTA", "PRE_PREPARO"]),
  operacoes: z.array(z.string().refine(ehOperacao)).max(10),
  etiquetas: z.array(z.string().trim().min(1).max(30)).max(10),
  porcoes: z.number().int().min(1, { error: "Pelo menos 1 porção." }).max(100_000),
  rendimentoTotal: z.number().positive({ error: "O rendimento tem de ser maior que zero." }).max(10_000_000).nullable(),
  unidadeRendimento: unidadeDeUso,
  tempoPreparo: textoOpcional(40, "Tempo de preparo"),
  passos: z
    .array(z.string().trim().max(800, { error: "Cada passo pode ter no máximo 800 letras." }))
    .transform((p) => p.filter((x) => x !== ""))
    .pipe(z.array(z.string()).max(80, { error: "No máximo 80 passos." })),
  observacoes: textoOpcional(4000, "Observações"),
  alergenicos: z.array(z.string().trim().min(1).max(40)).max(20),
  viabilidade: textoOpcional(40, "Viabilidade"),
  modoForno: textoOpcional(60, "Modo do forno"),
  temperatura: textoOpcional(30, "Temperatura"),
  umidade: textoOpcional(30, "Umidade"),
  tempoForno: textoOpcional(40, "Tempo de forno"),
  sonda: textoOpcional(20, "Sonda"),
  ajusteForno: textoOpcional(1000, "Ajuste do forno"),
  utensilios: textoOpcional(1000, "Utensílios"),
  pontoDeControle: textoOpcional(1000, "Ponto de controle"),
  armazenamento: textoOpcional(1000, "Armazenamento"),
  montagem: textoOpcional(1000, "Montagem"),
  custoManualPorcao: z.number().min(0).max(100_000).nullable(),
  ingredientes: z.array(linhaSchema).max(150, { error: "No máximo 150 ingredientes." }),
});
export type FichaInput = z.input<typeof fichaSchema>;

/** O próximo código livre: o maior número da casa + 1, com a letra da categoria ("558E"). */
async function proximoCodigo(categoria: string) {
  const letra = CATEGORIAS.find((c) => c.nome === categoria)?.letra ?? "X";
  const todos = await prisma.fichaTecnica.findMany({ select: { codigo: true } });
  const maior = Math.max(0, ...todos.map((f) => Number(/^(\d+)/.exec(f.codigo)?.[1] ?? 0)));
  return `${String(maior + 1).padStart(3, "0")}${letra}`;
}

/**
 * Cria (id nulo) ou muda uma ficha, com os ingredientes trocados de uma vez.
 * Código em branco ganha o próximo número. Devolve o código para a tela
 * abrir a ficha.
 */
export async function salvarFicha(id: number | null, raw: FichaInput): Promise<ComCodigo> {
  await requireModule(MODULO, CONFIGURAR);
  const p = fichaSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  const { ingredientes, codigo: codigoDigitado, ...v } = p.data;
  if (id !== null && ingredientes.some((l) => l.subFichaId === id)) {
    return { ok: false, message: "A ficha não pode usar a si mesma como pré-preparo." };
  }
  const codigo = codigoDigitado ?? (await proximoCodigo(v.categoria));
  const dados = {
    ...v,
    codigo,
    rendimentoTotal: v.rendimentoTotal,
    custoManualPorcao: ingredientes.length === 0 ? v.custoManualPorcao : null,
  };
  const linhas = ingredientes.map((l, i) => ({ ...l, ordem: i + 1 }));
  try {
    const ficha = await prisma.$transaction(async (tx) => {
      if (id === null) {
        return tx.fichaTecnica.create({ data: { ...dados, ingredientes: { create: linhas } }, select: { codigo: true } });
      }
      await tx.ingredienteDaFicha.deleteMany({ where: { fichaId: id } });
      return tx.fichaTecnica.update({ where: { id }, data: { ...dados, ingredientes: { create: linhas } }, select: { codigo: true } });
    });
    await atualizarBuffetSemFalhar();
    revalidar();
    return { ok: true, codigo: ficha.codigo };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return { ok: false, message: `Já existe uma ficha com o código ${codigo}.` };
      if (error.code === "P2025") return { ok: false, message: "Esta ficha não existe mais. Recarregue a página." };
      if (error.code === "P2003") return { ok: false, message: "Um insumo ou pré-preparo da lista foi apagado. Recarregue a página." };
    }
    console.error("[receituario:salvarFicha] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

async function gravar(nome: string, fn: () => Promise<unknown>): Promise<Simples> {
  try {
    await fn();
    revalidar();
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, message: "Isso não existe mais. Recarregue a página." };
    }
    console.error(`[receituario:${nome}] falha:`, error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

/** Produzida, pesada e validada na cozinha (ou desmarcar). */
export async function marcarConferida(id: number, conferida: boolean): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  return gravar("conferida", () => prisma.fichaTecnica.update({ where: { id }, data: { conferida } }));
}

/** Tirar de uso sem apagar: a ficha some da lista, mas o que a chama continua valendo. */
export async function ligarFicha(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  return gravar("ligarFicha", () => prisma.fichaTecnica.update({ where: { id }, data: { ativo } }));
}

// ---------------------------------------------------------------------------
// Insumos
// ---------------------------------------------------------------------------

const insumoSchema = z.object({
  codigo: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .transform((v) => v || null),
  nome: z.string().trim().min(2, { error: "Dê um nome ao insumo." }).max(120),
  categoria: textoOpcional(60, "Categoria"),
  unidadeUso: unidadeDeUso,
  produtoId: z.number().int().positive().nullable(),
  unidadeCompra: textoOpcional(20, "Unidade de compra"),
  precoCompra: z.number().min(0).max(1_000_000).nullable(),
  qtdPorUnidade: z.number({ error: "Diga quanto vem na unidade de compra." }).positive({ error: "Quanto vem na unidade de compra tem de ser maior que zero." }).max(10_000_000),
  rendimento: z.number().min(0.01, { error: "O rendimento vai de 1% a 100%." }).max(1, { error: "O rendimento vai de 1% a 100%." }),
  estimado: z.boolean(),
  embalagem: z.boolean().default(false),
  observacao: textoOpcional(2000, "Observação"),
});
export type InsumoInput = z.input<typeof insumoSchema>;

/** Cria (id nulo) ou muda um insumo. Código em branco ganha o próximo INS-NNN. */
export async function salvarInsumo(id: number | null, raw: InsumoInput): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const p = insumoSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  const { codigo: digitado, ...v } = p.data;
  let codigo = digitado;
  if (!codigo) {
    const todos = await prisma.insumoReceita.findMany({ select: { codigo: true } });
    const maior = Math.max(0, ...todos.map((i) => Number(/(\d+)$/.exec(i.codigo)?.[1] ?? 0)));
    codigo = `INS-${String(maior + 1).padStart(3, "0")}`;
  }
  try {
    if (id === null) await prisma.insumoReceita.create({ data: { ...v, codigo } });
    else await prisma.insumoReceita.update({ where: { id }, data: { ...v, codigo } });
    await atualizarBuffetSemFalhar();
    revalidar();
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return { ok: false, message: `Já existe o insumo ${codigo}.` };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return { ok: false, message: "Este insumo não existe mais. Recarregue a página." };
    console.error("[receituario:salvarInsumo] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

/** Apagar só o insumo que nenhuma ficha usa; usado em ficha, o caminho é desligar. */
export async function apagarInsumo(id: number): Promise<Simples & { lixeiraId?: number }> {
  const user = await requireModule(MODULO, CONFIGURAR);
  const [usos, naVenda] = await Promise.all([prisma.ingredienteDaFicha.count({ where: { insumoId: id } }), prisma.extraDaVenda.count({ where: { insumoId: id } })]);
  if (usos > 0) return { ok: false, message: `Este insumo está em ${usos} ficha(s). Tire-o delas antes de apagar.` };
  if (naVenda > 0) return { ok: false, message: `Este insumo está em ${naVenda} item(ns) da lista de preços. Tire-o deles antes de apagar.` };
  const insumo = await prisma.insumoReceita.findUnique({ where: { id } });
  if (!insumo) return { ok: false, message: "Esse insumo não existe mais." };
  let lixeiraId = 0;
  // Vai para a lixeira: pode voltar por 30 dias, com o mesmo código.
  const r = await gravar("apagarInsumo", () =>
    prisma.$transaction(async (tx) => {
      lixeiraId = await guardarNaLixeira(tx, {
        tipo: "insumo",
        rotulo: `${insumo.codigo} · ${insumo.nome}`,
        dados: insumo,
        apagadoPor: user.name ?? user.username,
      });
      await tx.insumoReceita.delete({ where: { id } });
    }),
  );
  if (!r.ok) return r;
  await esvaziarVencidos();
  return { ok: true, lixeiraId };
}

// ---------------------------------------------------------------------------
// Lista de preços: encomenda e delivery
// ---------------------------------------------------------------------------

const extraSchema = z
  .object({
    insumoId: z.number().int().positive().nullable(),
    subFichaId: z.number().int().positive().nullable(),
    quantidade: z.number({ error: "Quantidade do extra inválida." }).positive({ error: "A quantidade de cada extra tem de ser maior que zero." }).max(1_000_000),
  })
  .refine((e) => (e.insumoId === null) !== (e.subFichaId === null), { error: "Cada extra é um insumo ou uma ficha." });

const vendaSchema = z.object({
  fichaId: z.number({ error: "Escolha a receita." }).int().positive({ error: "Escolha a receita." }),
  canal: z.enum(["ENCOMENDA", "DELIVERY"], { error: "Escolha encomenda ou delivery." }),
  nome: z.string().trim().min(2, { error: "Dê um nome ao item." }).max(120, { error: "Nome: no máximo 120 letras." }),
  unidadeVenda: z.enum(["KG", "UN", "POTE"], { error: "Escolha como é vendido." }),
  quantidade: z.number({ error: "Diga quanto da receita vai em cada unidade." }).positive({ error: "A quantidade tem de ser maior que zero." }).max(1_000_000),
  precoVenda: z.number().min(0).max(1_000_000).nullable(),
  baseId: z.number().int().positive().nullable(),
  extras: z.array(extraSchema).max(30, { error: "No máximo 30 extras." }),
});
export type VendaInput = z.input<typeof vendaSchema>;

function revalidarVendas() {
  revalidar();
  revalidatePath("/imprimir/receituario/precos");
}

/**
 * Cria (id nulo) ou muda um item da lista de preços, com os extras trocados
 * de uma vez. O delivery que parte de uma encomenda fica com a receita e a
 * quantidade dela: a base manda, e o item só soma os extras dele.
 */
export async function salvarVenda(id: number | null, raw: VendaInput): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const p = vendaSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  const { extras, ...v } = p.data;
  if (v.baseId !== null) {
    if (v.baseId === id) return { ok: false, message: "O item não pode partir dele mesmo." };
    const base = await prisma.vendaDaFicha.findUnique({ where: { id: v.baseId }, select: { fichaId: true, quantidade: true, unidadeVenda: true, baseId: true } });
    if (!base) return { ok: false, message: "O item de base não existe mais. Recarregue a página." };
    if (base.baseId !== null) return { ok: false, message: "A base tem de ser um item que não parte de outro." };
    v.fichaId = base.fichaId;
    v.quantidade = Number(base.quantidade);
    v.unidadeVenda = base.unidadeVenda;
  }
  if (extras.some((e) => e.subFichaId === v.fichaId)) return { ok: false, message: "A receita do item não pode entrar como extra dele mesmo." };
  const linhas = extras.map((e, i) => ({ ...e, ordem: i + 1 }));
  try {
    await prisma.$transaction(async (tx) => {
      if (id === null) {
        await tx.vendaDaFicha.create({ data: { ...v, extras: { create: linhas } } });
        return;
      }
      if (v.baseId !== null && (await tx.vendaDaFicha.count({ where: { baseId: id } })) > 0) {
        throw new Error("BASE_DE_OUTRO");
      }
      await tx.extraDaVenda.deleteMany({ where: { vendaId: id } });
      await tx.vendaDaFicha.update({ where: { id }, data: { ...v, extras: { create: linhas } } });
      // O delivery que parte deste item acompanha a receita, a quantidade e a unidade dele.
      await tx.vendaDaFicha.updateMany({ where: { baseId: id }, data: { fichaId: v.fichaId, quantidade: v.quantidade, unidadeVenda: v.unidadeVenda } });
    });
    revalidarVendas();
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === "BASE_DE_OUTRO") {
      return { ok: false, message: "Outro item parte deste. Ele não pode partir de um terceiro." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return { ok: false, message: "Este item não existe mais. Recarregue a página." };
      if (error.code === "P2003") return { ok: false, message: "A receita ou um extra foi apagado. Recarregue a página." };
    }
    console.error("[receituario:salvarVenda] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

/** Tirar da lista de preços sem apagar. */
export async function ligarVenda(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const r = await gravar("ligarVenda", () => prisma.vendaDaFicha.update({ where: { id }, data: { ativo } }));
  if (r.ok) revalidatePath("/imprimir/receituario/precos");
  return r;
}

/** Apaga o item para a lixeira: volta por 30 dias, com os extras. */
export async function apagarVenda(id: number): Promise<Simples & { lixeiraId?: number }> {
  const user = await requireModule(MODULO, CONFIGURAR);
  const venda = await prisma.vendaDaFicha.findUnique({ where: { id } });
  if (!venda) return { ok: false, message: "Esse item não existe mais." };
  const [extras, derivadas] = await Promise.all([
    prisma.extraDaVenda.findMany({ where: { vendaId: id } }),
    prisma.vendaDaFicha.findMany({ where: { baseId: id }, select: { id: true } }),
  ]);
  let lixeiraId = 0;
  const r = await gravar("apagarVenda", () =>
    prisma.$transaction(async (tx) => {
      lixeiraId = await guardarNaLixeira(tx, {
        tipo: "vendaDaFicha",
        rotulo: venda.nome,
        dados: { venda, extras, derivadas: derivadas.map((d) => d.id) },
        apagadoPor: user.name ?? user.username,
      });
      await tx.vendaDaFicha.delete({ where: { id } });
    }),
  );
  if (!r.ok) return r;
  revalidatePath("/imprimir/receituario/precos");
  await esvaziarVencidos();
  return { ok: true, lixeiraId };
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const configSchema = z.object({
  metaFoodCost: z.number().min(0.05, { error: "A meta de food cost vai de 5% a 90%." }).max(0.9, { error: "A meta de food cost vai de 5% a 90%." }),
  markup: z.number().min(1, { error: "O markup vai de 1 a 20." }).max(20, { error: "O markup vai de 1 a 20." }),
});

export async function salvarConfigDoReceituario(raw: z.input<typeof configSchema>): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const p = configSchema.safeParse(raw);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  return gravar("config", () => prisma.configReceituario.upsert({ where: { id: 1 }, create: { id: 1, ...p.data }, update: p.data }));
}

const etiquetasSchema = z
  .array(z.string().trim().min(1).max(30, { error: "Etiqueta: no máximo 30 letras." }))
  .max(20, { error: "No máximo 20 etiquetas." })
  .refine((l) => new Set(l.map((x) => x.toLowerCase())).size === l.length, { error: "Essa etiqueta já existe." });

/**
 * A lista de etiquetas que a ficha oferece. A etiqueta que sai da lista sai
 * também das fichas que a usavam, para nenhuma ficha ficar com etiqueta que
 * não se acha mais no filtro.
 */
export async function salvarEtiquetas(lista: string[]): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const p = etiquetasSchema.safeParse(lista);
  if (!p.success) return { ok: false, message: primeiroErro(p.error) };
  const antes = (await prisma.configReceituario.findUnique({ where: { id: 1 }, select: { etiquetas: true } }))?.etiquetas ?? [];
  const sairam = antes.filter((e) => !p.data.includes(e));
  return gravar("etiquetas", () =>
    prisma.$transaction([
      prisma.configReceituario.upsert({ where: { id: 1 }, create: { id: 1, etiquetas: p.data }, update: { etiquetas: p.data } }),
      ...sairam.map((e) => prisma.$executeRaw`UPDATE "receituario_fichas" SET "etiquetas" = array_remove("etiquetas", ${e}) WHERE ${e} = ANY("etiquetas")`),
    ]),
  );
}

/**
 * A cor de cada categoria, escolhida entre as 10 da paleta. Grava só o que
 * difere do padrão, para uma mudança no padrão valer onde ninguém escolheu.
 */
export async function salvarCoresDasCategorias(mapa: Record<string, string>): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const escolhidas: Record<string, string> = {};
  for (const c of CATEGORIAS) {
    const cor = mapa[c.nome];
    if (cor === undefined || cor === c.cor) continue;
    if (!ehCorDaPaleta(cor)) return { ok: false, message: `Escolha uma das cores para ${c.nome}.` };
    escolhidas[c.nome] = cor;
  }
  const r = await gravar("cores", () =>
    prisma.configReceituario.upsert({ where: { id: 1 }, create: { id: 1, coresDasCategorias: escolhidas }, update: { coresDasCategorias: escolhidas } }),
  );
  if (r.ok) {
    revalidatePath("/admin/eventos", "layout");
    revalidatePath("/imprimir", "layout");
  }
  return r;
}

/**
 * Põe a etiqueta conferida em cada ficha (a sugestão que alguém aceitou ou
 * trocou). Só etiqueta da lista das configurações; a que a ficha já tiver
 * fica.
 */
export async function aplicarEtiquetas(itens: { fichaId: number; etiqueta: string }[]): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const { etiquetas } = await configDoReceituario();
  const validos = itens.filter((i) => Number.isInteger(i.fichaId) && etiquetas.includes(i.etiqueta));
  if (validos.length === 0) return { ok: false, message: "Nenhuma etiqueta para aplicar." };
  const fichas = await prisma.fichaTecnica.findMany({ where: { id: { in: validos.map((i) => i.fichaId) } }, select: { id: true, etiquetas: true } });
  const atuais = new Map(fichas.map((f) => [f.id, f.etiquetas]));
  const mudam = validos.filter((i) => atuais.has(i.fichaId) && !atuais.get(i.fichaId)!.includes(i.etiqueta));
  await prisma.$transaction(mudam.map((i) => prisma.fichaTecnica.update({ where: { id: i.fichaId }, data: { etiquetas: { push: i.etiqueta } } })));
  revalidatePath("/admin/receituario", "layout");
  return { ok: true, message: `${mudam.length} ${mudam.length === 1 ? "ficha ganhou" : "fichas ganharam"} etiqueta.` };
}

/** Tira a foto da ficha. */
export async function apagarFotoDaFicha(fichaId: number): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  await prisma.fotoDaFicha.deleteMany({ where: { fichaId } });
  revalidatePath("/admin/receituario", "layout");
  return { ok: true };
}

/** O botão "atualizar agora": põe o custo/kg das fichas nos pratos do buffet ligados a elas. */
export async function atualizarCustosDoBuffet(): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  try {
    const n = await recalcularCustosDoBuffet();
    revalidatePath("/admin/buffet", "layout");
    return { ok: true, message: n === 0 ? "Os pratos do buffet já estavam com o custo das fichas." : `${n} prato(s) do buffet com o custo/kg atualizado.` };
  } catch (error) {
    console.error("[receituario:atualizarCustosDoBuffet] falha:", error);
    return { ok: false, message: "Não foi possível atualizar. Tente de novo." };
  }
}

