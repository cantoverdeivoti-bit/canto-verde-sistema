"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import type { z } from "zod";

import { requireModule } from "@/lib/auth-guard";
import { dateOnlyToString, toDateOnly, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { CHAVE_CATEGORIA, CHAVE_CENTRO_SALAO, NATUREZAS_DO_GRUPO, SO_CODIGO } from "@/lib/financeiro";
import {
  dividirEmParcelas,
  lancamentosDoFechamento,
  motivoParaNaoFecharMes,
  moverNaOrdem,
  travaDoFechamentoDoDia,
  valorLiquido,
  vencimentoDaParcela,
} from "@/lib/financeiro-calculo";
import {
  categoriaServe,
  competenciaDo,
  dataPermitidaNaConta,
  gerarRecorrencias,
  mensagemDeMesFechado,
  travaDaCategoriaEmMesFechado,
  travaDaContaEmMesFechado,
} from "@/lib/financeiro-dados";
import { FUSO_DA_CASA, formatMoney } from "@/lib/format";
import { esvaziarVencidos, guardarNaLixeira } from "@/lib/lixeira";
import {
  baixaSchema,
  type BaixaInput,
  categoriaFinanceiraSchema,
  type CategoriaFinanceiraInput,
  centroCustoSchema,
  type CentroCustoInput,
  contaFinanceiraSchema,
  type ContaFinanceiraInput,
  fechamentoSchema,
  type FechamentoInput,
  formaRecebimentoSchema,
  type FormaRecebimentoInput,
  lancamentoSchema,
  type LancamentoInput,
  recorrenciaSchema,
  type RecorrenciaInput,
  subgrupoFinanceiroSchema,
  type SubgrupoFinanceiroInput,
  transferenciaSchema,
  type TransferenciaInput,
} from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type Simples = { ok: boolean; message?: string };

const MODULO = "financeiro";
const CONFIGURAR = { configure: true } as const;

function feito() {
  revalidatePath("/admin/financeiro", "layout");
}

function primeiroErro(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

const dec = (n: number) => new Prisma.Decimal(n);
const hoje = () => todayInTimezone(FUSO_DA_CASA);

/** Falha de banco vira mensagem; o detalhe fica no log. */
async function tentar<T>(nome: string, fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    feito();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") return { ok: false, message: "Isso não existe mais. Recarregue a página." };
      if (error.code === "P2002") return { ok: false, message: "Já existe um cadastro com esse nome." };
      if (error.code === "P2003") return { ok: false, message: "Está em uso em outro cadastro. Desligue em vez de apagar." };
    }
    console.error(`[${nome}] falha:`, error);
    return { ok: false, message: "Não foi possível salvar. Tente de novo." };
  }
}

async function gravar(nome: string, fn: () => Promise<unknown>): Promise<Simples> {
  const r = await tentar(nome, async () => {
    await fn();
    return null;
  });
  return r.ok ? { ok: true } : r;
}

const conferirDataNaConta = dataPermitidaNaConta;
const travaDoMes = mensagemDeMesFechado;

const dataDe = (d: Date | null | undefined) => (d ? dateOnlyToString(d) : null);

// ---------------------------------------------------------------------------
// Cadastros: contas, categorias, formas de recebimento
// ---------------------------------------------------------------------------

export async function salvarConta(id: number | null, raw: ContaFinanceiraInput): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const parsed = contaFinanceiraSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const dados = { ...v, saldoInicial: dec(v.saldoInicial), saldoInicialEm: toDateOnly(v.saldoInicialEm) };

  if (id !== null) {
    const atual = await prisma.contaFinanceira.findUnique({
      where: { id },
      select: { saldoInicial: true, saldoInicialEm: true, codigoContabil: true },
    });
    if (!atual) return { ok: false, message: "Essa conta não existe mais." };
    const mudouOQueConta =
      !atual.saldoInicial.equals(dados.saldoInicial) ||
      dateOnlyToString(atual.saldoInicialEm) !== v.saldoInicialEm ||
      (atual.codigoContabil ?? null) !== (v.codigoContabil ?? null);
    if (mudouOQueConta) {
      const desde = [dateOnlyToString(atual.saldoInicialEm), v.saldoInicialEm].sort()[0];
      const fechado = await travaDaContaEmMesFechado(desde);
      if (fechado) return { ok: false, message: `${fechado} O saldo inicial e o código desta conta entram nesse mês.` };
    }
    const antes = await prisma.lancamento.findFirst({
      where: { contaId: id, status: "PAGO", pagoEm: { lt: dados.saldoInicialEm } },
      select: { descricao: true },
    });
    if (antes)
      return { ok: false, message: `Há baixas nesta conta antes dessa data ("${antes.descricao}"). Escolha uma data anterior a elas.` };
  }
  return gravar("salvarConta", () =>
    id === null ? prisma.contaFinanceira.create({ data: dados }) : prisma.contaFinanceira.update({ where: { id }, data: dados }),
  );
}

