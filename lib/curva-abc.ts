export type ClasseABC = "A" | "B" | "C";

/**
 * Acima disto, sobre o último custo, o preço cotado de um item A ou B pede
 * atenção: marca na cotação e conta no aviso de resposta.
 */
export const LIMITE_DE_ALTA = 0.1;

/** Até onde vai cada classe, em % do gasto acumulado. */
export const LIMITES_ABC = { A: 80, B: 95 } as const;

/**
 * A curva ABC pelo valor gasto.
 *
 * Ordena do maior para o menor e acumula. A classe de cada produto sai do
 * acumulado ANTES dele: o primeiro é sempre A, mesmo que sozinho passe de
 * 80% — ele é justamente o produto que mais pesa. A = até 80% do dinheiro,
 * B = até 95%, C = o resto, que costuma ser muito produto e pouco dinheiro.
 */
export function curvaABC<T extends { valor: number }>(
  itens: T[],
): (T & { classe: ClasseABC; pct: number; acumulado: number })[] {
  const total = itens.reduce((s, i) => s + i.valor, 0);
  if (total <= 0) return [];
  let acumulado = 0;
  return [...itens]
    .filter((i) => i.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .map((i) => {
      const antes = acumulado;
      const pct = (i.valor / total) * 100;
      acumulado += pct;
      const classe: ClasseABC = antes < LIMITES_ABC.A ? "A" : antes < LIMITES_ABC.B ? "B" : "C";
      return { ...i, classe, pct, acumulado };
    });
}
