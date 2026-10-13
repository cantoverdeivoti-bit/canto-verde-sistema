import type { CSSProperties } from "react";

import type { DiaDoBuffet, GrupoDoBuffet } from "@/lib/buffet-dados";
import type { FormaDaPosicao } from "@/generated/prisma/client";

type Posicao = { grupoId: number; numero: number; forma: FormaDaPosicao; linha: number; coluna: number; largura: number; altura: number };

// Sem forçar o quadrado: um círculo de verdade esticaria a linha inteira da
// estação. O redondo fica em pílula e o oval em elipse, e dá para distinguir.
const FORMA: Record<FormaDaPosicao, string> = {
  RETANGULO: "rounded-md",
  CIRCULO: "rounded-full",
  OVAL: "rounded-[50%]",
};

/**
 * O desenho do buffet como na aba MAPA DO BUFFET: cada estação no lugar dela
 * (grade de duas colunas, pelos campos `mapa*` do grupo) e, dentro, as cubas
 * pelo número, com a forma e o prato do dia. Sem cardápio, só os números.
 * No celular as estações vêm uma embaixo da outra, na ordem do percurso.
 */
export function MapaDoBuffet({
  grupos,
  posicoes,
  dia,
  impressao = false,
}: {
  grupos: GrupoDoBuffet[];
  posicoes: Posicao[];
  dia: DiaDoBuffet | null;
  impressao?: boolean;
}) {
  const porLugar = new Map((dia?.itens ?? []).map((i) => [`${i.grupoId}:${i.posicao}`, i]));
  const percurso = [...grupos].sort((a, b) => a.ordem - b.ordem);

  return (
    <div className="space-y-2" style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
      <p className="text-xs text-[var(--muted-foreground)]">
        Percurso do cliente, no sentido anti-horário: {percurso.map((g) => g.nome).join(" → ")}.
      </p>
      <div className={`grid gap-3 ${impressao ? "grid-cols-2" : "sm:grid-cols-2"}`}>
        {percurso.map((g) => {
          const lugar = {
            "--linha": g.mapaLinha,
            "--coluna": `${g.mapaColuna} / span ${g.mapaLargura}`,
            // A borda na cor da estação, como as faixas da planilha.
            borderColor: g.cor,
          } as CSSProperties;
          const doGrupo = posicoes.filter((p) => p.grupoId === g.id);
          return (
            <section
              key={g.id}
              style={lugar}
              className={`min-w-0 rounded-xl border-2 p-2 ${impressao ? "[grid-column:var(--coluna)] [grid-row:var(--linha)]" : "sm:[grid-column:var(--coluna)] sm:[grid-row:var(--linha)]"}`}
            >
              <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: g.cor }}>
                {g.nome}
              </h2>
              {/* As colunas dividem a largura que a estação tem, como na folha
                  impressa. Com largura mínima por coluna, a estação de 7
                  colunas passava da tela do celular e cortava os nomes da
                  ponta ("Tomate Fatia"); agora o nome quebra dentro da cuba. */}
              <div>
                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${g.mapaColunas}, minmax(0, 1fr))` }}
                >
                  {doGrupo.map((p) => {
                    const item = porLugar.get(`${g.id}:${p.numero}`);
                    return (
                      <div
                        key={p.numero}
                        className={`flex ${impressao ? "min-h-10" : "min-h-14"} flex-col items-center justify-center border-2 px-0.5 py-1 text-center ${FORMA[p.forma]}`}
                        style={{
                          gridRow: `${p.linha} / span ${p.altura}`,
                          gridColumn: `${p.coluna} / span ${p.largura}`,
                          borderColor: g.cor,
                          background: item?.trocado ? "var(--warn-soft)" : "var(--card)",
                        }}
                        title={item?.prato?.nome}
                      >
                        <span className="text-[11px] font-bold leading-none" style={{ color: g.cor }}>
                          {p.numero}
                        </span>
                        {dia && (
                          <span className={`line-clamp-3 leading-tight [overflow-wrap:anywhere] hyphens-auto ${impressao ? "text-[9px]" : g.mapaColunas >= 6 ? "text-[9px] sm:text-[10px]" : "text-[10px]"} ${item?.prato ? "" : "text-[var(--muted-foreground)]"}`}>
                            {item?.prato?.nome ?? "vazia"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