export async function ligarConta(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  if (!ativo && (await prisma.formaRecebimento.count({ where: { contaId: id, ativo: true } })) > 0)
    return { ok: false, message: "Uma forma de recebimento ligada cai nesta conta. Mude a forma antes." };
  return gravar("ligarConta", () => prisma.contaFinanceira.update({ where: { id }, data: { ativo } }));
}

// ---------------------------------------------------------------------------
// Plano de contas: grupo da DRE (fixo) > subgrupo > categoria
// ---------------------------------------------------------------------------

/** Cria ou renomeia um subgrupo. O grupo só vale na criação: mudar levaria as categorias junto. */
export async function salvarSubgrupo(id: number | null, raw: SubgrupoFinanceiroInput): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const parsed = subgrupoFinanceiroSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  if (id !== null) return gravar("salvarSubgrupo", () => prisma.subgrupoFinanceiro.update({ where: { id }, data: { nome: v.nome } }));
  const ultimo = await prisma.subgrupoFinanceiro.aggregate({ where: { grupo: v.grupo }, _max: { ordem: true } });
  return gravar("salvarSubgrupo", () =>
    prisma.subgrupoFinanceiro.create({ data: { nome: v.nome, grupo: v.grupo, ordem: (ultimo._max.ordem ?? 0) + 1 } }),
  );
}

/** Desligado, o subgrupo e as categorias dele saem dos formulários; o histórico fica. */
export async function ligarSubgrupo(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  if (!ativo) {
    const sistema = await prisma.categoriaFinanceira.findFirst({ where: { subgrupoId: id, chave: { not: null } }, select: { nome: true } });
    if (sistema) return { ok: false, message: `"${sistema.nome}" é do sistema e mora aqui. Mova ela para outro subgrupo antes de desligar.` };
  }
  return gravar("ligarSubgrupo", () => prisma.subgrupoFinanceiro.update({ where: { id }, data: { ativo } }));
}

/** Só sai o subgrupo vazio: com categoria dentro, mova ou apague as categorias antes. */
export async function apagarSubgrupo(id: number): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const n = await prisma.categoriaFinanceira.count({ where: { subgrupoId: id } });
  if (n > 0) return { ok: false, message: "Este subgrupo tem categorias. Mova ou apague as categorias antes." };
  return gravar("apagarSubgrupo", () => prisma.subgrupoFinanceiro.delete({ where: { id } }));
}

/**
 * Sobe ou desce um subgrupo dentro do grupo, ou uma categoria dentro do
 * subgrupo. Renumera os irmãos de 1 a n (`moverNaOrdem`).
 */
export async function moverNoPlano(tipo: "subgrupo" | "categoria", id: number, direcao: -1 | 1): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const ordenar = [{ ordem: "asc" as const }, { nome: "asc" as const }, { id: "asc" as const }];
  if (tipo === "subgrupo") {
    const s = await prisma.subgrupoFinanceiro.findUnique({ where: { id }, select: { grupo: true } });
    if (!s) return { ok: false, message: "Esse subgrupo não existe mais." };
    const irmaos = await prisma.subgrupoFinanceiro.findMany({ where: { grupo: s.grupo }, orderBy: ordenar, select: { id: true } });
    const nova = moverNaOrdem(irmaos.map((x) => x.id), id, direcao);
    return gravar("moverNoPlano", () =>
      prisma.$transaction(nova.map((x, i) => prisma.subgrupoFinanceiro.update({ where: { id: x }, data: { ordem: i + 1 } }))),
    );
  }
  const c = await prisma.categoriaFinanceira.findUnique({ where: { id }, select: { subgrupoId: true } });
  if (!c) return { ok: false, message: "Essa categoria não existe mais." };
  const irmas = await prisma.categoriaFinanceira.findMany({ where: { subgrupoId: c.subgrupoId }, orderBy: ordenar, select: { id: true } });
  const nova = moverNaOrdem(irmas.map((x) => x.id), id, direcao);
  return gravar("moverNoPlano", () =>
    prisma.$transaction(nova.map((x, i) => prisma.categoriaFinanceira.update({ where: { id: x }, data: { ordem: i + 1 } }))),
  );
}

/**
 * As categorias com chave são as que o sistema usa ao gerar lançamento: o
 * nome e o subgrupo mudam, a natureza e o grupo da DRE não, senão a venda do
 * fechamento cairia numa linha errada. O grupo vem sempre do subgrupo.
 */
