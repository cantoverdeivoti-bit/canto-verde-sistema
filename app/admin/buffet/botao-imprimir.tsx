"use client";

import { Printer } from "lucide-react";

/** Imprime a tela como ela sai no papel (ver `SoNaImpressao`). */
export function BotaoImprimir({ texto = "Imprimir" }: { texto?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="chip nao-imprimir inline-flex items-center gap-1.5 px-3 py-1.5 text-sm">
      <Printer aria-hidden className="size-4" />
      {texto}
    </button>
  );
}
