"use client";

import { Star } from "lucide-react";

/**
 * As estrelas de qualidade, de 1 a 5.
 *
 * Com `aoMudar`, são para tocar — grandes, de dedo, como um grupo de rádio
 * que leitor de tela anuncia ("3 de 5 estrelas"). Sem, só mostram a nota.
 * Tocar na estrela já marcada não apaga: nota é decisão, e desfazer sem
 * querer no meio da conferência seria perder o que a pessoa acabou de dizer.
 */
export function Estrelas({
  valor,
  aoMudar,
  tamanho = "grande",
  rotulo,
}: {
  valor: number | null;
  aoMudar?: (n: number) => void;
  tamanho?: "grande" | "pequena";
  /** "Qualidade da Tilápia", para quem ouve a tela. */
  rotulo: string;
}) {
  const icone = tamanho === "grande" ? "size-7" : "size-3.5";
  if (!aoMudar) {
    return (
      <span role="img" aria-label={`${rotulo}: ${valor ?? 0} de 5 estrelas`} className="inline-flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            aria-hidden
            className={icone}
            style={{ color: "var(--warn)", fill: valor !== null && n <= valor ? "var(--warn)" : "transparent" }}
          />
        ))}
      </span>
    );
  }
  return (
    <span role="radiogroup" aria-label={rotulo} className="inline-flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={valor === n}
          aria-label={`${n} de 5 estrelas`}
          data-sem-relevo=""
          onClick={() => aoMudar(n)}
          className="rounded-md p-0.5 transition active:scale-95"
        >
          <Star
            aria-hidden
            className={icone}
            style={{ color: "var(--warn)", fill: valor !== null && n <= valor ? "var(--warn)" : "transparent" }}
          />
        </button>
      ))}
    </span>
  );
}

/**
 * O selo da média: "★ 4,2 (7)". Abaixo de 3, em vinho — é o aviso de que
 * esta marca costuma vir ruim. O número de notas vai junto sempre: uma nota
 * sozinha não é média de nada.
 */
export function MediaEstrelas({ media, n }: { media: number; n: number }) {
  const ruim = media < 3;
  return (
    <span
      title={`Média de ${n} ${n === 1 ? "avaliação" : "avaliações"}`}
      className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-semibold"
      style={{
        color: ruim ? "var(--primary)" : "var(--warn)",
        background: ruim
          ? "color-mix(in oklch, var(--primary) 10%, var(--background))"
          : "var(--warn-soft)",
      }}
    >
      <Star aria-hidden className="size-3" style={{ fill: "currentColor" }} />
      {media.toFixed(1).replace(".", ",")}
      <span className="font-normal opacity-70">({n})</span>
    </span>
  );
}