export async function salvarCategoria(id: number | null, raw: CategoriaFinanceiraInput): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const parsed = categoriaFinanceiraSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const subgrupo = await prisma.subgrupoFinanceiro.findUnique({ where: { id: v.subgrupoId }, select: { grupo: true } });
  if (!subgrupo) return { ok: false, message: "Esse subgrupo não existe mais. Recarregue a página." };
  if (!NATUREZAS_DO_GRUPO[subgrupo.grupo].includes(v.tipo))
    return { ok: false, message: "Esse grupo da DRE não aceita essa natureza. Venda é receita; custo e despesa são despesa." };
  const dados = { ...v, grupo: subgrupo.grupo };

  if (id === null) {
    const ultima = await prisma.categoriaFinanceira.aggregate({ where: { subgrupoId: v.subgrupoId }, _max: { ordem: true } });
    return gravar("salvarCategoria", () => prisma.categoriaFinanceira.create({ data: { ...dados, ordem: (ultima._max.ordem ?? 0) + 1 } }));
  }

  const atual = await prisma.categoriaFinanceira.findUnique({
    where: { id },
    select: { chave: true, tipo: true, grupo: true, subgrupoId: true, codigoContabil: true },
  });
  if (!atual) return { ok: false, message: "Essa categoria não existe mais." };
  if (atual.chave && (atual.tipo !== v.tipo || atual.grupo !== subgrupo.grupo))
    return { ok: false, message: "O sistema usa esta categoria nos lançamentos automáticos. Dá para mudar o nome e o subgrupo dentro da mesma linha da DRE." };
  if (atual.tipo !== v.tipo && (await prisma.lancamento.count({ where: { categoriaId: id } })) > 0)
    return { ok: false, message: "Já há lançamentos nesta categoria. Crie outra em vez de trocar receita por despesa." };
  if (atual.grupo !== subgrupo.grupo || (atual.codigoContabil ?? null) !== (v.codigoContabil ?? null)) {
    const fechado = await travaDaCategoriaEmMesFechado(id);
    if (fechado) return { ok: false, message: `${fechado} Esta categoria tem lançamentos nesse mês, e o grupo e o código mudariam a DRE já entregue.` };
  }
  // Trocou de subgrupo: entra no fim da fila do novo.
  const ordem =
    atual.subgrupoId === v.subgrupoId
      ? undefined
      : ((await prisma.categoriaFinanceira.aggregate({ where: { subgrupoId: v.subgrupoId }, _max: { ordem: true } }))._max.ordem ?? 0) + 1;
  return gravar("salvarCategoria", () => prisma.categoriaFinanceira.update({ where: { id }, data: { ...dados, ...(ordem ? { ordem } : {}) } }));
}

export async function ligarCategoria(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const c = await prisma.categoriaFinanceira.findUnique({ where: { id }, select: { chave: true } });
  if (!ativo && c?.chave) return { ok: false, message: "O sistema usa esta categoria. Ela não pode ser desligada." };
  return gravar("ligarCategoria", () => prisma.categoriaFinanceira.update({ where: { id }, data: { ativo } }));
}

/** Só sai a que nunca foi usada; a que tem história se desliga, ou passa os lançamentos para outra. */
export async function apagarCategoria(id: number): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const c = await prisma.categoriaFinanceira.findUnique({
    where: { id },
    select: { chave: true, _count: { select: { lancamentos: true, recorrencias: true } } },
  });
  if (!c) return { ok: false, message: "Essa categoria não existe mais." };
  if (c.chave) return { ok: false, message: "O sistema usa esta categoria. Ela não pode ser apagada." };
  if (c._count.lancamentos + c._count.recorrencias > 0)
    return { ok: false, message: "Esta categoria tem lançamentos. Passe os lançamentos para outra categoria, ou desligue em vez de apagar." };
  return gravar("apagarCategoria", () => prisma.categoriaFinanceira.delete({ where: { id } }));
}

/**
 * Passa todos os lançamentos e contas fixas de uma categoria para outra, da
 * mesma natureza: é o jeito de juntar duas categorias que são a mesma coisa.
 * A de origem fica vazia e pode ser apagada. Se algum lançamento dela ou o
 * destino mudaria um mês já entregue ao contador, espera a reabertura.
 */
