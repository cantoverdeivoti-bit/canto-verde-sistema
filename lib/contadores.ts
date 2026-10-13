import { unstable_cache, updateTag } from "next/cache";
import { cache } from "react";

import { todayInTimezone } from "@/lib/availability";
import { ATUALIZACAO_ESPERANDO } from "@/lib/convites-colaborador";
import { prisma } from "@/lib/db";
import { FUSO_DA_CASA } from "@/lib/format";
import { contarDecisoes } from "@/lib/pendencias";
import { prazosDoPessoal } from "@/lib/prazos-do-banco";

/**
 * Os números do menu e da página inicial: decisões de Compras, cadastros
 * esperando aprovação e avisos que pedem ação.
 *
 * Contá-los são nove consultas, e o menu aparece em toda tela. Guardados por
 * 15 segundos entre uma abertura e outra, viram uma ida ao banco a cada 15
 * segundos para a casa toda, e não nove por toque. O número pode ficar esses
 * segundos atrasado; as ações que mais mexem nele (decidir uma pendência,
 * aprovar um cadastro) limpam o cache na hora com `limparContadores`.
 *
 * Contados para todos os módulos: quem não entra em um deles simplesmente
 * não vê aquele número (o layout pergunta a permissão).
 */
export type ContadoresDaCasa = {
  decisoes: number;
  cadastrosPendentes: number;
  pedemAcao: number;
  sugestoesBuffet: number;
  treinamentosPendentes: number;
};

export const TAG_CONTADORES = "contadores-do-menu";

async function contar(): Promise<ContadoresDaCasa> {
  const [decisoes, cadastrosPendentes, pedemAcao, sugestoesBuffet, treinamentosPendentes] = await Promise.all([
    contarDecisoes(),
    // Cadastros novos e atualizações de cadastro esperando aprovação, e os
    // prazos que vencem (experiência, ASO, férias, EPI): tudo em Pendências.
    Promise.all([
      prisma.colaborador.count({ where: { pendente: true } }),
      prisma.conviteColaborador.count({ where: ATUALIZACAO_ESPERANDO }),
      // Quem está sem ASO registrado conta como um só aviso, como a tela mostra.
      prazosDoPessoal(todayInTimezone(FUSO_DA_CASA)).then((p) => p.filter((x) => !x.semData).length + (p.some((x) => x.semData) ? 1 : 0)),
    ]).then(([novos, atualizacoes, prazos]) => novos + atualizacoes + prazos),
    prisma.avisoCompra.count({ where: { pedeAcao: true, resolvidoEm: null } }),
    // As mudanças do buffet esperando quem configura aprovar.
    prisma.sugestaoBuffet.count({ where: { status: "PENDENTE" } }),
    // Operacional: processo obrigatório da função em que a pessoa ainda não foi treinada.
    prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n
        FROM "colaboradores" c
        JOIN "operacional_obrigatorios" o ON o."funcaoId" = c."funcaoId"
        JOIN "operacional_processos" p ON p.id = o."processoId" AND p.ativo
       WHERE c.ativo AND NOT c.pendente
         AND NOT EXISTS (SELECT 1 FROM "operacional_treinamentos" t WHERE t."colaboradorId" = c.id AND t."processoId" = o."processoId")`.then(
      (r) => Number(r[0]?.n ?? 0),
    ),
  ]);
  return { decisoes, cadastrosPendentes, pedemAcao, sugestoesBuffet, treinamentosPendentes };
}

const guardados = unstable_cache(contar, ["contadores-do-menu"], { tags: [TAG_CONTADORES], revalidate: 15 });

/** Uma leitura por requisição; fora do Next (scripts), direto do banco. */
export const contadoresDaCasa = cache(async (): Promise<ContadoresDaCasa> => {
  try {
    return await guardados();
  } catch {
    return contar();
  }
});

/**
 * Limpa os números guardados: chamada pelas ações que mudam uma pendência.
 * Só vale dentro de uma ação; fora dela (um script), não faz nada, e o
 * número se acerta sozinho em 15 segundos.
 */
export function limparContadores() {
  try {
    updateTag(TAG_CONTADORES);
  } catch {}
}
