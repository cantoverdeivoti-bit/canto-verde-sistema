"use server";

import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth-guard";
import { bonificacaoPorExtenso, eMercadoria } from "@/lib/bonificacoes";
import { prisma } from "@/lib/db";
import { lerNumeroBR } from "@/lib/format";
import { bonificacaoSchema } from "@/lib/validations";
import { Prisma } from "@/generated/prisma/client";

type Result = { ok: boolean; message?: string };

function primeiroErro(e: { issues: { message: string }[] }) {
  return e.issues[0]?.message ?? "Dados inválidos.";
}

function feito(cotacaoId?: number | null, pedidoId?: number | null) {
  if (cotacaoId) revalidatePath(`/admin/compras/cotacao/${cotacaoId}`);
  if (pedidoId) revalidatePath(`/admin/compras/pedidos/${pedidoId}`);
  revalidatePath("/admin/compras/pedidos");
  revalidatePath("/admin/compras/recebimentos");
  revalidatePath("/admin/compras/pendencias");
}

/**
 * Por que este pedido não aceita mais mexer na bonificação, ou nulo se
 * aceita. Diferente dos itens, pedido de cotação aceita: a bonificação não
 * mexe em item nem em preço. O que trava é o pedido já recebido ou cancelado
 * — aí o que veio já foi conferido.
 */
async function pedidoTravado(pedidoId: number): Promise<string | null> {
  const p = await prisma.pedidoCompra.findUnique({
    where: { id: pedidoId },
    select: { entregaConfirmada: true, estatus: true },
  });
  if (!p) return "Pedido não encontrado.";
  if (p.estatus === "CANCELADO") return "Este pedido foi cancelado.";
  if (p.entregaConfirmada) return "Este pedido já foi recebido.";
  return null;
}

/**
 * Combina uma bonificação: na cotação (para um fornecedor, antes do pedido)
 * ou direto num pedido. Na cotação, se o pedido daquele fornecedor já
 * existe, ela vai direto para o pedido — é onde o recebimento vai procurar.
 */
export async function acrescentarBonificacao(raw: unknown): Promise<Result> {
  const autor = await requireModule("compras");
  const parsed = bonificacaoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const v = parsed.data;
  const mercadoria = eMercadoria(v.tipo);

  let fornecedorId = v.fornecedorId;
  let pedidoCompraId = v.pedidoCompraId;
  let cotacaoId = v.cotacaoId;

  if (pedidoCompraId !== null) {
    const travado = await pedidoTravado(pedidoCompraId);
    if (travado) return { ok: false, message: travado };
    const p = await prisma.pedidoCompra.findUniqueOrThrow({
      where: { id: pedidoCompraId },
      select: { fornecedorId: true, cotacaoId: true },
    });
    fornecedorId = p.fornecedorId;
    cotacaoId = p.cotacaoId;
  } else if (cotacaoId !== null && fornecedorId !== null) {
    const pedido = await prisma.pedidoCompra.findFirst({
      where: { cotacaoId, fornecedorId, estatus: { not: "CANCELADO" } },
      select: { id: true },
    });
    if (pedido) {
      const travado = await pedidoTravado(pedido.id);
      if (travado) return { ok: false, message: travado };
      pedidoCompraId = pedido.id;
    }
  }

  await prisma.bonificacao.create({
    data: {
      fornecedorId: fornecedorId!,
      cotacaoId,
      pedidoCompraId,
      tipo: v.tipo,
      produtoId: mercadoria ? v.produtoId : null,
      quantidade: mercadoria ? new Prisma.Decimal(v.quantidade!) : null,
      valor: mercadoria ? null : new Prisma.Decimal(v.valor!),
      nota: v.nota,
      criadoPorId: autor.id,
    },
  });
  feito(cotacaoId, pedidoCompraId);
  return { ok: true };
}

