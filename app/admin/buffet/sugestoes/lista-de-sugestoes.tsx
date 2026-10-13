"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aprovarSugestao, recusarSugestao, retirarSugestao } from "@/lib/actions/buffet";
import type { SugestaoNaTela } from "@/lib/buffet-dados";

import { useAcao } from "@/lib/use-acao";

const TIPO: Record<SugestaoNaTela["tipo"], string> = {
  CARDAPIO: "Cardápio da semana",
  TROCA: "Troca do dia",
  DESFAZER_TROCA: "Troca do dia",
  PRATO_NOVO: "Prato novo",
  PRATO: "Cadastro de prato",
  LIGAR_PRATO: "Cadastro de prato",
};

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export function ListaDeSugestoes({ pendentes, decididas, aprova }: { pendentes: SugestaoNaTela[]; decididas: SugestaoNaTela[]; aprova: boolean }) {
  const [recusando, setRecusando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const { erro, pendente, rodar } = useAcao();

  return (
    <div className="space-y-5">
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <section>
        <h2 className="section-label mb-2">Esperando aprovação · {pendentes.length}</h2>
        {pendentes.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Nada esperando.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {pendentes.map((s) => (
              <li key={s.id} className="space-y-2 px-3 py-2.5">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{TIPO[s.tipo]}</p>
                  <p className="text-sm">{s.resumo}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {s.autor} · {quando(s.criadoEm)}
                  </p>
                </div>
                {aprova ? (
                  recusando === s.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" maxLength={200} className="min-w-0 flex-1" autoFocus />
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={pendente}
                        onClick={() =>
                          rodar(
                            () => recusarSugestao(s.id, motivo),
                            () => {
                              setRecusando(null);
                              setMotivo("");
                            },
                          )
                        }
                      >
                        Recusar
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setRecusando(null)}>
                        voltar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" className="gap-1" disabled={pendente} onClick={() => rodar(() => aprovarSugestao(s.id))}>
                        <Check aria-hidden className="size-4" />
                        Aprovar
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="gap-1" disabled={pendente} onClick={() => setRecusando(s.id)}>
                        <X aria-hidden className="size-4" />
                        Recusar
                      </Button>
                    </div>
                  )
                ) : (
                  <Button type="button" size="sm" variant="outline" disabled={pendente} onClick={() => rodar(() => retirarSugestao(s.id))}>
                    Retirar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {decididas.length > 0 && (
        <section>
          <h2 className="section-label mb-2">Decididas</h2>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {decididas.map((s) => (
              <li key={s.id} className="px-3 py-2 text-sm">
                <p className="flex items-start gap-2">
                  <span
                    className="selo shrink-0"
                    style={{ color: s.status === "APROVADO" ? "var(--ok-strong)" : "var(--destructive)" }}
                  >
                    {s.status === "APROVADO" ? "aprovada" : "recusada"}
                  </span>
                  <span className="min-w-0 flex-1">{s.resumo}</span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                  {s.autor} · {s.decisor && `${s.status === "APROVADO" ? "aprovada" : "recusada"} por ${s.decisor}`}
                  {s.decididoEm && ` em ${quando(s.decididoEm)}`}
                  {s.motivoRecusa && ` · ${s.motivoRecusa}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
