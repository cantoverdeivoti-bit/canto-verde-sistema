/**
 * A regra das estrelas de qualidade — pura, sem banco, para a tela e o
 * servidor dizerem a mesma coisa.
 */

/** Com até esta nota, o comentário é obrigatório: nota baixa sem motivo não ensina nada. */
export const NOTA_QUE_PEDE_MOTIVO = 2;

export const COMENTARIO_MAX = 300;

/** Null quando está certo; senão, o que falta, na fala da casa. */
export function erroDaNota(nota: number | null | undefined, comentario: string, produto: string): string | null {
  if (nota === null || nota === undefined) return `Dê as estrelas de ${produto}.`;
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) return `A nota de ${produto} vai de 1 a 5 estrelas.`;
  const texto = comentario.trim();
  if (nota <= NOTA_QUE_PEDE_MOTIVO && texto === "") {
    return `${produto}: com ${nota} ${nota === 1 ? "estrela" : "estrelas"}, diga o porquê.`;
  }
  if (texto.length > COMENTARIO_MAX) return `O comentário de ${produto} passou de ${COMENTARIO_MAX} letras.`;
  return null;
}

/**
 * A marca como chave de média: sem espaço nas pontas e sem maiúscula, para
 * "Leke" e "leke " serem a mesma marca. Sem marca é um grupo também.
 */
export function chaveDaMarca(marca: string | null | undefined): string {
  const m = (marca ?? "").trim().toLowerCase();
  return m === "" ? "sem marca" : m;
}

export type Media = { media: number; n: number };

/** A média com uma casa, como a tela mostra: 4,2. */
export function arredondaMedia(soma: number, n: number): number {
  return n === 0 ? 0 : Math.round((soma / n) * 10) / 10;
}
