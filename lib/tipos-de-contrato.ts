/**
 * Os três jeitos de trabalhar na casa, num lugar só: o nome em cada tamanho,
 * a cor do selo e a regra que separa quem ganha por mês de quem ganha por dia.
 */

import type { CSSProperties } from "react";

export type TipoContrato = "CLT" | "FIXO" | "FREELANCER";

/** Na ordem em que aparecem nos botões e nos filtros. */
export const TIPOS: TipoContrato[] = ["CLT", "FIXO", "FREELANCER"];

export const TIPO: Record<TipoContrato, { curto: string; longo: string; selo: CSSProperties }> = {
  CLT: { curto: "CLT", longo: "Carteira assinada", selo: { color: "var(--primary)" } },
  FIXO: { curto: "Fixo", longo: "Fixo sem registro", selo: { color: "var(--foreground)", background: "var(--muted)" } },
  FREELANCER: { curto: "Free", longo: "Free lancer", selo: { color: "var(--warn)", background: "var(--warn-soft)" } },
};

/**
 * CLT e fixo ganham por mês: têm salário, admissão, folga na escala e
 * férias. O free lancer ganha a diária do dia em que trabalha.
 */
export const porMes = (tipo: TipoContrato) => tipo !== "FREELANCER";

export const ehTipo = (v: unknown): v is TipoContrato => v === "CLT" || v === "FIXO" || v === "FREELANCER";
