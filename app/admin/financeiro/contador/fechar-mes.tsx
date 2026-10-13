"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { fecharMes, reabrirMes } from "@/lib/actions/financeiro";
import { nomeDoMes } from "@/lib/financeiro";

import { useAcao } from "@/lib/use-acao";

/**
 * Fechar o mês depois de enviar: o que o escritório recebeu continua batendo
 * com o sistema. Com pendência, pede uma confirmação a mais.
 */
export function FecharMes({ mes, fechado, pendencias }: { mes: string; fechado: boolean; pendencias: number }) {
  const [confirmando, setConfirmando] = useState(false);
  const { erro, pendente, rodar } = useAcao();

  return (
    <section className="space-y-2">
      <h2 className="section-label">Fechar o mês</h2>
      {fechado ? (
        confirmando ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Reabrir? Se o contador já escriturou, avise que os números podem mudar.</span>
            <Button type="button" variant="destructive" disabled={pendente} onClick={() => rodar(() => reabrirMes(mes), () => setConfirmando(false))}>
              Reabrir {nomeDoMes(mes)}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
              voltar
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" onClick={() => setConfirmando(true)}>
            Reabrir o mês
          </Button>
        )
      ) : (
        <>
          <p className="text-sm text-[var(--muted-foreground)]">
            Depois de enviar ao contador, feche o mês. Lançamento, baixa, estorno, fechamento do dia e transferência com data nele passam a ser recusados.
          </p>
          {confirmando ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {pendencias > 0 && <span>Ainda há pendências acima. Fechar assim mesmo?</span>}
              <Button type="button" disabled={pendente} onClick={() => rodar(() => fecharMes(mes), () => setConfirmando(false))}>
                Fechar {nomeDoMes(mes)}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
                voltar
              </Button>
            </div>
          ) : (
            <Button type="button" onClick={() => setConfirmando(true)}>
              Fechar o mês
            </Button>
          )}
        </>
      )}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </section>
  );
}
