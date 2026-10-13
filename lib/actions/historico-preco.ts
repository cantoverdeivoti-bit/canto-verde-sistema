"use server";

import { requireModule } from "@/lib/auth-guard";
import { getSettings } from "@/lib/availability";
import { precosDoProduto } from "@/lib/relatorios-compras";

export type CompraDoProduto = {
  dia: string;
  preco: number;
  /** Nulo = compra antiga, do sistema anterior. */
  fornecedor: string | null;
};

/**
 * As últimas compras de um produto, da mais nova para a mais antiga, para o
 * símbolo de histórico da lista de produtos. A data sai formatada no fuso da
 * casa, aqui no servidor — o relógio do navegador não é o de Ivoti.
 */
export async function ultimasComprasDoProduto(produtoId: number): Promise<CompraDoProduto[]> {
  await requireModule("compras");
  if (!Number.isInteger(produtoId)) return [];
  const { capacity } = await getSettings();
  const linhas = await precosDoProduto(produtoId);
  return linhas
    .slice(-8)
    .reverse()
    .map((l) => ({
      dia: l.data.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        timeZone: capacity.timezone,
      }),
      preco: l.preco,
      fornecedor: l.fornecedor,
    }));
}
