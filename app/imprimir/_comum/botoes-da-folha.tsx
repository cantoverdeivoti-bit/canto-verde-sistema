"use client";

import { usePathname, useSearchParams } from "next/navigation";

import { pdfDe } from "@/lib/pdf-da-pagina";

/**
 * Os botões no alto da folha, que não saem no papel nem no PDF.
 *
 * A folha não abre mais a janela de imprimir sozinha: no Android, essa
 * janela monta a página mais larga que o papel e encolhe a folha no meio
 * dele. "Baixar PDF" pega o PDF pronto do servidor (`app/pdf/...`), que sai
 * no tamanho certo em qualquer aparelho. "Imprimir" continua para quem está
 * no computador, com a impressora ao lado.
 */
export function BotoesDaFolha() {
  const busca = useSearchParams().toString();
  const pdf = pdfDe(`${usePathname()}${busca ? `?${busca}` : ""}`);

  const botao = "rounded border border-neutral-400 px-3 py-1 text-sm";
  return (
    <div className="nao-imprimir mb-3 flex flex-wrap gap-2">
      <a href={pdf} download className={`${botao} border-neutral-800 font-semibold`}>
        Baixar PDF
      </a>
      <button type="button" onClick={() => window.print()} className={botao}>
        Imprimir
      </button>
    </div>
  );
}
