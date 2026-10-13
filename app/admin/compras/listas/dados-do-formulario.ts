import { prisma } from "@/lib/db";
import { produtosParaPedido } from "@/lib/produtos-para-pedido";

import type { FornecedorDaRotina, ProdutoDaRotina } from "./formulario-do-dia";

/**
 * O que o formulário de um dia precisa: os fornecedores ativos com os dias e
 * os produtos que cada um já tem, e o catálogo para a busca de produto.
 */
export async function dadosDoFormulario(): Promise<{ fornecedores: FornecedorDaRotina[]; produtos: ProdutoDaRotina[] }> {
  const [fornecedores, listas, produtos] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true, apelido: true },
      orderBy: { name: "asc" },
    }),
    prisma.listaCompra.findMany({
      select: { id: true, fornecedorId: true, diaSemana: true, itens: { select: { produtoId: true } } },
    }),
    produtosParaPedido(),
  ]);
  return {
    fornecedores: fornecedores.map((f) => {
      const dele = listas.filter((l) => l.fornecedorId === f.id);
      return {
        id: f.id,
        nome: f.apelido ?? f.name,
        dias: dele.map((l) => ({ dia: l.diaSemana, listaId: l.id })),
        produtoIds: [...new Set(dele.flatMap((l) => l.itens.map((i) => i.produtoId)))],
      };
    }),
    produtos,
  };
}
