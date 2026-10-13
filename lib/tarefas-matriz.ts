import type { PrioridadeTarefa } from "@/generated/prisma/client";

/**
 * Em que quadrante da matriz de Eisenhower a tarefa cai.
 *
 * O TickTick monta os quadrantes só pela prioridade: alta vira "urgente e
 * importante", média vira "importante", e por aí. Isso não é uma matriz — é a
 * lista de prioridades desenhada em quatro caixas, e as duas perguntas viram
 * uma só.
 *
 * Aqui os eixos são coisas diferentes, porque a tarefa tem as duas:
 *
 *   IMPORTANTE  é a prioridade que alguém escolheu — alta ou média.
 *   URGENTE     é o relógio: atrasada, vence hoje ou vence amanhã.
 *
 * É o que faz o quadrante "Agora" ser o que ele promete — o que é grave E está
 * estourando — em vez de "tudo que alguém marcou de vermelho".
 *
 * Puro e sem banco, como `lib/tarefas-fluxo.ts`, pelo mesmo motivo: é uma
 * tabela de decisão, e tabela de decisão se confere sem servidor. O teste vive
 * em `scripts/test-tarefas-fluxo.ts`.
 */

export type Quadrante = "agora" | "planeje" | "tireDaFrente" | "reveja";

/**
 * A janela do "urgente" é curta de propósito: hoje, amanhã, ou já passou.
 *
 * Esticar para a semana encheria o quadrante de cima — que é exatamente como
 * uma matriz volta a ser uma lista ordenada por data. Urgente tem de doer.
 */
export function ehUrgente(prazo: { texto: string; atrasada: boolean } | null): boolean {
  if (prazo === null) return false;
  return prazo.atrasada || prazo.texto === "amanhã" || prazo.texto.startsWith("hoje");
}

/** Importante é o que alguém decidiu que era: prioridade alta ou média. */
export function ehImportante(prioridade: PrioridadeTarefa): boolean {
  return prioridade === "ALTA" || prioridade === "MEDIA";
}

export function quadranteDe(
  prioridade: PrioridadeTarefa,
  prazo: { texto: string; atrasada: boolean } | null,
): Quadrante {
  const urgente = ehUrgente(prazo);
  const importante = ehImportante(prioridade);
  if (urgente) return importante ? "agora" : "tireDaFrente";
  return importante ? "planeje" : "reveja";
}
