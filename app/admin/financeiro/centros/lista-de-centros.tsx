"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ligarCentro, salvarCentro } from "@/lib/actions/financeiro";
import { CHAVE_CENTRO_SALAO } from "@/lib/financeiro";
import { plural } from "@/lib/format";

import { useAcao } from "@/lib/use-acao";

type Centro = { id: number; nome: string; chave: string | null; ativo: boolean; usos: number };

export function ListaDeCentros({ centros }: { centros: Centro[] }) {
  const [abrindo, setAbrindo] = useState<number | "novo" | null>(null);
  const { erro, pendente, rodar } = useAcao();

  return (
    <div className="space-y-4">
      <Button type="button" className="h-11 gap-1.5" onClick={() => setAbrindo(abrindo === "novo" ? null : "novo")}>
        <Plus aria-hidden className="size-4" />
        Novo centro
      </Button>
      {abrindo === "novo" && <CentroForm id={null} nome="" fechar={() => setAbrindo(null)} />}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {centros.map((c) =>
          abrindo === c.id ? (
            <li key={c.id} className="p-3">
              <CentroForm id={c.id} nome={c.nome} fechar={() => setAbrindo(null)} />
            </li>
          ) : (
            <li key={c.id} className={`flex min-h-12 items-center gap-2 px-3 py-2 ${c.ativo ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.nome}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {c.usos > 0 ? plural(c.usos, "lançamento") : "nenhum lançamento"}
                  {c.chave === CHAVE_CENTRO_SALAO && " · recebe o fechamento do dia"}
                  {!c.ativo && " · desligado"}
                </p>
              </div>
              {c.chave !== CHAVE_CENTRO_SALAO && (
                <button type="button" onClick={() => rodar(() => ligarCentro(c.id, !c.ativo))} disabled={pendente} className="chip px-2.5 py-1 text-xs">
                  {c.ativo ? "Desligar" : "Ligar"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setAbrindo(c.id)}
                aria-label={`Editar ${c.nome}`}
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

function CentroForm({ id, nome, fechar }: { id: number | null; nome: string; fechar: () => void }) {
  const [v, setV] = useState(nome);
  const { erro, pendente, rodar } = useAcao();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarCentro(id, { nome: v }), fechar);
      }}
      className="card space-y-3 p-4"
    >
      <label className="block">
        <span className="label">Nome</span>
        <Input value={v} onChange={(e) => setV(e.target.value)} required maxLength={40} autoFocus />
      </label>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : id === null ? "Criar centro" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
