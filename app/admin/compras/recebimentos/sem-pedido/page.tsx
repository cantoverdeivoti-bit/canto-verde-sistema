import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { bonificacaoPorExtenso } from "@/lib/bonificacoes";
import { prisma } from "@/lib/db";
import { produtosParaPedido } from "@/lib/produtos-para-pedido";

import { ChegouSemPedido } from "./chegou-sem-pedido";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chegou sem pedido — Compras" };

/**
 * A mercadoria que bate na porta sem pedido nenhum: brinde, troca, compra
 * feita na hora. Quem recebe diz de quem é, o que veio e por quê, e a entrada
 * vai para o estoque no mesmo toque.
 */
export default async function ChegouSemPedidoPage() {
  // Mesma porta de Recebimentos: liberada também pelo link de atalhos.
  await guardModule("compras", { atalho: true });

  const [fornecedores, produtos, categorias, bonificacoes] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true, apelido: true },
      orderBy: { name: "asc" },
    }),
    produtosParaPedido(),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    // As bonificações de mercadoria ainda por vir: a entrada pode ser uma delas.
    prisma.bonificacao.findMany({
      where: {
        tipo: { in: ["UNIDADES", "BRINDE"] },
        estado: { in: ["COMBINADA", "NAO_VEIO"] },
        pedidoCompra: { is: { estatus: { not: "CANCELADO" } } },
      },
      orderBy: { id: "asc" },
      select: {
        id: true,
        fornecedorId: true,
        pedidoCompraId: true,
        tipo: true,
        produtoId: true,
        quantidade: true,
        produto: { select: { name: true, unit: true } },
      },
    }),
  ]);

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Chegou sem pedido" voltar={{ href: "/admin/compras/recebimentos", texto: "Receber pedidos" }} />
      <ChegouSemPedido
        fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.apelido ?? f.name }))}
        produtos={produtos}
        categorias={categorias}
        bonificacoes={bonificacoes.map((b) => ({
          id: b.id,
          fornecedorId: b.fornecedorId,
          pedidoId: b.pedidoCompraId!,
          produtoId: b.produtoId!,
          quantidade: b.quantidade?.toNumber() ?? 0,
          texto: bonificacaoPorExtenso({
            tipo: b.tipo,
            produto: b.produto ? { nome: b.produto.name, unidade: b.produto.unit } : null,
            quantidade: b.quantidade?.toNumber() ?? null,
            valor: null,
          }),
        }))}
      />
    </Pagina>
  );
}
