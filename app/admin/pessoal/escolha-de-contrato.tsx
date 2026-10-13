"use client";

import { TIPO, TIPOS, type TipoContrato } from "@/lib/tipos-de-contrato";

/**
 * Os três botões do jeito de contratar: carteira assinada, fixo sem registro
 * e free lancer. O mesmo no cadastro, na aprovação e no link.
 */
export function EscolhaDeContrato({
  valor,
  onChange,
  legenda = "Contrato",
}: {
  valor: TipoContrato;
  onChange: (tipo: TipoContrato) => void;
  legenda?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium">{legenda}</legend>
      <div className="grid grid-cols-3 gap-2">
        {TIPOS.map((tipo) => (
          <button
            key={tipo}
            type="button"
            aria-pressed={valor === tipo}
            onClick={() => onChange(tipo)}
            className={`h-14 rounded-xl border px-1 text-sm leading-tight font-semibold ${
              valor === tipo
                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                : "border-[var(--border)] bg-[var(--card)]"
            }`}
          >
            {TIPO[tipo].longo}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
