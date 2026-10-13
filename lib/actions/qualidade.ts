"use server";

import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { lerQualidadeDoProduto, type QualidadeDoProduto } from "@/lib/qualidade";
import { erroDaNota } from "@/lib/qualidade-regra";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

/** As médias e as últimas entregas avaliadas, para o painel do produto. */
export async function qualidadeDoProduto(produtoId: number): Promise<Result<QualidadeDoProduto>> {
  await requireModule("compras");
  if (!Number.isInteger(produtoId)) return { ok: false, message: "Produto inválido." };
  return { ok: true, data: await lerQualidadeDoProduto(produtoId) };
}

/**
 * A nota do dono para uma entrega já recebida. Refazer substitui a dele —
 * a de quem recebeu fica como estava.
 *
 * Fora do link de atalhos: é a opinião de quem manda na compra, e não uma
 * etapa da conferência.
 */
export async function avaliarComoDono(
  pedidoCompraItemId: number,
  nota: number,
  comentario: string,
): Promise<Result<null>> {
  const autor = await requireModule("compras");
  if (!Number.isInteger(pedidoCompraItemId)) return { ok: false, message: "Entrega inválida." };

  const item = await prisma.pedidoCompraItem.findUnique({
    where: { id: pedidoCompraItemId },
    select: {
      produtoId: true,
      marca: true,
      quantidadeRecebida: true,
      produto: { select: { name: true } },
      pedidoCompra: { select: { fornecedorId: true, entregaConfirmada: true } },
    },
  });
  if (!item) return { ok: false, message: "Entrega não encontrada." };
  if (!item.pedidoCompra.entregaConfirmada || !item.quantidadeRecebida?.greaterThan(0)) {
    return { ok: false, message: "Só dá para avaliar o que chegou." };
  }
  const erro = erroDaNota(nota, comentario, item.produto.name);
  if (erro) return { ok: false, message: erro };

  const texto = comentario.trim();
  try {
    await prisma.avaliacaoQualidade.upsert({
      where: { pedidoCompraItemId_origem: { pedidoCompraItemId, origem: "DONO" } },
      create: {
        produtoId: item.produtoId,
        pedidoCompraItemId,
        fornecedorId: item.pedidoCompra.fornecedorId,
        marca: item.marca,
        origem: "DONO",
        nota,
        comentario: texto === "" ? null : texto,
        autorId: autor.id,
      },
      update: { nota, comentario: texto === "" ? null : texto, autorId: autor.id },
    });
  } catch (err) {
    console.error("[avaliarComoDono] falha:", err);
    return { ok: false, message: "Não foi possível gravar a nota." };
  }

  revalidatePath("/admin/compras", "layout");
  return { ok: true, data: null };
}
