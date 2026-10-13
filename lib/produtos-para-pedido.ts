import { prisma } from "@/lib/db";
import type { ProductUnit } from "@/generated/prisma/client";

export type ProdutoComFornecedores = {
  id: number;
  nome: string;
  unidade: ProductUnit;
  lote: number | null;
  /** Quem vende: ligado no cadastro, exclusivo, ou atende a categoria dele. */
  fornecedorIds: number[];
};

/**
 * Os produtos ativos, cada um com quem o vende — as mesmas três redes que a
 * cotação usa para decidir quem chamar: o vínculo item a item, o exclusivo,
 * e a categoria que o fornecedor atende.
 *
 * Três consultas para a lista inteira, e não uma por produto: são trezentos e
 * poucos itens, e a tela precisa de todos para a busca responder na hora.
 */
export async function produtosParaPedido(): Promise<ProdutoComFornecedores[]> {
  const [produtos, vinculos, categorias] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        unit: true,
        lotSize: true,
        categoryId: true,
        exclusiveSupplierId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.productSupplier.findMany({ select: { productId: true, supplierId: true } }),
    prisma.supplierCategory.findMany({ select: { categoryId: true, supplierId: true } }),
  ]);

  const porProduto = new Map<number, Set<number>>();
  for (const v of vinculos) {
    if (!porProduto.has(v.productId)) porProduto.set(v.productId, new Set());
    porProduto.get(v.productId)!.add(v.supplierId);
  }
  const porCategoria = new Map<number, number[]>();
  for (const c of categorias) {
    if (!porCategoria.has(c.categoryId)) porCategoria.set(c.categoryId, []);
    porCategoria.get(c.categoryId)!.push(c.supplierId);
  }

  return produtos.map((p) => {
    const ids = new Set(porProduto.get(p.id) ?? []);
    if (p.exclusiveSupplierId !== null) ids.add(p.exclusiveSupplierId);
    if (p.categoryId !== null) for (const s of porCategoria.get(p.categoryId) ?? []) ids.add(s);
    return {
      id: p.id,
      nome: p.name,
      unidade: p.unit,
      lote: p.lotSize === null ? null : p.lotSize.toNumber(),
      fornecedorIds: [...ids],
    };
  });
}
