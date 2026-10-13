import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { produtosParaPedido } from "@/lib/produtos-para-pedido";

import { LerNota } from "./ler-nota";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nota do mercado — Compras" };

/**
 * A compra de mercado pelo QR Code do cupom fiscal: a câmera lê a nota, os
 * itens vêm sozinhos, e quem comprou só vincula cada um a um produto da
 * casa. A entrada é uma compra no balcão, como em "Chegou sem pedido".
 *
 * Mesma porta de Recebimentos: abre também pelo link de atalhos.
 */
export default async function NotaDoMercadoPage() {
  await guardModule("compras", { atalho: true });

  const [produtos, categorias] = await Promise.all([
    produtosParaPedido(),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Nota do mercado" voltar={{ href: "/admin/compras/recebimentos", texto: "Receber pedidos" }} />
      <LerNota produtos={produtos} categorias={categorias} />
    </Pagina>
  );
}
