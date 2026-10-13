"use server";

import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { limparContadores } from "@/lib/contadores";
import { lerNumeroBR } from "@/lib/format";
import { Prisma } from "@/generated/prisma/client";

type Result = { ok: true } | { ok: false; message: string };

/**
 * As decisões da tela de Pendências.
 *
 * Todas fora do link de atalhos (sem `{ atalho: true }`): aprovar correção,
 * resolver cobrança de fornecedor e mexer em cadastro são do dono e de quem
 * cuida das compras, não do estoquista.
 */

function feito() {
  revalidatePath("/admin/compras", "layout");
  limparContadores();
}

/** P2002: índice único — aqui, código de produto repetido. */
function ehRepetido(err: unknown) {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// ---------------------------------------------------------------------------
// Ideal de Requisição sugerido pelo estoquista
// ---------------------------------------------------------------------------

/**
 * Aceita o ideal sugerido, ou outro que o dono digitou no lugar. A trava é
 * marcar a sugestão primeiro, como em `aceitarCorrecao`.
 */
export async function aceitarIdealSugerido(id: number, texto?: string): Promise<Result> {
  const autor = await requireModule("compras");
  const digitado = texto === undefined || texto.trim() === "" ? null : lerNumeroBR(texto.trim());
  if (texto !== undefined && texto.trim() !== "" && (digitado === null || digitado < 0 || digitado > 999999)) {
    return { ok: false, message: "Ideal inválido." };
  }
  try {
    const aplicou = await prisma.$transaction(async (tx) => {
      const s = await tx.sugestaoIdealRequisicao.findUnique({
        where: { id },
        select: { status: true, listaId: true, produtoId: true, idealSugerido: true },
      });
      if (!s || s.status !== "PENDENTE") return "resolvida" as const;
      const trava = await tx.sugestaoIdealRequisicao.updateMany({
        where: { id, status: "PENDENTE" },
        data: { status: "APROVADO", decididoEm: new Date(), decididoPorId: autor.id },
      });
      if (trava.count === 0) return "resolvida" as const;
      const r = await tx.listaCompraItem.updateMany({
        where: { listaId: s.listaId, produtoId: s.produtoId },
        data: { idealStock: digitado === null ? s.idealSugerido : new Prisma.Decimal(digitado.toFixed(3)) },
      });
      if (r.count === 0) throw new Error("FORA_DA_LISTA");
      return "ok" as const;
    });
    if (aplicou === "resolvida") return { ok: false, message: "Esta sugestão já foi decidida." };
    feito();
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.message === "FORA_DA_LISTA") {
      return { ok: false, message: "O produto saiu da compra de rotina. Recuse a sugestão." };
    }
    console.error("[aceitarIdealSugerido] falha:", err);
    return { ok: false, message: "Não foi possível aceitar." };
  }
}

