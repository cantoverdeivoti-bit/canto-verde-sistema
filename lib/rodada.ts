import { prisma } from "@/lib/db";

/**
 * A chave de uma rodada: os ids das contagens, sem repetição e em ordem.
 * "29,27" e "27,29" são a mesma rodada — é por ela que o rascunho da
 * conferência é guardado e achado de volta.
 */
export function chaveDaRodada(contagemIds: number[]): string {
  return [...new Set(contagemIds)].sort((a, b) => a - b).join(",");
}

/**
 * A rodada de compra vista de fora: que contagens são, e quanto já virou
 * pedido direto.
 *
 * Quem precisa disso é a trilha de passos no alto das telas — ela só sabe
 * apagar o passo "Pedidos diretos" se souber que a rodada não gerou nenhum.
 * E duas telas precisam da MESMA resposta a partir de pontos de partida
 * diferentes: a lista de itens parte das contagens, a cotação parte de si
 * mesma.
 *
 * Fica aqui, e não dentro de cada página, porque a pergunta "quais contagens
 * fizeram esta cotação" tem uma resposta só — `Contagem.cotacaoId` — e
 * escrevê-la em dois lugares é como as duas telas passam a discordar sobre a
 * mesma semana.
 */

/**
 * Quantos pedidos diretos saíram destas contagens.
 *
 * Direto quer dizer nascido de contagem: `contagemId` preenchido. O pedido de
 * cotação tem `cotacaoId`, e o avulso não tem nem um nem outro — é por isso
 * que a conta é sobre `contagemId` e não sobre a ausência de cotação.
 */
export async function pedidosDiretosDe(contagemIds: number[]): Promise<number> {
  if (contagemIds.length === 0) return 0;
  return prisma.pedidoCompra.count({ where: { contagemId: { in: contagemIds } } });
}

/**
 * Estas contagens mais as que viraram compra junto com elas.
 *
 * O pedido direto guarda só a contagem mais nova da rodada, então o selo
 * "pedido direto" de uma contagem mais velha, filtrando por ela, não acharia
 * nada. `montarCotacao` marca todas as escolhidas com o mesmo `processadaEm`,
 * no mesmo instante — é esse carimbo que diz quem foi junto.
 */
export async function contagensDaRodada(contagemIds: number[]): Promise<number[]> {
  if (contagemIds.length === 0) return [];
  const carimbos = await prisma.contagem.findMany({
    where: { id: { in: contagemIds }, processadaEm: { not: null } },
    select: { processadaEm: true },
  });
  if (carimbos.length === 0) return contagemIds;
  const juntas = await prisma.contagem.findMany({
    where: { processadaEm: { in: carimbos.map((c) => c.processadaEm!) } },
    select: { id: true },
  });
  return [...new Set([...contagemIds, ...juntas.map((c) => c.id)])];
}

/** As contagens que fizeram esta cotação, e quantos diretos a rodada gerou. */
export async function rodadaDaCotacao(
  cotacaoId: number,
): Promise<{ contagemIds: number[]; pedidosDiretos: number }> {
  // As duas juntas: a contagem dos diretos filtra pela cotação por dentro, em
  // vez de esperar a lista de contagens para perguntar.
  const [contagens, pedidosDiretos] = await Promise.all([
    prisma.contagem.findMany({ where: { cotacaoId }, select: { id: true }, orderBy: { id: "asc" } }),
    prisma.pedidoCompra.count({ where: { contagem: { cotacaoId } } }),
  ]);
  return { contagemIds: contagens.map((c) => c.id), pedidosDiretos };
}

/** O que veio no `?c=` — "20,22" vira [20, 22]. Lixo some em silêncio. */
export function idsDaQuery(c: string | string[] | undefined): number[] {
  const bruto = Array.isArray(c) ? c.join(",") : (c ?? "");
  return [
    ...new Set(
      bruto
        .split(",")
        .map((p) => Number(p.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
}
