"use client";

import { useId, useState, type ReactNode } from "react";

/**
 * A frase curta do alto da tela com um "?" no fim: tocar no "?" abre o resto
 * da explicação embaixo. Quem já conhece a tela não lê o parágrafo em toda
 * visita; quem quer saber, toca.
 */
export function AjudaDoTopo({ frase, ajuda }: { frase: ReactNode; ajuda: ReactNode }) {
  const [aberta, setAberta] = useState(false);
  const id = useId();
  return (
    <>
      <span>
        {frase}{" "}
        <button
          type="button"
          aria-expanded={aberta}
          aria-controls={id}
          aria-label={aberta ? "Fechar a explicação" : "Ler a explicação desta tela"}
          onClick={() => setAberta(!aberta)}
          className={`ml-0.5 inline-flex size-5 items-center justify-center rounded-full border align-[-3px] text-xs font-bold transition ${
            aberta
              ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
              : "border-[var(--muted-foreground)] text-[var(--muted-foreground)] hover:border-[var(--foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          ?
        </button>
      </span>
      {aberta && (
        <span id={id} className="mt-1.5 block max-w-2xl text-[var(--foreground)]">
          {ajuda}
        </span>
      )}
    </>
  );
}