export async function recusarIdealSugerido(id: number): Promise<Result> {
  const autor = await requireModule("compras");
  const r = await prisma.sugestaoIdealRequisicao.updateMany({
    where: { id, status: "PENDENTE" },
    data: { status: "RECUSADO", decididoEm: new Date(), decididoPorId: autor.id },
  });
  if (r.count === 0) return { ok: false, message: "Esta sugestão já foi decidida." };
  feito();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Correções sugeridas pelo estoquista
// ---------------------------------------------------------------------------

/**
 * Aceita a correção: o produto passa a ter o nome, a unidade e a categoria
 * que o estoquista sugeriu. A trava é marcar a correção primeiro — duas
 * pessoas aceitando ao mesmo tempo, só uma aplica.
 */
export async function aceitarCorrecao(id: number): Promise<Result> {
  const autor = await requireModule("compras");
  try {
    const aplicou = await prisma.$transaction(async (tx) => {
      const c = await tx.contagemProdutoCorrecao.findUnique({
        where: { id },
        select: {
          status: true,
          produtoId: true,
          nome: true,
          unit: true,
          categoryId: true,
          idealStock: true,
          lotSize: true,
          desativar: true,
        },
      });
      if (!c || c.status !== "PENDENTE") return false;
      const trava = await tx.contagemProdutoCorrecao.updateMany({
        where: { id, status: "PENDENTE" },
        data: { status: "APROVADO", decididoEm: new Date(), decididoPorId: autor.id },
      });
      if (trava.count === 0) return false;
      await tx.product.update({
        where: { id: c.produtoId },
        data: {
          name: c.nome,
          unit: c.unit,
          categoryId: c.categoryId,
          // Estoque ideal e lote só quando a correção mexeu neles.
          ...(c.idealStock !== null ? { idealStock: c.idealStock } : {}),
          ...(c.lotSize !== null ? { lotSize: c.lotSize } : {}),
          // O estoquista disse que a casa não usa mais: sai do cadastro ativo.
          ...(c.desativar ? { isActive: false } : {}),
        },
      });
      return true;
    });
    if (!aplicou) return { ok: false, message: "Esta correção já foi decidida." };
    feito();
    return { ok: true };
  } catch (err) {
    console.error("[aceitarCorrecao]", err);
    return { ok: false, message: "Não foi possível aplicar a correção." };
  }
}

export async function recusarCorrecao(id: number): Promise<Result> {
  const autor = await requireModule("compras");
  const r = await prisma.contagemProdutoCorrecao.updateMany({
    where: { id, status: "PENDENTE" },
    data: { status: "RECUSADO", decididoEm: new Date(), decididoPorId: autor.id },
  });
  if (r.count === 0) return { ok: false, message: "Esta correção já foi decidida." };
  feito();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Diferença de recebimento
// ---------------------------------------------------------------------------

const DESFECHOS = ["COBRADO", "CREDITO", "ACEITO"] as const;

/** O pedido chegou diferente e alguém decidiu o que fazer: sai de Pendências. */
export async function resolverDivergencia(
  pedidoId: number,
  desfecho: (typeof DESFECHOS)[number],
  nota: string,
): Promise<Result> {
  const autor = await requireModule("compras");
  if (!DESFECHOS.includes(desfecho)) return { ok: false, message: "Escolha o que foi feito." };
  const texto = nota.trim().slice(0, 500);
  const r = await prisma.pedidoCompra.updateMany({
    where: { id: pedidoId, entregaConfirmada: true, divergenciaResolvidaEm: null },
    data: {
      divergenciaResolvidaEm: new Date(),
      divergenciaDesfecho: desfecho,
      divergenciaNota: texto === "" ? null : texto,
      divergenciaResolvidaPorId: autor.id,
    },
  });
  if (r.count === 0) return { ok: false, message: "Este pedido já foi resolvido." };
  // O aviso da entrega com diferença acompanha: resolvido junto.
  await prisma.avisoCompra.updateMany({
    where: { pedidoId, tipo: "RECEBIDO_COM_DIFERENCA", resolvidoEm: null },
    data: { resolvidoEm: new Date() },
  });
  feito();
  return { ok: true };
}

/** O crédito combinado foi abatido num pedido seguinte: sai de Pendências. */
export async function marcarCreditoAbatido(pedidoId: number): Promise<Result> {
  const autor = await requireModule("compras");
  const r = await prisma.pedidoCompra.updateMany({
    where: { id: pedidoId, divergenciaDesfecho: "CREDITO", creditoAbatidoEm: null },
    data: { creditoAbatidoEm: new Date(), creditoAbatidoPorId: autor.id },
  });
  if (r.count === 0) return { ok: false, message: "Este crédito já foi marcado como abatido." };
  feito();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Avisos dos fornecedores
// ---------------------------------------------------------------------------

/** Um aviso visto. Tocar no link dele já conta como ver. */
export async function marcarAvisoLido(id: number): Promise<Result> {
  await requireModule("compras");
  if (!Number.isInteger(id)) return { ok: false, message: "Aviso inválido." };
  await prisma.avisoCompra.updateMany({ where: { id, lidoEm: null }, data: { lidoEm: new Date() } });
  feito();
  return { ok: true };
}

/** Todos os avisos vistos de uma vez. */
export async function marcarTodosAvisosLidos(): Promise<Result> {
  await requireModule("compras");
  await prisma.avisoCompra.updateMany({ where: { lidoEm: null }, data: { lidoEm: new Date() } });
  feito();
  return { ok: true };
}

/**
 * "Já resolvi": a falta foi coberta (comprou de outro, o fornecedor achou o
 * item, ou não precisa mais). Sai da faixa "Agora" e do número do menu, e
 * fica na linha do tempo como resolvido. Resolver é também ter visto.
 */
export async function resolverAviso(id: number): Promise<Result> {
  await requireModule("compras");
  if (!Number.isInteger(id)) return { ok: false, message: "Aviso inválido." };
  const agora = new Date();
  const r = await prisma.avisoCompra.updateMany({
    where: { id, resolvidoEm: null },
    data: { resolvidoEm: agora, lidoEm: agora },
  });
  if (r.count === 0) return { ok: false, message: "Este aviso já foi resolvido." };
  feito();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cadastros
// ---------------------------------------------------------------------------

/** O estoque ideal de um produto — sem ele, o produto nunca é sugerido. */
export async function definirEstoqueIdeal(produtoId: number, texto: string): Promise<Result> {
  await requireModule("compras");
  const n = lerNumeroBR(texto);
  if (n === null || !Number.isFinite(n) || n < 0 || n > 999999) {
    return { ok: false, message: "Digite um número." };
  }
  await prisma.product.update({ where: { id: produtoId }, data: { idealStock: new Prisma.Decimal(n) } });
  feito();
  return { ok: true };
}

export async function definirCodigo(produtoId: number, texto: string): Promise<Result> {
  await requireModule("compras");
  const code = texto.trim().slice(0, 40);
  if (code === "") return { ok: false, message: "Digite o código." };
  try {
    await prisma.product.update({ where: { id: produtoId }, data: { code } });
  } catch (err) {
    if (ehRepetido(err)) return { ok: false, message: `O código ${code} já é de outro produto.` };
    throw err;
  }
  feito();
  return { ok: true };
}

/** Liga ou desliga uma categoria que o fornecedor atende. */
export async function alternarCategoriaDoFornecedor(
  fornecedorId: number,
  categoryId: number,
): Promise<Result> {
  await requireModule("compras");
  const chave = { supplierId_categoryId: { supplierId: fornecedorId, categoryId } };
  const tem = await prisma.supplierCategory.findUnique({ where: chave, select: { supplierId: true } });
  if (tem) await prisma.supplierCategory.delete({ where: chave });
  else await prisma.supplierCategory.create({ data: { supplierId: fornecedorId, categoryId } });
  feito();
  return { ok: true };
}

/** Em quantos dias o fornecedor entrega — vira a data prevista dos pedidos dele. */
export async function definirPrazoDoFornecedor(fornecedorId: number, texto: string): Promise<Result> {
  await requireModule("compras");
  const n = lerNumeroBR(texto);
  if (n === null || !Number.isInteger(n) || n < 0 || n > 365) {
    return { ok: false, message: "Digite os dias, em número inteiro." };
  }
  await prisma.supplier.update({ where: { id: fornecedorId }, data: { deliveryDays: n } });
  feito();
  return { ok: true };
}
