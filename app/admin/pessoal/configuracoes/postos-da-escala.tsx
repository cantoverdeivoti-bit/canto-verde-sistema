"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criarPosto, ligarPosto, moverPosto, renomearPosto } from "@/lib/actions/pessoal";
import { useAcao } from "@/lib/use-acao";
import type { Area } from "@/lib/escala";

export type PostoParaConfigurar = { id: number; area: Area; nome: string; ativo: boolean };

/** Criar, renomear, ordenar e desligar postos. Só para quem configura. */
export function PostosDaEscala({ postos }: { postos: PostoParaConfigurar[] }) {
  const { erro, pendente, rodar } = useAcao();
  const [novo, setNovo] = useState<Record<Area, string>>({ COZINHA: "", SALAO: "" });

  return (
    <section className="space-y-2">
      <h2 className="section-label">Postos da escala</h2>
      <p className="text-sm text-[var(--muted-foreground)]">Criar, renomear, ordenar e desligar os postos da escala do almoço.</p>
      <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
        {(["COZINHA", "SALAO"] as Area[]).map((area) => (
          <div key={area}>
            <p className="section-label mb-1.5">{area === "COZINHA" ? "Cozinha" : "Salão"}</p>
            <ul className="space-y-1.5">
              {postos
                .filter((p) => p.area === area)
                .map((p, i, lista) => (
                  <li key={p.id} className={`flex items-center gap-1.5 ${p.ativo ? "" : "opacity-50"}`}>
                    <Input
                      defaultValue={p.nome}
                      aria-label={`Nome do posto ${p.nome}`}
                      maxLength={40}
                      onBlur={(ev) => {
                        const v = ev.target.value.trim();
                        if (v && v !== p.nome) rodar(() => renomearPosto(p.id, v));
                      }}
                      className="h-10 min-w-0 flex-1"
                    />
                    <button
                      type="button"
                      disabled={pendente || i === 0}
                      onClick={() => rodar(() => moverPosto(p.id, -1))}
                      aria-label={`Subir ${p.nome}`}
                      className="flex size-10 items-center justify-center rounded-lg border border-[var(--border)] disabled:opacity-30"
                    >
                      <ArrowUp aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={pendente || i === lista.length - 1}
                      onClick={() => rodar(() => moverPosto(p.id, 1))}
                      aria-label={`Descer ${p.nome}`}
                      className="flex size-10 items-center justify-center rounded-lg border border-[var(--border)] disabled:opacity-30"
                    >
                      <ArrowDown aria-hidden className="size-4" />
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-24"
                      disabled={pendente}
                      onClick={() =>
                        rodar(() => ligarPosto(p.id, !p.ativo), undefined, {
                          aviso: `${p.nome} ${p.ativo ? "desligado" : "ligado"}`,
                          desfazer: () => ligarPosto(p.id, p.ativo),
                        })
                      }
                    >
                      {p.ativo ? "Desligar" : "Ligar"}
                    </Button>
                  </li>
                ))}
            </ul>
            <div className="mt-2 flex gap-1.5">
              <Input
                value={novo[area]}
                onChange={(ev) => setNovo((n) => ({ ...n, [area]: ev.target.value }))}
                placeholder="Novo posto"
                maxLength={40}
                className="h-10 min-w-0 flex-1"
              />
              <Button
                type="button"
                className="h-10"
                disabled={pendente || novo[area].trim().length < 2}
                onClick={() => rodar(() => criarPosto(area, novo[area]), () => setNovo((n) => ({ ...n, [area]: "" })))}
              >
                Criar
              </Button>
            </div>
          </div>
        ))}
        {erro && (
          <p role="alert" className="msg-error">
            {erro}
          </p>
        )}
        <p className="hint">Desligar um posto tira ele da escala; quem estava nele fica guardado para quando ligar de novo.</p>
      </div>
    </section>
  );
}
