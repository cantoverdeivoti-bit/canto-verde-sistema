"use client";

import { ArrowRight, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apagarTransferencia, salvarTransferencia } from "@/lib/actions/financeiro";
import { formatDiaCurtoString, formatMoney } from "@/lib/format";

import { useAcao } from "@/lib/use-acao";

type Conta = { id: number; nome: string; saldo: number };
type Transferencia = { id: number; data: string; origem: string; destino: string; valor: number; observacao: string };

export function Transferencias({ hoje, contas, recentes }: { hoje: string; contas: Conta[]; recentes: Transferencia[] }) {
  const inicial = { origemId: contas[0]?.id ?? 0, destinoId: contas[1]?.id ?? contas[0]?.id ?? 0, valor: "", data: hoje, observacao: "" };
  const [v, setV] = useState(inicial);
  const [apagando, setApagando] = useState<number | null>(null);
  const { erro, pendente, rodar } = useAcao();
  const saldoDe = (id: number) => contas.find((c) => c.id === id)?.saldo;

  if (contas.length < 2)
    return <p className="mt-4 text-sm text-[var(--muted-foreground)]">Para transferir, cadastre pelo menos duas contas em Contas e saldos.</p>;

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          rodar(() => salvarTransferencia(v), () => setV(inicial));
        }}
        className="card space-y-3 p-4"
      >
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <label>
            <span className="label">Sai de</span>
            <select value={v.origemId} onChange={(e) => setV((a) => ({ ...a, origemId: Number(e.target.value) }))} className="field">
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <span className="hint block">saldo {formatMoney(saldoDe(v.origemId) ?? 0)}</span>
          </label>
          <ArrowRight aria-hidden className="mb-9 hidden size-4 text-[var(--muted-foreground)] sm:block" />
          <label>
            <span className="label">Vai para</span>
            <select value={v.destinoId} onChange={(e) => setV((a) => ({ ...a, destinoId: Number(e.target.value) }))} className="field">
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <span className="hint block">saldo {formatMoney(saldoDe(v.destinoId) ?? 0)}</span>
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label>
            <span className="label">Valor (R$)</span>
            <Input inputMode="decimal" value={v.valor} onChange={(e) => setV((a) => ({ ...a, valor: e.target.value }))} placeholder="0,00" className="w-32" required />
          </label>
          <label>
            <span className="label">Data</span>
            <Input type="date" value={v.data} max={hoje} onChange={(e) => setV((a) => ({ ...a, data: e.target.value }))} className="w-44" required />
          </label>
          <label className="min-w-40 flex-1">
            <span className="label">Observação</span>
            <Input value={v.observacao} onChange={(e) => setV((a) => ({ ...a, observacao: e.target.value }))} maxLength={120} placeholder="Depósito da gaveta" />
          </label>
        </div>
        {erro && (
          <p role="alert" className="msg-error">
            {erro}
          </p>
        )}
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : "Transferir"}
        </Button>
      </form>

      {recentes.length > 0 && (
        <section>
          <h2 className="section-label mb-2">Últimas transferências</h2>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {recentes.map((t) => (
              <li key={t.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5">
                <span className="w-24 shrink-0 text-xs text-[var(--muted-foreground)]">{formatDiaCurtoString(t.data)}</span>
                <span className="min-w-0 flex-1 text-sm">
                  {t.origem} → {t.destino}
                  {t.observacao && <span className="block truncate text-xs text-[var(--muted-foreground)]">{t.observacao}</span>}
                </span>
                <span className="num-display text-sm">{formatMoney(t.valor)}</span>
                {apagando === t.id ? (
                  <Button type="button" size="sm" variant="destructive" disabled={pendente} onClick={() => rodar(() => apagarTransferencia(t.id), () => setApagando(null))}>
                    Apagar
                  </Button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setApagando(t.id)}
                    aria-label="Apagar transferência"
                    title="Apagar"
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
