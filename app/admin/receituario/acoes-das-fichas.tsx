"use client";

import { Download, Plus, Sparkles } from "lucide-react";
import { useState } from "react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { pdfDe } from "@/lib/pdf-da-pagina";

/**
 * As ações da lista de fichas, em quadrados (componente cliente por causa
 * dos ícones). "Exportar" abre, no mesmo cartão, as fichas da busca de agora
 * para imprimir ou salvar em PDF: a operacional e, para quem vê custo, a
 * técnica.
 */
export function AcoesDasFichas({
  podeCriar,
  filtro,
  rotulo,
  verCusto,
}: {
  podeCriar: boolean;
  /** A categoria ou a operação escolhida na busca, como query; nulo sem filtro. */
  filtro: string | null;
  /** "as de Sobremesa", "estas 12 fichas". */
  rotulo: string;
  verCusto: boolean;
}) {
  const [exportar, setExportar] = useState(false);
  return (
    <CartaoDeBotoes>
      {podeCriar && <BotaoQuadrado icone={Plus} texto="Nova ficha" tom="primario" href="/admin/receituario/nova" />}
      {podeCriar && <BotaoQuadrado icone={Sparkles} texto="Importar receita" href="/admin/receituario/importar" />}
      <BotaoQuadrado icone={Download} texto="Exportar" ativo={exportar} onClick={() => setExportar(!exportar)} />
      {exportar && (
        <div className="col-span-full basis-full space-y-2 border-t border-[var(--border)] p-3 text-sm">
          {filtro ? (
            <>
              <p className="text-[var(--muted-foreground)]">Exportar {rotulo} num PDF, uma ficha por folha.</p>
              <div className="flex flex-wrap gap-2">
                <a href={pdfDe(`/imprimir/receituario?${filtro}`)} download className="chip px-3 py-1.5">
                  Fichas operacionais
                </a>
                {verCusto && (
                  <a href={pdfDe(`/imprimir/receituario?${filtro}&tipo=tecnica`)} download className="chip px-3 py-1.5">
                    Fichas técnicas, com custo
                  </a>
                )}
              </div>
            </>
          ) : (
            <p className="text-[var(--muted-foreground)]">Escolha uma categoria ou uma operação na busca: exporta as fichas dela.</p>
          )}
        </div>
      )}
    </CartaoDeBotoes>
  );
}
