"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { vincularPai } from "@/lib/actions/tarefas";

/**
 * Pendurar esta tarefa embaixo de outra, ou soltá-la.
 *
 * A lista já vem filtrada pela página com `podeVincular`: só tarefas abertas
 * do mesmo quadro onde a árvore inteira cabe em três níveis, sem ela mesma e
 * sem as que estão embaixo dela. O que não pode, nem aparece.
 *
 * Bloco tracejado, como toda confirmação do painel: a consequência vem
 * escrita antes do clique, porque virar subtarefa tira o cartão do quadro.
 */
export function VincularPai({
  tarefaId,
  paiAtual,
  candidatos,
  pendente,
  rodar,
  aoFechar,
}: {
  tarefaId: number;
  paiAtual: { id: number; titulo: string } | null;
  candidatos: { id: number; titulo: string }[];
  pendente: boolean;
  rodar: (acao: () => Promise<{ ok: boolean; message?: string }>) => void;
  aoFechar: () => void;
}) {
  const [paiId, setPaiId] = useState<string>("");

  return (
    <div className="space-y-2 rounded border border-dashed border-[var(--border)] p-2.5">
      <p className="text-sm font-medium">Embaixo de qual tarefa esta fica?</p>
      {paiAtual && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Hoje é subtarefa de T-{paiAtual.id} {paiAtual.titulo}.
        </p>
      )}

      {candidatos.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nenhuma tarefa aberta deste quadro pode receber esta sem passar de três níveis.
        </p>
      ) : (
        <select
          className="field text-sm"
          value={paiId}
          onChange={(e) => setPaiId(e.target.value)}
          aria-label="Tarefa pai"
        >
          <option value="">escolha a tarefa</option>
          {candidatos.map((c) => (
            <option key={c.id} value={c.id}>
              T-{c.id} {c.titulo}
            </option>
          ))}
        </select>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        Subtarefa sai do quadro e passa a aparecer dentro da tarefa pai. Soltar
        devolve o cartão para o quadro, na coluna em que ele está.
      </p>

      <div className="flex flex-wrap gap-2">
        {candidatos.length > 0 && (
          <Button
            type="button"
            size="sm"
            disabled={pendente || paiId === ""}
            onClick={() => rodar(() => vincularPai(tarefaId, { paiId: Number(paiId) }))}
          >
            Pendurar
          </Button>
        )}
        {paiAtual && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pendente}
            onClick={() => rodar(() => vincularPai(tarefaId, { paiId: null }))}
          >
            Soltar da tarefa pai
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={aoFechar}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
