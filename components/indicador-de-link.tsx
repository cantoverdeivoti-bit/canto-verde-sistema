"use client";

import { useLinkStatus } from "next/link";

/**
 * O sinal de que o toque pegou, enquanto a tela nova não chega.
 *
 * Vai dentro de um `<Link>`: um ponto pulsando no fim do item tocado e uma
 * barra fina correndo no topo da tela. Os dois só aparecem depois de um
 * instante (no CSS), para não piscar quando a troca é imediata.
 */
export function IndicadorDeLink() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <span aria-hidden className="ponto-navegando" />
      <span aria-hidden className="barra-navegando" />
    </>
  );
}
