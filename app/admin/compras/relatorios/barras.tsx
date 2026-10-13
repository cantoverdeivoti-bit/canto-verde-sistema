"use client";

import { useState } from "react";

/**
 * Barras horizontais: rótulo à esquerda, barra no meio, valor à direita.
 *
 * O número exato já vai escrito; tocar numa linha (ou passar o mouse) abre a
 * dica embaixo dela, com o resto da conta. Antes a dica era o `title`, que
 * no celular não aparece.
 */
export function Barras({
  linhas,
}: {
  linhas: { rotulo: string; pct: number; valor: string; dica: string }[];
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const maior = Math.max(...linhas.map((l) => l.pct), 0);
  return (
    <ul className="space-y-1">
      {linhas.map((l) => (
        <li key={l.rotulo}>
          <button
            type="button"
            aria-expanded={aberta === l.rotulo}
            onClick={() => setAberta((a) => (a === l.rotulo ? null : l.rotulo))}
            // No celular: nome e valor numa linha, a barra inteira embaixo — lado a
            // lado, o valor escrito comia a largura e a barra virava um traço.
            className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md px-1 py-0.5 text-left text-sm hover:bg-[var(--muted)] sm:grid-cols-[minmax(6rem,9rem)_1fr_auto]"
          >
            <span className="truncate">{l.rotulo}</span>
            <span className="col-span-2 row-start-2 h-3 rounded-sm bg-[var(--muted)] sm:col-span-1 sm:col-start-2 sm:row-start-1">
              <span
                className="block h-full rounded-sm bg-[var(--primary)]"
                // Proporcional à maior, e não a 100%: com uma categoria em 40%,
                // a barra dela ocupa a linha toda e as outras leem contra ela.
                style={{ width: `${maior > 0 ? Math.max((l.pct / maior) * 100, 1.5) : 0}%` }}
              />
            </span>
            <span className="num-display text-right text-xs whitespace-nowrap">{l.valor}</span>
          </button>
          {aberta === l.rotulo && <p className="px-1 pb-1 text-xs text-[var(--muted-foreground)]">{l.dica}</p>}
        </li>
      ))}
    </ul>
  );
}
