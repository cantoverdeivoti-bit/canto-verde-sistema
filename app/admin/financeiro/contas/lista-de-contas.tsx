"use client";

import { Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ligarConta, salvarConta } from "@/lib/actions/financeiro";
import { opcoes } from "@/lib/eventos";
import { TIPO_CONTA } from "@/lib/financeiro";
import { formatDiaCurtoString, formatMoney, precoNoCampo } from "@/lib/format";
import type { TipoConta } from "@/generated/prisma/client";

import { useAcao } from "@/lib/use-acao";

type Conta = {
  id: number;
  nome: string;
  tipo: TipoConta;
  ativo: boolean;
  saldoInicial: number;
  saldoInicialEm: string;
  saldo: number;
  codigoContabil: string | null;
};
type NoForm = { nome: string; tipo: TipoConta; saldoInicial: string; saldoInicialEm: string; codigoContabil: string };

export function ListaDeContas({ contas, hoje }: { contas: Conta[]; hoje: string }) {
  const [abrindo, setAbrindo] = useState<number | "nova" | null>(null);
  const { erro, pendente, rodar } = useAcao();

  return (
    <div className="space-y-4">
      <Button type="button" className="h-11 gap-1.5" onClick={() => setAbrindo(abrindo === "nova" ? null : "nova")}>
        <Plus aria-hidden className="size-4" />
        Nova conta
      </Button>
      {abrindo === "nova" && <ContaForm id={null} inicial={{ nome: "", tipo: "BANCO", saldoInicial: "", saldoInicialEm: hoje, codigoContabil: "" }} fechar={() => setAbrindo(null)} />}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {contas.map((c) =>
          abrindo === c.id ? (
            <li key={c.id} className="p-3">
              <ContaForm
                id={c.id}
                inicial={{
                  nome: c.nome,
                  tipo: c.tipo,
                  saldoInicial: precoNoCampo(c.saldoInicial),
                  saldoInicialEm: c.saldoInicialEm,
                  codigoContabil: c.codigoContabil ?? "",
                }}
                fechar={() => setAbrindo(null)}
              />
            </li>
          ) : (
            <li key={c.id} className={`flex min-h-14 items-center gap-2 px-3 py-2 ${c.ativo ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{c.nome}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {TIPO_CONTA[c.tipo]} · começou com {formatMoney(c.saldoInicial)} em {formatDiaCurtoString(c.saldoInicialEm)}
                  {c.codigoContabil ? ` · cód. ${c.codigoContabil}` : " · sem código contábil"}
                  {!c.ativo && " · desligada"}
                </p>
              </div>
              <p className="num-display shrink-0 text-sm" style={c.saldo < 0 ? { color: "var(--destructive)" } : undefined}>
                {formatMoney(c.saldo)}
              </p>
              <button type="button" onClick={() => rodar(() => ligarConta(c.id, !c.ativo))} disabled={pendente} className="chip px-2.5 py-1 text-xs">
                {c.ativo ? "Desligar" : "Ligar"}
              </button>
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

function ContaForm({ id, inicial, fechar }: { id: number | null; inicial: NoForm; fechar: () => void }) {
  const [v, setV] = useState(inicial);
  const { erro, pendente, rodar } = useAcao();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarConta(id, v), fechar);
      }}
      className="card space-y-3 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="label">Nome</span>
          <Input value={v.nome} onChange={(e) => setV((a) => ({ ...a, nome: e.target.value }))} required maxLength={40} autoFocus placeholder="Sicredi, Caixa da loja" />
        </label>
        <label>
          <span className="label">Tipo</span>
          <select value={v.tipo} onChange={(e) => setV((a) => ({ ...a, tipo: e.target.value as TipoConta }))} className="field">
            {opcoes(TIPO_CONTA).map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.texto}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Saldo inicial (R$)</span>
          <Input inputMode="decimal" value={v.saldoInicial} onChange={(e) => setV((a) => ({ ...a, saldoInicial: e.target.value }))} placeholder="0,00" />
        </label>
        <label>
          <span className="label">No dia</span>
          <Input type="date" value={v.saldoInicialEm} onChange={(e) => setV((a) => ({ ...a, saldoInicialEm: e.target.value }))} required />
        </label>
        <label>
          <span className="label">Código contábil</span>
          <Input value={v.codigoContabil} onChange={(e) => setV((a) => ({ ...a, codigoContabil: e.target.value }))} maxLength={20} placeholder="1.1.1.02" />
          <span className="hint block">O código desta conta no plano do escritório.</span>
        </label>
      </div>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : id === null ? "Criar conta" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
