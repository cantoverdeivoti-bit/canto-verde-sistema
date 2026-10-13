import { curvaABC, type ClasseABC } from "@/lib/curva-abc";
import { prisma } from "@/lib/db";

/**
 * A classe de cada produto na curva ABC do que a casa recebeu nos últimos
 * `dias` — o mesmo critério do painel de relatórios (valor recebido), num
 * mapa pronto para quem só quer perguntar "este item pesa?". Produto sem
 * compra no período não tem classe.
 */
export async function classesABC(dias = 90): Promise<Map<number, ClasseABC>> {
  const desde = new Date(Date.now() - dias * 86_400_000);
  const itens = await prisma.pedidoCompraItem.findMany({
    where: {
      quantidadeRecebida: { gt: 0 },
      pedidoCompra: { entregaConfirmada: true, estatus: { not: "CANCELADO" }, dataEntregaReal: { gte: desde } },
    },
    select: { produtoId: true, quantidadeRecebida: true, precoPago: true, precoUnitario: true },
  });
  const valor = new Map<number, number>();
  for (const i of itens) {
    const preco = (i.precoPago ?? i.precoUnitario)?.toNumber() ?? 0;
    valor.set(i.produtoId, (valor.get(i.produtoId) ?? 0) + preco * i.quantidadeRecebida!.toNumber());
  }
  return new Map(
    curvaABC([...valor].map(([produtoId, v]) => ({ produtoId, valor: v }))).map((l) => [l.produtoId, l.classe]),
  );
}