export async function moverLancamentosDeCategoria(deId: number, paraId: number): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  if (deId === paraId) return { ok: false, message: "Escolha outra categoria de destino." };
  const [de, para] = await Promise.all([
    prisma.categoriaFinanceira.findUnique({ where: { id: deId }, select: { chave: true, tipo: true, grupo: true } }),
    prisma.categoriaFinanceira.findUnique({ where: { id: paraId }, select: { chave: true, tipo: true, grupo: true, ativo: true } }),
  ]);
  if (!de || !para) return { ok: false, message: "Uma das categorias não existe mais. Recarregue a página." };
  if (de.chave) return { ok: false, message: "O sistema usa esta categoria nos lançamentos automáticos: os lançamentos dela não mudam de lugar." };
  if (para.chave && SO_CODIGO.includes(para.chave)) return { ok: false, message: "Essa categoria só guarda código contábil e não recebe lançamento." };
  if (de.tipo !== para.tipo) return { ok: false, message: "As duas categorias precisam ser da mesma natureza (receita com receita, despesa com despesa)." };
  if (!para.ativo) return { ok: false, message: "A categoria de destino está desligada. Ligue antes." };
  if (de.grupo !== para.grupo) {
    const fechado = await travaDaCategoriaEmMesFechado(deId);
    if (fechado) return { ok: false, message: `${fechado} Os lançamentos mudariam de linha na DRE já entregue.` };
  }
  return gravar("moverLancamentosDeCategoria", () =>
    prisma.$transaction([
      prisma.lancamento.updateMany({ where: { categoriaId: deId }, data: { categoriaId: paraId } }),
      prisma.recorrencia.updateMany({ where: { categoriaId: deId }, data: { categoriaId: paraId } }),
    ]),
  );
}

export async function salvarForma(id: number | null, raw: FormaRecebimentoInput): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const parsed = formaRecebimentoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const dados = { ...v, taxaPct: dec(v.taxaPct) };
  return gravar("salvarForma", async () => {
    if (id !== null) return prisma.formaRecebimento.update({ where: { id }, data: dados });
    const ultima = await prisma.formaRecebimento.aggregate({ _max: { ordem: true } });
    return prisma.formaRecebimento.create({ data: { ...dados, ordem: (ultima._max.ordem ?? 0) + 1 } });
  });
}

export async function ligarForma(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  return gravar("ligarForma", () => prisma.formaRecebimento.update({ where: { id }, data: { ativo } }));
}

/** Centro de custo: só o nome. A chave dos de sistema não muda por aqui. */
export async function salvarCentro(id: number | null, raw: CentroCustoInput): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const parsed = centroCustoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  return gravar("salvarCentro", () =>
    id === null ? prisma.centroCusto.create({ data: v }) : prisma.centroCusto.update({ where: { id }, data: v }),
  );
}

/** Desligado some dos formulários; o que já foi lançado nele continua nele. */
export async function ligarCentro(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const c = await prisma.centroCusto.findUnique({ where: { id }, select: { chave: true } });
  if (!ativo && c?.chave === CHAVE_CENTRO_SALAO)
    return { ok: false, message: "As vendas do fechamento do dia entram no Salão. Ele não pode ser desligado." };
  return gravar("ligarCentro", () => prisma.centroCusto.update({ where: { id }, data: { ativo } }));
}

// ---------------------------------------------------------------------------
// Lançamentos
// ---------------------------------------------------------------------------

const conferirCategoria = categoriaServe;

/**
 * Cria um lançamento, ou N parcelas dele. Parcelado, cada parcela vence um
 * mês depois da anterior e pertence ao mês em que vence; o centavo que sobra
 * da divisão vai na primeira.
 */
export async function criarLancamento(raw: LancamentoInput): Promise<Result<{ ids: number[] }>> {
  const user = await requireModule(MODULO);
  const parsed = lancamentoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const erro = await conferirCategoria(v.categoriaId, v.tipo);
  if (erro) return { ok: false, message: erro };
  const competencias = v.parcelas === 1 ? [v.competencia] : Array.from({ length: v.parcelas }, (_, i) => vencimentoDaParcela(v.vencimento, i));
  const fechado = await travaDoMes(competencias);
  if (fechado) return { ok: false, message: fechado };

  const base = {
    tipo: v.tipo,
    categoriaId: v.categoriaId,
    contaId: v.contaId,
    fornecedorId: v.fornecedorId,
    centroCustoId: v.centroCustoId,
    documento: v.documento,
    observacao: v.observacao,
    criadoPorId: user.id,
  };

  if (v.parcelas === 1) {
    return tentar("criarLancamento", async () => {
      const l = await prisma.lancamento.create({
        data: { ...base, descricao: v.descricao, valor: dec(v.valor), vencimento: toDateOnly(v.vencimento), competencia: competenciaDo(v.competencia) },
        select: { id: true },
      });
      return { ids: [l.id] };
    });
  }

  const grupo = randomUUID();
  const valores = dividirEmParcelas(v.valor, v.parcelas);
  return tentar("criarLancamento", async () => {
    const criados = await prisma.$transaction(
      valores.map((valor, i) => {
        const vencimento = vencimentoDaParcela(v.vencimento, i);
        return prisma.lancamento.create({
          data: {
            ...base,
            descricao: v.descricao,
            valor: dec(valor),
            vencimento: toDateOnly(vencimento),
            competencia: competenciaDo(vencimento.slice(0, 7)),
            parcela: i + 1,
            totalParcelas: v.parcelas,
            grupoParcelas: grupo,
          },
          select: { id: true },
        });
      }),
    );
    return { ids: criados.map((c) => c.id) };
  });
}

