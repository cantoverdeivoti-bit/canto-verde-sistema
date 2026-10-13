"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ligarForma, salvarForma } from "@/lib/actions/financeiro";
import { opcoes } from "@/lib/eventos";
import { TIPO_FORMA } from "@/lib/financeiro";
import { plural } from "@/lib/format";
import type { TipoFormaRecebimento } from "@/generated/prisma/client";

import { useAcao } from "@/lib/use-acao";

type Forma = { id: number; nome: string; tipo: TipoFormaRecebimento; taxaPct: number; prazoDias: number; contaId: number; conta: string; ativo: boolean };
type NoForm = { nome: string; tipo: TipoFormaRecebimento; taxaPct: string; prazoDias: string; contaId: number };

const pct = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export function ListaDeFormas({ formas, contas }: { formas: Forma[]; contas: { id: number; nome: string }[] }) {
  const [abrindo, setAbrindo] = useState<number | "nova" | null>(null);
  const { erro, pendente, rodar } = useAcao();
  const vazia: NoForm = { nome: "", tipo: "CREDITO", taxaPct: "", prazoDias: "30", contaId: contas[0]?.id ?? 0 };

  return (
    <div className="space-y-4">
      <Button type="button" className="h-11 gap-1.5" onClick={() => setAbrindo(abrindo === "nova" ? null : "nova")}>
        <Plus aria-hidden className="size-4" />
        Nova forma
      </Button>
      {abrindo === "nova" && <FormaForm id={null} inicial={vazia} contas={contas} fechar={() => setAbrindo(null)} />}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {formas.map((f) =>
          abrindo === f.id ? (
            <li key={f.id} className="p-3">
              <FormaForm
                id={f.id}
                inicial={{ nome: f.nome, tipo: f.tipo, taxaPct: pct(f.taxaPct), prazoDias: String(f.prazoDias), contaId: f.contaId }}
                contas={contas}
                fechar={() => setAbrindo(null)}
              />
            </li>
          ) : (
            <li key={f.id} className={`flex min-h-14 items-center gap-2 px-3 py-2 ${f.ativo ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{f.nome}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {TIPO_FORMA[f.tipo]} · taxa {pct(f.taxaPct)}% · {f.prazoDias === 0 ? "na hora" : `cai em ${plural(f.prazoDias, "dia")}`} · {f.conta}
                  {!f.ativo && " · desligada"}
                </p>
              </div>
              <button type="button" onClick={() => rodar(() => ligarForma(f.id, !f.ativo))} disabled={pendente} className="chip px-2.5 py-1 text-xs">
                {f.ativo ? "Desligar" : "Ligar"}
              </button>
              <button
                type="button"
                onClick={() => setAbrindo(f.id)}
                aria-label={`Editar ${f.nome}`}
                title="Editar"
                className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                <Pencil aria-hidden className="size-4" />
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function FormaForm({ id, inicial, contas, fechar }: { id: number | null; inicial: NoForm; contas: { id: number; nome: string }[]; fechar: () => void }) {
  const [v, setV] = useState(inicial);
  const { erro, pendente, rodar } = useAcao();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarForma(id, v), fechar);
      }}
      className="card space-y-3 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Nome</span>
          <Input value={v.nome} onChange={(e) => setV((a) => ({ ...a, nome: e.target.value }))} required maxLength={40} autoFocus placeholder="Crédito Stone" />
        </label>
        <label>
          <span className="label">Tipo</span>
          <select value={v.tipo} onChange={(e) => setV((a) => ({ ...a, tipo: e.target.value as TipoFormaRecebimento }))} className="field">
            {opcoes(TIPO_FORMA).map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.texto}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Taxa (%)</span>
          <Input inputMode="decimal" value={v.taxaPct} onChange={(e) => setV((a) => ({ ...a, taxaPct: e.target.value }))} placeholder="3,19" />
        </label>
        <label>
          <span className="label">Dias até cair na conta</span>
          <Input inputMode="numeric" value={v.prazoDias} onChange={(e) => setV((a) => ({ ...a, prazoDias: e.target.value }))} />
          <span className="hint block">0 = na hora: o recebimento já nasce baixado.</span>
        </label>
        <label className="sm:col-span-2">
          <span className="label">Cai na conta</span>
          <select value={v.contaId} onChange={(e) => setV((a) => ({ ...a, contaId: Number(e.target.value) }))} className="field">
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : id === null ? "Criar forma" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
