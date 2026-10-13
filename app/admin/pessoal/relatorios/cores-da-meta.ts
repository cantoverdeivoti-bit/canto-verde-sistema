import type { SituacaoDaMeta } from "@/lib/cmo";

/** As cores e o texto de cada situação diante da meta do CMO. */
export const COR_DA_META: Record<SituacaoDaMeta, { cor: string; fundo: string; texto: string }> = {
  dentro: { cor: "var(--ok-strong)", fundo: "var(--ok-soft)", texto: "dentro da meta" },
  perto: { cor: "var(--warn)", fundo: "var(--warn-soft)", texto: "pouco acima da meta" },
  acima: { cor: "var(--destructive)", fundo: "var(--danger-soft)", texto: "acima da meta" },
};
