"use client";

import { useEffect, useRef } from "react";

/**
 * Caixa de marcar que também sabe mostrar "alguns".
 *
 * O estado intermediário não existe em HTML como atributo — só como
 * propriedade do elemento — então precisa de um ref. Sem ele, "selecionar
 * todos" com metade marcada apareceria como vazio, e o próximo clique
 * desmarcaria o que a pessoa acabou de marcar.
 *
 * Recebe contagens, e não a coleção: quem chama guarda os marcados do jeito
 * que preferir — `Set` na lista de produtos, array de ids no assistente de
 * contagem — e esta caixa só precisa saber quantos de quantos.
 */
export function CaixaMestre({
  marcados,
  total,
  rotulo = "Selecionar todos",
  onChange,
}: {
  marcados: number;
  total: number;
  /** O que o leitor de tela anuncia. "Selecionar todos" quando não vem nada. */
  rotulo?: string;
  onChange: (marcar: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = marcados > 0 && marcados < total;
    }
  }, [marcados, total]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={rotulo}
      checked={total > 0 && marcados === total}
      onChange={(e) => onChange(e.target.checked)}
      disabled={total === 0}
      className="h-4 w-4"
    />
  );
}
