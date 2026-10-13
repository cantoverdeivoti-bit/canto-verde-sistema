import type { EstadoColuna } from "@/generated/prisma/client";

import { podeNascerEm, type TarefaEmMovimento } from "@/lib/tarefas-fluxo";

/**
 * Subtarefas e cópias, sem Prisma e sem banco.
 *
 * Mesma razão de `lib/tarefas-fluxo.ts`: a tela precisa esconder "Adicionar
 * subtarefa" no terceiro nível e a ação precisa recusar o quarto, e as duas
 * têm de perguntar à mesma tabela. Escrita aqui, a regra se testa em meio
 * segundo em `scripts/test-tarefas-menu.ts`, sem conexão nenhuma.
 */

/**
 * Três níveis, e não os cinco do TickTick (RF-034).
 *
 * Tarefa, subtarefa e a subtarefa dela. Abaixo disso o quadro vira labirinto:
 * ninguém lembra onde está a coisa, e a tarefa de cima nunca fecha porque
 * sempre há um neto esquecido lá embaixo.
 */
export const NIVEL_MAXIMO = 3;

/** O nível de quem nasce embaixo de uma tarefa deste nível. */
export function nivelDaFilha(nivelDoPai: number): number {
  return nivelDoPai + 1;
}

/** Esta tarefa ainda aceita uma subtarefa embaixo dela? */
export function podeTerFilha(nivel: number): boolean {
  return nivelDaFilha(nivel) <= NIVEL_MAXIMO;
}

export type Veredito = { ok: true } | { ok: false; motivo: string };

/**
 * Pendurar uma tarefa que já existe embaixo de outra.
 *
 * `alturaDaTarefa` é quantos níveis ela ocupa contando a si mesma: 1 se não
 * tem filha, 2 se tem filha, 3 se tem neta. É o que decide se a árvore inteira
 * cabe embaixo do pai novo, e não só a tarefa — mover uma tarefa com neta para
 * baixo de uma subtarefa criaria o quarto nível pela porta dos fundos.
 *
 * `paiEhDescendente` fecha o ciclo: pendurar a tarefa embaixo da própria
 * filha faria uma volta sem fim, e a tarefa sumiria do quadro sem ter sido
 * excluída. Quem calcula é a ação, que tem o banco; aqui só a decisão.
 */
export function podeVincular(c: {
  mesmaTarefa: boolean;
  mesmoProjeto: boolean;
  paiEhDescendente: boolean;
  paiAberto: boolean;
  nivelDoPai: number;
  alturaDaTarefa: number;
}): Veredito {
  if (c.mesmaTarefa) return { ok: false, motivo: "Uma tarefa não pode ser pai dela mesma." };
  if (!c.mesmoProjeto) {
    return { ok: false, motivo: "A tarefa pai tem de ser do mesmo quadro." };
  }
  if (c.paiEhDescendente) {
    return {
      ok: false,
      motivo: "Essa tarefa já está embaixo desta. Pendurar uma na outra daria uma volta sem fim.",
    };
  }
  if (!c.paiAberto) {
    return { ok: false, motivo: "A tarefa pai está concluída ou cancelada. Reabra antes." };
  }
  if (c.nivelDoPai + c.alturaDaTarefa > NIVEL_MAXIMO) {
    return {
      ok: false,
      motivo: `Passaria de ${NIVEL_MAXIMO} níveis. Escolha uma tarefa pai mais acima.`,
    };
  }
  return { ok: true };
}

/**
 * Onde nasce a tarefa que vem de outra: a cópia, e a subtarefa.
 *
 * Na coluna de referência (a da original, a do pai) quando a coluna deixa
 * nascer: duplicar é "outra igual a esta", e igual inclui o lugar; a
 * subtarefa começa onde o pai está. Mas AGUARDANDO pede o que se espera,
 * DOCUMENTADO pede o documento, ROTINA pede a recorrência, e a tarefa nova não
 * traz nada disso (seria copiar a espera de outra). Aí ela nasce na primeira
 * coluna de entrada do quadro, que aceita tudo.
 *
 * CONCLUÍDO também manda para a entrada: a cópia de uma tarefa feita é
 * trabalho por fazer, e nascer concluída seria um "feito" que ninguém fez.
 *
 * `colunas` já vem na ordem do quadro e sem as ocultas. Nulo = o quadro não
 * tem coluna que aceite, e a ação diz isso em vez de inventar.
 */
export function colunaParaNascer<C extends { id: number; estado: EstadoColuna }>(
  referencia: C,
  colunas: C[],
  cartao: TarefaEmMovimento,
): C | null {
  if (
    referencia.estado !== "CONCLUIDO" &&
    podeNascerEm(referencia.estado, cartao).ok &&
    colunas.some((c) => c.id === referencia.id)
  ) {
    return referencia;
  }
  return (
    colunas.find((c) => c.estado === "ENTRADA") ??
    colunas.find((c) => c.estado !== "CONCLUIDO" && podeNascerEm(c.estado, cartao).ok) ??
    null
  );
}
