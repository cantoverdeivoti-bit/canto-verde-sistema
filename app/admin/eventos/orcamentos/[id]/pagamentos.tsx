"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apagarPagamento, registrarPagamento } from "@/lib/actions/eventos";
import { formatDiaCurtoString, formatMoney, precoNoCampo } from "@/lib/format";

import { useAcao } from "@/lib/use-acao";

type Pagamento = { id: number; valor: number; data: string; forma: string | null; descricao: string | null };

/** O dinheiro que entrou. O campo já vem com o sinal (no primeiro) ou com o saldo (depois). */
export function Pagamentos({
  eventoId,
  pagamentos,
  recebido,
  saldo,
  sugestao,
  hoje,
}: {
  eventoId: number;
  pagamentos: Pagamento[];
  recebido: number;
  saldo: number;
  sugestao: { valor: number; descricao: string; rotulo: string };
  hoje: string;
}) {
  const inicial = { valor: sugestao.valor > 0 ? precoNoCampo(sugestao.valor) : "", data: hoje, forma: "Pix", descricao: sugestao.descricao };
  const [v, setV] = useState(inicial);
  const [abrindo, setAbrindo] = useState(false);
  const { erro, pendente, rodar } = useAcao();

  return (
    <section>
      <h2 className="section-label mb-2">Pagamentos</h2>
      <p className="text-sm">
        Recebido <span className="num-display">{formatMoney(recebido)}</span> · falta{" "}
        <span className="num-display" style={saldo > 0 ? { color: "var(--warn)" } : undefined}>
          {formatMoney(saldo)}
        </span>
      </p>
      {pagamentos.length > 0 && (
        <ul className="mt-2 divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {pagamentos.map((p) => (
            <li key={p.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5">
              <span className="w-24 shrink-0 text-xs text-[var(--muted-foreground)]">{formatDiaCurtoString(p.data)}</span>
              <span className="min-w-0 flex-1 text-sm">{[p.descricao, p.forma].filter(Boolean).join(" · ") || "Pagamento"}</span>
              <span className="num-display text-sm">{formatMoney(p.valor)}</span>
              <button type="button" disabled={pendente} onClick={() => rodar(() => apagarPagamento(p.id))} aria-label="Apagar pagamento" title="Apagar" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]">
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {abrindo ? (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            rodar(() => registrarPagamento(eventoId, v), () => setAbrindo(false));
          }}
          className="card mt-3 flex flex-wrap items-end gap-2 p-3"
        >
          <label>
            <span className="label">Valor (R$)</span>
            <Input inputMode="decimal" value={v.valor} onChange={(ev) => setV((a) => ({ ...a, valor: ev.target.value }))} className="w-32" autoFocus />
          </label>
          <label>
            <span className="label">Data</span>
            <Input type="date" value={v.data} onChange={(ev) => setV((a) => ({ ...a, data: ev.target.value }))} className="w-44" />
          </label>
          <label>
            <span className="label">Forma</span>
            <Input value={v.forma} onChange={(ev) => setV((a) => ({ ...a, forma: ev.target.value }))} maxLength={40} className="w-28" />
          </label>
          <label>
            <span className="label">O que é</span>
            <Input value={v.descricao} onChange={(ev) => setV((a) => ({ ...a, descricao: ev.target.value }))} maxLength={80} className="w-32" />
          </label>
          <Button type="submit" className="h-11" disabled={pendente}>
            Registrar
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => setAbrindo(false)}>
            Cancelar
          </Button>
        </form>
      ) : (
        <button
          type="button"
          className="btn-ghost mt-3"
          onClick={() => {
            setV(inicial);
            setAbrindo(true);
          }}
        >
          Registrar pagamento{sugestao.valor > 0 && ` (${sugestao.rotulo}: ${formatMoney(sugestao.valor)})`}
        </button>
      )}
      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}
    </section>
  );
}