/** Só o que está em aberto se edita; o pago se estorna antes. */
export async function editarLancamento(id: number, raw: LancamentoInput): Promise<Simples> {
  await requireModule(MODULO);
  const parsed = lancamentoSchema.safeParse({ ...raw, parcelas: "1" });
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const atual = await prisma.lancamento.findUnique({
    where: { id },
    select: { status: true, tipo: true, origem: true, competencia: true, categoriaId: true },
  });
  if (!atual) return { ok: false, message: "Esse lançamento não existe mais." };
  if (atual.status !== "ABERTO") return { ok: false, message: "Só dá para editar o que está em aberto. Estorne a baixa antes." };
  if (atual.origem === "FECHAMENTO") return { ok: false, message: "Este veio do fechamento do dia. Corrija o fechamento." };
  const erro = await conferirCategoria(v.categoriaId, atual.tipo, atual.categoriaId);
  if (erro) return { ok: false, message: erro };
  const fechado = await travaDoMes([dataDe(atual.competencia), v.competencia]);
  if (fechado) return { ok: false, message: fechado };

  return gravar("editarLancamento", () =>
    prisma.lancamento.update({
      where: { id },
      data: {
        descricao: v.descricao,
        categoriaId: v.categoriaId,
        contaId: v.contaId,
        fornecedorId: v.fornecedorId,
        centroCustoId: v.centroCustoId,
        valor: dec(v.valor),
        vencimento: toDateOnly(v.vencimento),
        competencia: competenciaDo(v.competencia),
        documento: v.documento,
        observacao: v.observacao,
      },
    }),
  );
}

/** Paga ou recebe. O valor que mexe na conta é calculado aqui, nunca digitado. */
export async function baixarLancamento(id: number, raw: BaixaInput): Promise<Simples> {
  const user = await requireModule(MODULO);
  const parsed = baixaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const l = await prisma.lancamento.findUnique({ where: { id }, select: { status: true, valor: true, taxa: true } });
  if (!l) return { ok: false, message: "Esse lançamento não existe mais." };
  if (l.status !== "ABERTO") return { ok: false, message: "Este lançamento não está em aberto." };
  if (v.pagoEm > hoje()) return { ok: false, message: "A baixa é do que já aconteceu: a data não pode ser no futuro." };
  const erroDaData = (await conferirDataNaConta(v.contaId, v.pagoEm)) ?? (await travaDoMes([v.pagoEm]));
  if (erroDaData) return { ok: false, message: erroDaData };

  const valorPago = valorLiquido({ valor: l.valor.toNumber(), taxa: l.taxa.toNumber(), jurosMulta: v.jurosMulta, desconto: v.desconto });
  if (valorPago < 0) return { ok: false, message: "O desconto é maior que o valor." };

  return gravar("baixarLancamento", () =>
    prisma.lancamento.update({
      // O status na condição fecha a corrida de dois cliques: o segundo não acha
      // o lançamento aberto e falha, em vez de baixar duas vezes.
      where: { id, status: "ABERTO" },
      data: {
        status: "PAGO",
        pagoEm: toDateOnly(v.pagoEm),
        contaId: v.contaId,
        jurosMulta: dec(v.jurosMulta),
        desconto: dec(v.desconto),
        valorPago: dec(valorPago),
        baixadoPorId: user.id,
      },
    }),
  );
}

/**
 * Baixa vários de uma vez, sem juros nem desconto: é a conferência do extrato
 * (os repasses do cartão que caíram). Cada um vai para a conta que já tem;
 * quem não tem, vai para `contaId`.
 */
export async function baixarEmLote(ids: number[], pagoEm: string, contaId: number | null): Promise<Result<{ baixados: number }>> {
  const user = await requireModule(MODULO);
  if (ids.length === 0 || ids.length > 500) return { ok: false, message: "Escolha o que baixar." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pagoEm)) return { ok: false, message: "Data inválida." };
  if (pagoEm > hoje()) return { ok: false, message: "A baixa é do que já aconteceu: a data não pode ser no futuro." };
  const fechado = await travaDoMes([pagoEm]);
  if (fechado) return { ok: false, message: fechado };
  const lista = await prisma.lancamento.findMany({
    where: { id: { in: ids }, status: "ABERTO" },
    select: { id: true, valor: true, taxa: true, contaId: true },
  });
  if (lista.some((l) => l.contaId === null) && contaId === null)
    return { ok: false, message: "Alguns não têm conta. Escolha a conta para eles." };
  const contas = [...new Set(lista.map((l) => l.contaId ?? contaId!))];
  for (const c of contas) {
    const erro = await conferirDataNaConta(c, pagoEm);
    if (erro) return { ok: false, message: erro };
  }
  return tentar("baixarEmLote", async () => {
    await prisma.$transaction(
      lista.map((l) =>
        prisma.lancamento.update({
          where: { id: l.id, status: "ABERTO" },
          data: {
            status: "PAGO",
            pagoEm: toDateOnly(pagoEm),
            contaId: l.contaId ?? contaId,
            valorPago: dec(valorLiquido({ valor: l.valor.toNumber(), taxa: l.taxa.toNumber() })),
            jurosMulta: dec(0),
            desconto: dec(0),
            baixadoPorId: user.id,
          },
        }),
      ),
    );
    return { baixados: lista.length };
  });
}

