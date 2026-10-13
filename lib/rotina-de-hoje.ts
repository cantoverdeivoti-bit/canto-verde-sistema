import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { inicioDeHoje } from "@/lib/requisicao";

/** Onde está cada compra de rotina agora: a contagem aberta dela e o pedido de hoje. */
export type SituacaoDaRotina = {
  /** A contagem da lista em andamento (não finalizada, não cancelada, no prazo). */
  contagem: { token: string; feitos: number; total: number } | null;
  /** O pedido de hoje da lista, que nasceu da contagem dela ou foi feito à mão. */
  pedido: { id: number; enviado: boolean; itens: number } | null;
};

/** A rotina sem contagem aberta nem pedido hoje. */
export const SEM_SITUACAO: SituacaoDaRotina = { contagem: null, pedido: null };

/**
 * A situação de várias compras de rotina de uma vez, para a tela da lista,
 * "Rotinas de hoje" e "Contar estoque" dizerem o próximo passo de cada uma:
 * contar, continuar, mandar o pedido ou nada.
 *
 * Pelos ids, ou por um filtro das listas (ex.: as de hoje): pelo filtro, sai
 * junto com a busca das listas, sem esperar por ela. Aí o mapa só traz as que
 * têm alguma coisa; as outras são `SEM_SITUACAO`.
 */
export async function situacaoDasRotinas(
  listas: number[] | Prisma.ListaCompraWhereInput,
  timezone: string,
): Promise<Map<number, SituacaoDaRotina>> {
  const listaIds = Array.isArray(listas) ? listas : [];
  if (Array.isArray(listas) && listas.length === 0) return new Map();
  const daLista = Array.isArray(listas)
    ? { listaCompraId: { in: listaIds } }
    : Object.keys(listas).length === 0
      ? { listaCompraId: { not: null } } // todas as rotinas
      : { listaCompra: listas };
  const [contagens, pedidos] = await Promise.all([
    prisma.contagem.findMany({
      where: { ...daLista, concluida: false, canceladaEm: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: {
        listaCompraId: true,
        token: true,
        _count: { select: { itens: true } },
        itens: { where: { quantidadeContada: { not: null } }, select: { id: true } },
      },
    }),
    prisma.pedidoCompra.findMany({
      where: { ...daLista, createdAt: { gte: inicioDeHoje(timezone) }, estatus: { not: "CANCELADO" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, listaCompraId: true, estatus: true, _count: { select: { itens: true } } },
    }),
  ]);
  const situacao = new Map<number, SituacaoDaRotina>(listaIds.map((id) => [id, { contagem: null, pedido: null }]));
  // As listas vêm da mais nova para a mais velha: vale a primeira de cada.
  const de = (id: number) => situacao.get(id) ?? situacao.set(id, { contagem: null, pedido: null }).get(id)!;
  for (const c of contagens) {
    const s = de(c.listaCompraId!);
    s.contagem ??= { token: c.token, feitos: c.itens.length, total: c._count.itens };
  }
  for (const p of pedidos) {
    const s = de(p.listaCompraId!);
    s.pedido ??= { id: p.id, enviado: p.estatus !== "CRIADO", itens: p._count.itens };
  }
  return situacao;
}