/** Desfaz uma bonificação combinada, enquanto o pedido não foi recebido. */
export async function tirarBonificacao(id: number): Promise<Result> {
  await requireModule("compras");
  const b = await prisma.bonificacao.findUnique({
    where: { id },
    select: { estado: true, pedidoCompraId: true, cotacaoId: true },
  });
  if (!b) return { ok: false, message: "Bonificação não encontrada." };
  if (b.estado !== "COMBINADA") return { ok: false, message: "Esta bonificação já foi conferida." };
  if (b.pedidoCompraId !== null) {
    const travado = await pedidoTravado(b.pedidoCompraId);
    if (travado) return { ok: false, message: travado };
  }
  await prisma.bonificacao.delete({ where: { id } });
  feito(b.cotacaoId, b.pedidoCompraId);
  return { ok: true };
}

/**
 * O que fazer com a bonificação que não veio:
 * - CHEGOU: veio depois. Mercadoria soma no estoque (sem histórico de preço).
 * - CREDITO: vira crédito para um próximo pedido, no valor dado.
 * - CANCELAR: deixa pra lá.
 */
export async function resolverBonificacao(
  id: number,
  acao: "CHEGOU" | "CREDITO" | "CANCELAR",
  valorTexto?: string,
): Promise<Result> {
  const autor = await requireModule("compras");
  const b = await prisma.bonificacao.findUnique({
    where: { id },
    select: {
      estado: true,
      tipo: true,
      produtoId: true,
      quantidade: true,
      valor: true,
      nota: true,
      pedidoCompraId: true,
      cotacaoId: true,
      produto: { select: { name: true, unit: true } },
    },
  });
  if (!b || b.estado !== "NAO_VEIO") return { ok: false, message: "Esta bonificação já foi resolvida." };
  const agora = new Date();

  if (acao === "CANCELAR") {
    await prisma.bonificacao.updateMany({
      where: { id, estado: "NAO_VEIO" },
      data: { estado: "CANCELADA", resolvidaEm: agora, resolvidaPorId: autor.id },
    });
  } else if (acao === "CREDITO") {
    const valor = lerNumeroBR(valorTexto ?? "");
    if (valor === null || !Number.isFinite(valor) || valor <= 0) return { ok: false, message: "Digite o valor do crédito." };
    await prisma.bonificacao.updateMany({
      where: { id, estado: "NAO_VEIO" },
      data: {
        tipo: "CREDITO",
        valor: new Prisma.Decimal(Math.round(valor * 100) / 100),
        estado: "COMBINADA",
        // O que ela era, para o crédito não virar um valor sem história.
        nota: [
          `no lugar de ${bonificacaoPorExtenso({
            tipo: b.tipo,
            produto: b.produto ? { nome: b.produto.name, unidade: b.produto.unit } : null,
            quantidade: b.quantidade?.toNumber() ?? null,
            valor: b.valor?.toNumber() ?? null,
          })}`,
          b.nota,
        ]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 300),
        resolvidaEm: agora,
        resolvidaPorId: autor.id,
      },
    });
  } else {
    const r = await prisma.$transaction(async (tx) => {
      const marcou = await tx.bonificacao.updateMany({
        where: { id, estado: "NAO_VEIO" },
        data: {
          estado: "RECEBIDA",
          quantidadeRecebida: b.quantidade,
          // O cancelamento do pedido desfaz o que ela mesma somou.
          estoqueSomado: eMercadoria(b.tipo),
          recebidaEm: agora,
          resolvidaEm: agora,
          resolvidaPorId: autor.id,
        },
      });
      if (marcou.count === 1 && eMercadoria(b.tipo) && b.produtoId && b.quantidade) {
        await tx.product.update({ where: { id: b.produtoId }, data: { currentStock: { increment: b.quantidade } } });
      }
      return marcou.count;
    });
    if (r === 0) return { ok: false, message: "Esta bonificação já foi resolvida." };
  }
  feito(b.cotacaoId, b.pedidoCompraId);
  return { ok: true };
}

/** O crédito de bonificação foi usado num pedido: sai de "Créditos a receber". */
export async function abaterCreditoDeBonificacao(id: number): Promise<Result> {
  const autor = await requireModule("compras");
  const r = await prisma.bonificacao.updateMany({
    where: { id, tipo: "CREDITO", estado: "COMBINADA" },
    data: { estado: "ABATIDA", resolvidaEm: new Date(), resolvidaPorId: autor.id },
  });
  if (r.count === 0) return { ok: false, message: "Este crédito já foi marcado como abatido." };
  feito();
  return { ok: true };
}