/** Desfaz a baixa: volta a estar em aberto, e o saldo da conta volta junto. */
export async function estornarBaixa(id: number): Promise<Simples> {
  await requireModule(MODULO);
  const l = await prisma.lancamento.findUnique({ where: { id }, select: { pagoEm: true, linhaExtratoId: true } });
  if (l?.linhaExtratoId)
    return { ok: false, message: "Esta baixa está conciliada com o extrato do banco. Desfaça a conciliação na tela Conciliação bancária." };
  const fechado = await travaDoMes([dataDe(l?.pagoEm)]);
  if (fechado) return { ok: false, message: fechado };
  return gravar("estornarBaixa", () =>
    prisma.lancamento.update({
      where: { id, status: "PAGO" },
      data: { status: "ABERTO", pagoEm: null, valorPago: null, jurosMulta: dec(0), desconto: dec(0), baixadoPorId: null },
    }),
  );
}

/** Cancelado fica no histórico e sai de todas as contas. Reabrir desfaz. */
export async function cancelarLancamento(id: number, cancelar: boolean): Promise<Simples> {
  await requireModule(MODULO);
  const l = await prisma.lancamento.findUnique({ where: { id }, select: { origem: true, status: true, competencia: true } });
  if (!l) return { ok: false, message: "Esse lançamento não existe mais." };
  if (l.origem === "FECHAMENTO") return { ok: false, message: "Este veio do fechamento do dia. Corrija o fechamento." };
  if (l.status === "PAGO") return { ok: false, message: "Estorne a baixa antes de cancelar." };
  const fechado = await travaDoMes([dataDe(l.competencia)]);
  if (fechado) return { ok: false, message: fechado };
  return gravar("cancelarLancamento", () =>
    prisma.lancamento.update({
      where: { id, status: cancelar ? "ABERTO" : "CANCELADO" },
      data: { status: cancelar ? "CANCELADO" : "ABERTO" },
    }),
  );
}

/**
 * Apagar é para o erro de digitação: só o lançado à mão e ainda em aberto. O
 * que veio de conta fixa se cancela (apagado, seria gerado de novo).
 */
export async function apagarLancamento(id: number): Promise<Simples & { lixeiraId?: number }> {
  const user = await requireModule(MODULO);
  // Inteiro, com os anexos: vai para a lixeira e pode voltar por 30 dias.
  const l = await prisma.lancamento.findUnique({ where: { id }, include: { anexos: true } });
  if (!l) return { ok: false, message: "Esse lançamento não existe mais." };
  if (l.origem !== "MANUAL") return { ok: false, message: "Só se apaga o que foi lançado à mão. Cancele este." };
  if (l.status === "PAGO") return { ok: false, message: "Estorne a baixa antes de apagar." };
  const fechado = await travaDoMes([dataDe(l.competencia)]);
  if (fechado) return { ok: false, message: fechado };
  const r = await tentar("apagarLancamento", () =>
    prisma.$transaction(async (tx) => {
      const lixeiraId = await guardarNaLixeira(tx, {
        tipo: "lancamento",
        rotulo: `${l.descricao} · ${formatMoney(l.valor.toNumber())}`,
        dados: l,
        apagadoPor: user.name ?? user.username,
      });
      await tx.lancamento.delete({ where: { id } });
      return lixeiraId;
    }),
  );
  if (!r.ok) return r;
  await esvaziarVencidos();
  return { ok: true, lixeiraId: r.data };
}

// ---------------------------------------------------------------------------
// Contas fixas (recorrências)
// ---------------------------------------------------------------------------

/**
 * Salvar não reescreve o que já foi gerado: a conta de outubro já lançada
 * fica como está, e a mudança vale do próximo lançamento em diante.
 */
