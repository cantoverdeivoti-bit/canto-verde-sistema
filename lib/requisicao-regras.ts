import { arredondarAoLote } from "@/lib/lote";

/**
 * As regras da compra de rotina, sem banco: quanto pedir. Mora à
 * parte de `lib/requisicao.ts` para o teste rodar sem banco.
 */

/**
 * Quanto pedir, pura: ideal − contado, arredondado ao lote. Nulo quando não
 * há o que pedir (sem ideal, sem contagem, já no ideal, ou falta menos de meio
 * lote) — o motivo vai junto, para a tela dizer por que a linha está vazia.
 */
export function sugeridoNaRequisicao(
  ideal: number | null,
  contado: number | null,
  lote: number | null,
): { quantidade: number | null; motivo: "sem-ideal" | "nao-contado" | "no-ideal" | "meio-lote" | null } {
  if (ideal === null) return { quantidade: null, motivo: "sem-ideal" };
  if (contado === null) return { quantidade: null, motivo: "nao-contado" };
  const faltando = Math.round((ideal - contado) * 1000) / 1000;
  if (faltando <= 0) return { quantidade: null, motivo: "no-ideal" };
  const pedir = arredondarAoLote(faltando, lote);
  if (pedir <= 0) return { quantidade: null, motivo: "meio-lote" };
  return { quantidade: pedir, motivo: null };
}

