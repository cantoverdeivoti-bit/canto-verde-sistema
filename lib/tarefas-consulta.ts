import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/roles";
import { papelEfetivo } from "@/lib/tarefas-permissoes";
import type { Prisma } from "@/generated/prisma/client";

/**
 * "O que esta pessoa enxerga", numa consulta só.
 *
 * Três telas fazem a mesma pergunta de jeitos diferentes — a busca, a lista e
 * a matriz — e as três precisam da MESMA resposta sobre visibilidade. Escrever
 * o `where` em cada uma é como uma delas acaba mostrando um quadro privado que
 * as outras escondem, e ninguém descobre até ser tarde.
 *
 * Mora aqui pelo mesmo motivo que `lib/cotacao-fornecedores.ts` existe: o que
 * duas telas perguntam junto vira arquivo próprio.
 */

/**
 * Quadro privado só para membro (RF-054); quem é gestor em todo quadro vê
 * tudo (14.1). "Gestor em todo quadro" é o que `papelEfetivo` responde sem
 * olhar membro nenhum — dono, gerente e superusuário — e é lá que a lista
 * mora, para esta consulta não ter a sua própria.
 */
export function quadrosVisiveis(user: CurrentUser): Prisma.ProjetoWhereInput {
  if (papelEfetivo(user, null) === "GESTOR") return {};
  return {
    OR: [{ privado: false }, { membros: { some: { userId: user.id } } }],
  };
}

export type FiltroTarefas = {
  projetoId?: number | null;
  responsavelId?: number | null;
  /** Fechadas e canceladas ficam de fora por padrão. */
  incluirEncerradas?: boolean;
  /** Só o que já passou do prazo. */
  soAtrasadas?: boolean;
  /** Teto de linhas. A filtragem por texto acontece no navegador. */
  limite?: number;
};

/**
 * As tarefas que esta pessoa pode ver, já com o que as telas mostram.
 *
 * O texto NÃO é filtrado aqui. Quem procura "manutencao" sem acento está
 * procurando "Manutenção", e a régua que sabe disso é `chave()`, em
 * `lib/format.ts` — a mesma que a busca de produtos e a de fornecedores já
 * usam. Ela roda no navegador, sobre as linhas que voltarem daqui, e filtra a
 * cada tecla sem uma ida ao servidor.
 *
 * O preço disso é o teto: acima dele a tela avisa que está cortando, em vez de
 * mentir que achou tudo. Para o tamanho desta casa — a conta do TickTick tem
 * 729 tarefas — o teto nunca é alcançado no uso normal.
 */
export async function buscarTarefas(user: CurrentUser, filtro: FiltroTarefas = {}) {
  const agora = new Date();

  return prisma.tarefa.findMany({
    where: {
      excluidoEm: null,
      projeto: { arquivadoEm: null, ...quadrosVisiveis(user) },
      ...(filtro.projetoId ? { projetoId: filtro.projetoId } : {}),
      ...(filtro.responsavelId ? { responsavelId: filtro.responsavelId } : {}),
      ...(filtro.incluirEncerradas ? {} : { status: "ABERTA" as const }),
      ...(filtro.soAtrasadas ? { status: "ABERTA" as const, prazo: { lt: agora } } : {}),
    },
    // Sem prazo por último: quem não tem data não compete com quem tem.
    orderBy: [{ prazo: { sort: "asc", nulls: "last" } }, { id: "desc" }],
    take: filtro.limite ?? 500,
    include: {
      coluna: { select: { nome: true, estado: true } },
      projeto: { select: { id: true, nome: true } },
      responsavel: { select: { id: true, name: true, username: true } },
    },
  });
}