export async function salvarRecorrencia(id: number | null, raw: RecorrenciaInput): Promise<Simples> {
  await requireModule(MODULO);
  const parsed = recorrenciaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const anterior = id === null ? null : await prisma.recorrencia.findUnique({ where: { id }, select: { categoriaId: true } });
  const erro = await conferirCategoria(v.categoriaId, v.tipo, anterior?.categoriaId);
  if (erro) return { ok: false, message: erro };
  const dados = {
    ...v,
    valor: dec(v.valor),
    inicio: competenciaDo(v.inicio),
    fim: v.fim ? competenciaDo(v.fim) : null,
  };
  const r = await gravar("salvarRecorrencia", () =>
    id === null ? prisma.recorrencia.create({ data: dados }) : prisma.recorrencia.update({ where: { id }, data: dados }),
  );
  if (r.ok) await gerarRecorrencias(hoje());
  return r;
}

export async function ligarRecorrencia(id: number, ativo: boolean): Promise<Simples> {
  await requireModule(MODULO);
  const r = await gravar("ligarRecorrencia", () => prisma.recorrencia.update({ where: { id }, data: { ativo } }));
  if (r.ok && ativo) await gerarRecorrencias(hoje());
  return r;
}

/** Os lançamentos já gerados ficam: são contas que existiram. */
export async function apagarRecorrencia(id: number): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("apagarRecorrencia", () => prisma.recorrencia.delete({ where: { id } }));
}

// ---------------------------------------------------------------------------
// Fechamento do dia
// ---------------------------------------------------------------------------

/** O fechamento só se refaz enquanto ninguém conferiu o que ele gerou (`travaDoFechamentoDoDia`). */
async function travaDoFechamento(fechamentoId: number): Promise<string | null> {
  const lancamentos = await prisma.lancamento.findMany({
    where: { fechamentoId },
    select: { baixadoPorId: true, status: true, linhaExtratoId: true, _count: { select: { anexos: true } } },
  });
  return travaDoFechamentoDoDia(lancamentos.map((l) => ({ ...l, anexos: l._count.anexos })));
}

/**
 * Grava o fechamento do PDV de um dia e gera os lançamentos dele. Refazer o
 * mesmo dia apaga os lançamentos gerados antes e gera de novo: é assim que
 * corrigir um valor digitado errado não deixa sobra.
 */
export async function salvarFechamento(raw: FechamentoInput): Promise<Simples> {
  const user = await requireModule(MODULO);
  const parsed = fechamentoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  if (v.data > hoje()) return { ok: false, message: "O fechamento é de um dia que já aconteceu." };
  const fechado = await travaDoMes([v.data]);
  if (fechado) return { ok: false, message: fechado };

  const itens = v.itens.filter((i) => i.valor > 0);
  const total = itens.reduce((s, i) => s + i.valor, 0);
  if (itens.length === 0) return { ok: false, message: "Digite o valor de pelo menos uma forma de pagamento." };
  if (v.taxaServico > total) return { ok: false, message: "A taxa de serviço é maior que o total do dia." };

  const [formas, categorias, existente, salao] = await Promise.all([
    prisma.formaRecebimento.findMany({ where: { id: { in: itens.map((i) => i.formaId) } } }),
    prisma.categoriaFinanceira.findMany({
      where: { chave: { in: [CHAVE_CATEGORIA.vendasDoSalao, CHAVE_CATEGORIA.repasseTaxaServico] } },
      select: { id: true, chave: true },
    }),
    prisma.fechamentoDoDia.findUnique({ where: { data: toDateOnly(v.data) }, select: { id: true } }),
    // A venda do PDV é do salão. Sem o centro (alguém apagou), a venda entra
    // "sem centro" em vez de travar o fechamento.
    prisma.centroCusto.findUnique({ where: { chave: CHAVE_CENTRO_SALAO }, select: { id: true } }),
  ]);
  if (formas.length !== itens.length) return { ok: false, message: "Uma das formas não existe mais. Recarregue a página." };
  const categoriaDa = (chave: string) => categorias.find((c) => c.chave === chave)?.id;
  if (!categoriaDa(CHAVE_CATEGORIA.vendasDoSalao) || !categoriaDa(CHAVE_CATEGORIA.repasseTaxaServico))
    return { ok: false, message: "Faltam as categorias do sistema no plano de contas. Fale com quem cuida do sistema." };

  for (const f of formas) {
    if (f.prazoDias !== 0) continue;
    const erro = await conferirDataNaConta(f.contaId, v.data);
    if (erro) return { ok: false, message: erro };
  }
  if (existente) {
    const trava = await travaDoFechamento(existente.id);
    if (trava) return { ok: false, message: trava };
  }

  const gerados = lancamentosDoFechamento(
    {
      data: v.data,
      taxaServico: v.taxaServico,
      itens: itens.map((i) => {
        const f = formas.find((x) => x.id === i.formaId)!;
        return { formaId: f.id, nome: f.nome, taxaPct: f.taxaPct.toNumber(), prazoDias: f.prazoDias, contaId: f.contaId, valorBruto: i.valor };
      }),
    },
    { vendas: CHAVE_CATEGORIA.vendasDoSalao, repasse: CHAVE_CATEGORIA.repasseTaxaServico },
  );

  return gravar("salvarFechamento", () =>
    prisma.$transaction(async (tx) => {
      if (existente) await tx.fechamentoDoDia.delete({ where: { id: existente.id } });
      await tx.fechamentoDoDia.create({
        data: {
          data: toDateOnly(v.data),
          taxaServico: dec(v.taxaServico),
          observacao: v.observacao,
          criadoPorId: user.id,
          itens: { create: itens.map((i) => ({ formaId: i.formaId, valorBruto: dec(i.valor) })) },
          lancamentos: {
            create: gerados.map((g) => ({
              tipo: g.tipo,
              descricao: g.descricao,
              categoriaId: categoriaDa(g.chaveCategoria)!,
              contaId: g.contaId,
              valor: dec(g.valor),
              taxa: dec(g.taxa),
              vencimento: toDateOnly(g.vencimento),
              competencia: toDateOnly(g.competencia),
              status: g.pagoEm ? "PAGO" : "ABERTO",
              pagoEm: g.pagoEm ? toDateOnly(g.pagoEm) : null,
              valorPago: g.valorPago === null ? null : dec(g.valorPago),
              origem: "FECHAMENTO",
              centroCustoId: salao?.id ?? null,
              criadoPorId: user.id,
            })),
          },
        },
      });
    }),
  );
}

