import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { BotoesDaFolha } from "./botoes-da-folha";

/**
 * O papel de toda página de impressão: A4 em pé ou deitado, a margem, o
 * branco com letra preta (cor de fundo sai na impressão) e os botões
 * "Baixar PDF" e "Imprimir". `css` leva o que for só daquela folha (quebra
 * de página, cabeçalho de tabela repetido).
 *
 * Na impressão, a folha perde a largura máxima: o Android monta a página
 * mais larga que o papel, e com a largura presa ela ficava no meio, com
 * sobra dos dois lados.
 */
export function FolhaDeImpressao({
  papel = "retrato",
  margem = 10,
  css,
  className,
  children,
}: {
  papel?: "retrato" | "paisagem";
  /** Em milímetros. */
  margem?: number;
  css?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <main
      className={cn("mx-auto bg-white p-2 text-black", papel === "paisagem" ? "max-w-[277mm]" : "max-w-[194mm]", className)}
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      <style>{`@page { size: A4 ${papel === "paisagem" ? "landscape" : "portrait"}; margin: ${margem}mm; } @media print { main { padding: 0 !important; max-width: none !important; width: 100% !important; } }${css ? ` ${css}` : ""}`}</style>
      <BotoesDaFolha />
      {children}
    </main>
  );
}
