"use server";

import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth-guard";
import { dateOnlyToString, toDateOnly } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { diferencaDaConciliacao, valorLiquido } from "@/lib/financeiro-calculo";
import { categoriaServe, competenciaDo, dataPermitidaNaConta, mensagemDeMesFechado } from "@/lib/financeiro-dados";
import { formatMoney } from "@/lib/format";
import { extratoImportadoSchema, type ExtratoImportadoInput, lancamentoDaLinhaSchema, type LancamentoDaLinhaInput } from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";

/**
 * A conciliação bancária: o extrato do banco de um lado, os lançamentos do
 * outro, e cada linha do extrato casada com o que a explica.
 *
 * Conciliar nunca inventa número: o lançamento em aberto é baixado com a data
 * e o valor do extrato; o já pago só é ligado. Tudo o que uma conciliação
 * faz fica anotado na linha (`baixou`, `criouTransferencia`) para "desfazer"
 * voltar exatamente ao que era.
 */

type Result<T> = { ok: true; data: T } | { ok: false; message: string };
type Simples = { ok: boolean; message?: string };

const MODULO = "financeiro";
const dec = (n: number) => new Prisma.Decimal(n);

async function tentar<T>(nome: string, fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const data = await fn();
    revalidatePath("/admin/financeiro", "layout");
    return { ok: true, data };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      return { ok: false, message: "Isso mudou enquanto você olhava. Recarregue a página." };
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

/** A linha pendente, ou a mensagem de por que não dá. */
async function linhaPendente(id: number) {
  const linha = await prisma.linhaExtrato.findUnique({ where: { id } });
  if (!linha) return { erro: "Essa linha do extrato não existe mais. Recarregue a página." } as const;
  if (linha.status !== "PENDENTE") return { erro: "Essa linha já foi resolvida. Recarregue a página." } as const;
  return { linha, data: dateOnlyToString(linha.data), valor: linha.valor.toNumber() } as const;
}

// ---------------------------------------------------------------------------
// Importar
// ---------------------------------------------------------------------------

/**
 * Grava as transações do extrato numa conta. A repetida (mesma chave na mesma
 * conta) é pulada, então importar o mesmo arquivo duas vezes, ou dois
 * arquivos com dias em comum, não duplica. O que é anterior ao saldo inicial
 * da conta fica de fora: já está dentro daquele número.
 */
export async function importarExtrato(
  contaId: number,
  raw: ExtratoImportadoInput,
): Promise<Result<{ novas: number; repetidas: number; antes: number }>> {
  const user = await requireModule(MODULO);
  const parsed = extratoImportadoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Extrato inválido." };
  const v = parsed.data;
  const conta = await prisma.contaFinanceira.findUnique({ where: { id: contaId } });
  if (!conta) return { ok: false, message: "Essa conta não existe mais." };
  if (conta.contaNoBanco && v.conta && conta.contaNoBanco !== v.conta)
    return { ok: false, message: `Este extrato é da conta ${v.conta} no banco, e ${conta.nome} é a ${conta.contaNoBanco}. Escolha a conta certa.` };

  const inicio = dateOnlyToString(conta.saldoInicialEm);
  const validas = v.transacoes.filter((t) => t.data >= inicio);
  const antes = v.transacoes.length - validas.length;
  if (validas.length === 0)
    return { ok: false, message: `Todas as transações são de antes de ${inicio.split("-").reverse().join("/")}, quando a conta começou a ser controlada aqui.` };

  return tentar("importarExtrato", () =>
    prisma.$transaction(async (tx) => {
      const extrato = await tx.extratoImportado.create({
        data: {
          contaId,
          arquivo: v.arquivo,
          de: v.de ? toDateOnly(v.de) : null,
          ate: v.ate ? toDateOnly(v.ate) : null,
          saldoFinal: v.saldoFinal === null ? null : dec(v.saldoFinal),
          saldoEm: v.saldoEm ? toDateOnly(v.saldoEm) : null,
          criadoPorId: user.id,
        },
      });
      const r = await tx.linhaExtrato.createMany({
        data: validas.map((t) => ({
          extratoId: extrato.id,
          contaId,
          chave: t.chave,
          data: toDateOnly(t.data),
          valor: dec(t.valor),
          descricao: t.descricao || "(sem descrição)",
        })),
        skipDuplicates: true,
      });
      // Nada novo: o arquivo já tinha sido importado. Não fica um registro vazio na lista.
      if (r.count === 0) await tx.extratoImportado.delete({ where: { id: extrato.id } });
      if (!conta.contaNoBanco && v.conta) await tx.contaFinanceira.update({ where: { id: contaId }, data: { contaNoBanco: v.conta } });
      return { novas: r.count, repetidas: validas.length - r.count, antes };
    }),
  );
}

/** Tira um extrato importado por engano, enquanto nenhuma linha dele foi conciliada. */
export async function apagarExtrato(id: number): Promise<Simples> {
  await requireModule(MODULO);
  const conciliadas = await prisma.linhaExtrato.count({ where: { extratoId: id, status: "CONCILIADA" } });
  if (conciliadas > 0) return { ok: false, message: "Parte deste extrato já foi conciliada. Desfaça essas linhas antes." };
  return gravar("apagarExtrato", () => prisma.extratoImportado.delete({ where: { id } }));
}

// ---------------------------------------------------------------------------
// Conciliar
// ---------------------------------------------------------------------------

/**
 * Casa a linha com um ou mais lançamentos. O em aberto é baixado na data do
 * extrato; o já pago nesta conta só é ligado. A soma tem de bater no
 * centavo, com uma exceção: um único lançamento em aberto pode ter
 * diferença, que vira juros (o banco mexeu mais) ou desconto (mexeu menos).
 */
export async function conciliarLinha(linhaId: number, lancamentoIds: number[]): Promise<Simples> {
  const user = await requireModule(MODULO);
  if (lancamentoIds.length === 0 || lancamentoIds.length > 200) return { ok: false, message: "Escolha o que corresponde a esta linha." };
  const p = await linhaPendente(linhaId);
  if ("erro" in p) return { ok: false, message: p.erro! };
  const { linha, data, valor } = p;
  const tipo = valor > 0 ? "RECEBER" : "PAGAR";

  const lancamentos = await prisma.lancamento.findMany({ where: { id: { in: lancamentoIds } } });
  if (lancamentos.length !== lancamentoIds.length) return { ok: false, message: "Algum lançamento não existe mais. Recarregue a página." };
  for (const l of lancamentos) {
    if (l.tipo !== tipo) return { ok: false, message: tipo === "PAGAR" ? "Saída do extrato casa com conta a pagar." : "Entrada do extrato casa com conta a receber." };
    if (l.linhaExtratoId !== null) return { ok: false, message: `"${l.descricao}" já está conciliado com outra linha.` };
    if (l.status === "CANCELADO") return { ok: false, message: `"${l.descricao}" está cancelado.` };
    if (l.status === "PAGO" && l.contaId !== linha.contaId) return { ok: false, message: `"${l.descricao}" foi baixado em outra conta.` };
    if (l.status === "ABERTO" && l.contaId !== null && l.contaId !== linha.contaId)
      return { ok: false, message: `"${l.descricao}" está previsto para outra conta. Mude a conta dele antes.` };
  }

  const abertos = lancamentos.filter((l) => l.status === "ABERTO");
  const quanto = (l: (typeof lancamentos)[number]) =>
    l.status === "PAGO" ? l.valorPago!.toNumber() : valorLiquido({ valor: l.valor.toNumber(), taxa: l.taxa.toNumber() });
  const diferenca = diferencaDaConciliacao(valor, lancamentos.map((l) => ({ valor: quanto(l) })));
  if (diferenca !== 0 && !(lancamentos.length === 1 && abertos.length === 1))
    return { ok: false, message: `A soma não bate com o extrato: diferença de ${formatMoney(Math.abs(diferenca))}.` };

  if (abertos.length > 0) {
    const erro = (await mensagemDeMesFechado([data])) ?? (await dataPermitidaNaConta(linha.contaId, data));
    if (erro) return { ok: false, message: erro };
  }
  // A diferença de um lançamento só: a mais é juros, a menos é desconto.
  const juros = diferenca > 0 ? diferenca : 0;
  const desconto = diferenca < 0 ? -diferenca : 0;

  return gravar("conciliarLinha", () =>
    prisma.$transaction([
      ...abertos.map((l) =>
        prisma.lancamento.update({
          where: { id: l.id, status: "ABERTO", linhaExtratoId: null },
          data: {
            status: "PAGO",
            pagoEm: linha.data,
            contaId: linha.contaId,
            jurosMulta: dec(juros),
            desconto: dec(desconto),
            // Sozinho, o lançamento leva o valor do extrato (com a diferença
            // em juros ou desconto); num lote, cada um leva o próprio líquido.
            valorPago: dec(lancamentos.length === 1 ? Math.abs(valor) : quanto(l)),
            baixadoPorId: user.id,
            linhaExtratoId: linha.id,
          },
        }),
      ),
      ...lancamentos
        .filter((l) => l.status === "PAGO")
        .map((l) => prisma.lancamento.update({ where: { id: l.id, linhaExtratoId: null }, data: { linhaExtratoId: linha.id } })),
      prisma.linhaExtrato.update({
        where: { id: linha.id, status: "PENDENTE" },
        data: { status: "CONCILIADA", baixou: abertos.map((l) => l.id) },
      }),
    ]),
  );
}

/**
 * A linha que não tem lançamento porque nasceu no banco: tarifa, rendimento,
 * IOF. Vira um lançamento já baixado, com a data e o valor do extrato.
 */
export async function lancamentoDaLinha(linhaId: number, raw: LancamentoDaLinhaInput): Promise<Simples> {
  const user = await requireModule(MODULO);
  const parsed = lancamentoDaLinhaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const v = parsed.data;
  const p = await linhaPendente(linhaId);
  if ("erro" in p) return { ok: false, message: p.erro! };
  const { linha, data, valor } = p;
  const tipo = valor > 0 ? "RECEBER" : "PAGAR";
  const erro = (await categoriaServe(v.categoriaId, tipo)) ?? (await mensagemDeMesFechado([data])) ?? (await dataPermitidaNaConta(linha.contaId, data));
  if (erro) return { ok: false, message: erro };

  return gravar("lancamentoDaLinha", () =>
    prisma.$transaction([
      prisma.lancamento.create({
        data: {
          tipo,
          descricao: v.descricao,
          categoriaId: v.categoriaId,
          centroCustoId: v.centroCustoId,
          contaId: linha.contaId,
          valor: dec(Math.abs(valor)),
          vencimento: linha.data,
          competencia: competenciaDo(data.slice(0, 7)),
          status: "PAGO",
          pagoEm: linha.data,
          valorPago: dec(Math.abs(valor)),
          origem: "EXTRATO",
          criadoPorId: user.id,
          baixadoPorId: user.id,
          linhaExtratoId: linha.id,
        },
      }),
      prisma.linhaExtrato.update({ where: { id: linha.id, status: "PENDENTE" }, data: { status: "CONCILIADA" } }),
    ]),
  );
}

/**
 * A linha é dinheiro indo ou vindo de outra conta da casa. Com
 * `transferenciaId`, liga a uma transferência que já existe (a outra ponta
 * foi conciliada antes, ou alguém lançou à mão); sem, cria a transferência.
 */
export async function transferenciaDaLinha(linhaId: number, outra: { contaId: number } | { transferenciaId: number }): Promise<Simples> {
  const user = await requireModule(MODULO);
  const p = await linhaPendente(linhaId);
  if ("erro" in p) return { ok: false, message: p.erro! };
  const { linha, data, valor } = p;
  const sai = valor < 0;

  if ("transferenciaId" in outra) {
    const t = await prisma.transferencia.findUnique({ where: { id: outra.transferenciaId } });
    if (!t) return { ok: false, message: "Essa transferência não existe mais." };
    if (t.valor.toNumber() !== Math.abs(valor)) return { ok: false, message: "O valor da transferência não bate com o extrato." };
    if ((sai ? t.origemId : t.destinoId) !== linha.contaId) return { ok: false, message: "Essa transferência não passa por esta conta neste sentido." };
    return gravar("transferenciaDaLinha", () =>
      prisma.linhaExtrato.update({ where: { id: linha.id, status: "PENDENTE" }, data: { status: "CONCILIADA", transferenciaId: t.id } }),
    );
  }

  if (outra.contaId === linha.contaId) return { ok: false, message: "Escolha a outra conta." };
  const erro =
    (await mensagemDeMesFechado([data])) ?? (await dataPermitidaNaConta(linha.contaId, data)) ?? (await dataPermitidaNaConta(outra.contaId, data));
  if (erro) return { ok: false, message: erro };
  return gravar("transferenciaDaLinha", () =>
    prisma.$transaction(async (tx) => {
      const t = await tx.transferencia.create({
        data: {
          origemId: sai ? linha.contaId : outra.contaId,
          destinoId: sai ? outra.contaId : linha.contaId,
          valor: dec(Math.abs(valor)),
          data: linha.data,
          observacao: linha.descricao.slice(0, 120),
          criadoPorId: user.id,
        },
      });
      await tx.linhaExtrato.update({
        where: { id: linha.id, status: "PENDENTE" },
        data: { status: "CONCILIADA", transferenciaId: t.id, criouTransferencia: true },
      });
    }),
  );
}

export async function ignorarLinha(linhaId: number, ignorar: boolean): Promise<Simples> {
  await requireModule(MODULO);
  return gravar("ignorarLinha", () =>
    prisma.linhaExtrato.update({
      where: { id: linhaId, status: ignorar ? "PENDENTE" : "IGNORADA" },
      data: { status: ignorar ? "IGNORADA" : "PENDENTE" },
    }),
  );
}

/**
 * Volta a linha a pendente e desfaz o que a conciliação fez: o que ela baixou
 * volta a abrir, o que ela criou (lançamento de tarifa, transferência) some,
 * e o que só foi ligado é desligado.
 */
export async function desfazerConciliacao(linhaId: number): Promise<Simples> {
  await requireModule(MODULO);
  const linha = await prisma.linhaExtrato.findUnique({
    where: { id: linhaId },
    include: { lancamentos: { select: { id: true, origem: true } } },
  });
  if (!linha || linha.status !== "CONCILIADA") return { ok: false, message: "Essa linha não está conciliada. Recarregue a página." };
  const mexeuNoNumero = linha.baixou.length > 0 || linha.criouTransferencia || linha.lancamentos.some((l) => l.origem === "EXTRATO");
  if (mexeuNoNumero) {
    const erro = await mensagemDeMesFechado([dateOnlyToString(linha.data)]);
    if (erro) return { ok: false, message: erro };
  }
  const criados = linha.lancamentos.filter((l) => l.origem === "EXTRATO").map((l) => l.id);

  return gravar("desfazerConciliacao", () =>
    prisma.$transaction(async (tx) => {
      if (criados.length > 0) await tx.lancamento.deleteMany({ where: { id: { in: criados } } });
      if (linha.baixou.length > 0)
        await tx.lancamento.updateMany({
          where: { id: { in: linha.baixou } },
          data: { status: "ABERTO", pagoEm: null, valorPago: null, jurosMulta: dec(0), desconto: dec(0), baixadoPorId: null },
        });
      await tx.lancamento.updateMany({ where: { linhaExtratoId: linha.id }, data: { linhaExtratoId: null } });
      if (linha.transferenciaId && linha.criouTransferencia) {
        // A outra ponta (a linha do outro banco) volta a pendente junto.
        await tx.linhaExtrato.updateMany({
          where: { transferenciaId: linha.transferenciaId, id: { not: linha.id } },
          data: { status: "PENDENTE", transferenciaId: null },
        });
        await tx.linhaExtrato.update({ where: { id: linha.id }, data: { transferenciaId: null } });
        await tx.transferencia.delete({ where: { id: linha.transferenciaId } });
      }
      await tx.linhaExtrato.update({
        where: { id: linha.id },
        data: { status: "PENDENTE", transferenciaId: null, baixou: [], criouTransferencia: false },
      });
    }),
  );
}
