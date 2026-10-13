import { FUSO_DA_CASA } from "@/lib/format";

/**
 * "versão c579e72 · 08/10 17:05" embaixo do Sair: o commit que está no ar e
 * a hora em que foi publicado (ver `next.config.ts`). Depois de cada
 * publicação, quem publicou diz qual versão deve aparecer; se aparecer
 * outra, a publicação parou no caminho.
 */
export function VersaoNoAr() {
  const versao = process.env.NEXT_PUBLIC_VERSAO ?? "local";
  const publicadoEm = process.env.NEXT_PUBLIC_PUBLICADO_EM;
  const quando = publicadoEm
    ? new Date(publicadoEm).toLocaleString("pt-BR", {
        timeZone: FUSO_DA_CASA,
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).replace(",", "")
    : null;
  return (
    <p className="mt-3 text-[11px] text-[var(--muted-foreground)] opacity-70" translate="no">
      versão {versao}
      {quando && ` · ${quando}`}
    </p>
  );
}