export async function apagarFechamento(id: number): Promise<Simples> {
  await requireModule(MODULO);
  const f = await prisma.fechamentoDoDia.findUnique({ where: { id }, select: { data: true } });
  const trava = (await travaDoMes([dataDe(f?.data)])) ?? (await travaDoFechamento(id));
  if (trava) return { ok: false, message: trava };
  return gravar("apagarFechamento", () => prisma.fechamentoDoDia.delete({ where: { id } }));
}

// ---------------------------------------------------------------------------
// Transferências
// ---------------------------------------------------------------------------

export async function salvarTransferencia(raw: TransferenciaInput): Promise<Simples> {
  const user = await requireModule(MODULO);
  const parsed = transferenciaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  if (v.data > hoje()) return { ok: false, message: "A transferência é do que já aconteceu: a data não pode ser no futuro." };
  const fechado = await travaDoMes([v.data]);
  if (fechado) return { ok: false, message: fechado };
  for (const c of [v.origemId, v.destinoId]) {
    const erro = await conferirDataNaConta(c, v.data);
    if (erro) return { ok: false, message: erro };
  }
  return gravar("salvarTransferencia", () =>
    prisma.transferencia.create({ data: { ...v, valor: dec(v.valor), data: toDateOnly(v.data), criadoPorId: user.id } }),
  );
}

export async function apagarTransferencia(id: number): Promise<Simples> {
  await requireModule(MODULO);
  const t = await prisma.transferencia.findUnique({ where: { id }, select: { data: true, _count: { select: { linhasExtrato: true } } } });
  if (t && t._count.linhasExtrato > 0)
    return { ok: false, message: "Esta transferência está conciliada com o extrato. Desfaça a conciliação antes." };
  const fechado = await travaDoMes([dataDe(t?.data)]);
  if (fechado) return { ok: false, message: fechado };
  return gravar("apagarTransferencia", () => prisma.transferencia.delete({ where: { id } }));
}

// ---------------------------------------------------------------------------
// Anexos e mês do contador
// ---------------------------------------------------------------------------

/** Tirar um anexo não muda número nenhum: vale mesmo com o mês fechado. */
export async function apagarAnexo(id: number): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("apagarAnexo", () => prisma.anexoFinanceiro.delete({ where: { id } }));
}

/**
 * Fecha o mês entregue ao contador. Daí em diante, nada com data nele se
 * grava até alguém que configura o módulo reabrir.
 */
export async function fecharMes(mes: string): Promise<Simples> {
  const user = await requireModule(MODULO, CONFIGURAR);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return { ok: false, message: "Mês inválido." };
  const fechados = await prisma.mesFechado.findMany({ select: { mes: true } });
  const motivo = motivoParaNaoFecharMes(mes, hoje().slice(0, 7), fechados.map((f) => f.mes));
  if (motivo) return { ok: false, message: motivo };
  return gravar("fecharMes", () =>
    prisma.mesFechado.upsert({ where: { mes }, create: { mes, fechadoPorId: user.id }, update: {} }),
  );
}

export async function reabrirMes(mes: string): Promise<Simples> {
  await requireModule(MODULO, CONFIGURAR);
  const r = await gravar("reabrirMes", () => prisma.mesFechado.deleteMany({ where: { mes } }));
  // As contas fixas que o mês fechado segurou entram agora, sem esperar o dia virar.
  if (r.ok) await gerarRecorrencias(hoje());
  return r;
}
