import type { ReactNode } from "react";

/**
 * O que o navegador imprime nesta tela (Ctrl+P, "Imprimir" do celular): só
 * este bloco, numa A4, sem menu e botões. Na impressão some tudo que não é o
 * bloco nem um dos que o contêm, e esses perdem margem, borda e fundo.
 * `soNaImpressao` esconde o bloco na tela (a folha é outra coisa que a tela).
 */
export function SoNaImpressao({ children, soNaImpressao = false, deitada = false }: { children: ReactNode; soNaImpressao?: boolean; deitada?: boolean }) {
  return (
    <>
      <style>{`
        @page { size: A4 ${deitada ? "landscape" : "portrait"}; margin: 8mm; }
        @media print {
          body *:not(:has(.so-na-impressao)):not(.so-na-impressao):not(.so-na-impressao *) { display: none !important; }
          body *:has(.so-na-impressao) {
            margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important;
            max-width: none !important; width: auto !important; min-height: 0 !important; height: auto !important;
            position: static !important; overflow: visible !important; background: white !important;
          }
          .so-na-impressao { display: block !important; }
          .nao-imprimir { display: none !important; }
          html, body { background: white !important; }
        }
      `}</style>
      <div className={`so-na-impressao ${soNaImpressao ? "hidden bg-white text-black" : ""}`} style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
        {children}
      </div>
    </>
  );
}
