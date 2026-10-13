"use client";

import { ChevronRight, GraduationCap, Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmarNaLinha } from "@/components/confirmar-na-linha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apagarTreinamento, registrarTreinamento } from "@/lib/actions/operacional";

import { useAcao } from "@/lib/use-acao";

type Pessoa = { id: number; nome: string; pendentes: number[] };

/**
 * Registrar que alguém foi treinado: a pessoa, os processos (os pendentes
 * dela já vêm marcados), a data, quem treinou e uma observação.
 */
export function RegistrarTreinamento({ pessoas, processos, hoje }: { pessoas: Pessoa[]; processos: { id: number; titulo: string }[]; hoje: string }) {
  const { erro, pendente, rodar } = useAcao();
  const [aberto, setAberto] = useState(false);
  const [colaboradorId, setColaboradorId] = useState<number | null>(null);
  const [marcados, setMarcados] = useState<number[]>([]);
  const [data, setData] = useState(hoje);
  const [instrutor, setInstrutor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [feito, setFeito] = useState<string | null>(null);

  if (!aberto) {
    return (
      <div className="space-y-2">
        {feito && (
          <p role="status" className="text-sm font-medium" style={{ color: "var(--ok-strong)" }}>
            {feito}
          </p>
        )}
        <Button type="button" className="h-11 gap-1.5" onClick={() => (setAberto(true), setFeito(null))}>
          <GraduationCap aria-hidden className="size-4" />
          Registrar treinamento
        </Button>
      </div>
    );
  }

  const escolher = (id: number | null) => {
    setColaboradorId(id);
    setMarcados(pessoas.find((p) => p.id === id)?.pendentes ?? []);
  };
  const pendentesDela = pessoas.find((p) => p.id === colaboradorId)?.pendentes ?? [];
  // Os pendentes da pessoa primeiro: é o que ela mais provavelmente acabou de aprender.
  const ordenados = [...processos].sort((a, b) => Number(pendentesDela.includes(b.id)) - Number(pendentesDela.includes(a.id)));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(
          () => registrarTreinamento({ colaboradorId: colaboradorId ?? 0, processoIds: marcados, data, instrutor, observacao }),
          () => {
            setFeito(`Treinamento registrado: ${pessoas.find((p) => p.id === colaboradorId)?.nome}, ${marcados.length === 1 ? "1 processo" : `${marcados.length} processos`}.`);
            setAberto(false);
            setColaboradorId(null);
            setMarcados([]);
            setInstrutor("");
            setObservacao("");
          },
        );
      }}
      className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3"
    >
      <h2 className="font-semibold">Registrar treinamento</h2>
      <select value={colaboradorId ?? ""} onChange={(e) => escolher(e.target.value ? Number(e.target.value) : null)} className="field w-full" aria-label="Quem foi treinado" required>
        <option value="">Quem foi treinado?</option>
        {pessoas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
            {p.pendentes.length > 0 ? ` (${p.pendentes.length} pendente${p.pendentes.length === 1 ? "" : "s"})` : ""}
          </option>
        ))}
      </select>
      {colaboradorId !== null && (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Em quê</legend>
          {processos.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhum processo cadastrado.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {ordenados.map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2.5 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={marcados.includes(p.id)}
                      onChange={() => setMarcados((m) => (m.includes(p.id) ? m.filter((x) => x !== p.id) : [...m, p.id]))}
                      className="size-5 accent-[var(--primary)]"
                    />
                    {p.titulo}
                    {pendentesDela.includes(p.id) && <span className="text-xs" style={{ color: "var(--warn)" }}>pendente</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Data</span>
          <Input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Quem treinou</span>
          <Input value={instrutor} onChange={(e) => setInstrutor(e.target.value)} maxLength={80} placeholder="Ex.: Lauren" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Observação</span>
        <Input value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={500} placeholder="Opcional" />
      </label>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="h-11" disabled={pendente || colaboradorId === null || marcados.length === 0}>
          {pendente ? "Registrando…" : "Registrar"}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

type ItemDoHistorico = { id: number; titulo: string; data: string; instrutor: string | null; observacao: string | null };

/** O histórico de treinamentos da pessoa, fechado numa linha que abre. */
export function HistoricoDoColaborador({ itens, podeMudar }: { itens: ItemDoHistorico[]; podeMudar: boolean }) {
  const { erro, pendente, rodar } = useAcao();
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-[var(--primary)] [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-3.5 transition-transform group-open:rotate-90" />
        Histórico ({itens.length})
      </summary>
      <ul className="mt-1.5 space-y-1 border-l border-[var(--border)] pl-3">
        {itens.map((t) => (
          <li key={t.id} className="flex flex-wrap items-start gap-2 text-xs">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{t.titulo}</span> · {t.data}
              {t.instrutor && ` · por ${t.instrutor}`}
              {t.observacao && <span className="block text-[var(--muted-foreground)]">{t.observacao}</span>}
            </span>
            {podeMudar && (
              <ConfirmarNaLinha
                pergunta={`Apagar o registro de "${t.titulo}" em ${t.data}?`}
                aoConfirmar={() => rodar(() => apagarTreinamento(t.id))}
                pendente={pendente}
              >
                {(abrir) => (
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={abrir}
                    aria-label="Apagar registro"
                    className="shrink-0 rounded p-1 hover:bg-[var(--muted)]"
                    style={{ color: "var(--destructive)" }}
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                )}
              </ConfirmarNaLinha>
            )}
          </li>
        ))}
      </ul>
      {erro && (
        <p role="alert" className="text-xs" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
    </details>
  );
}

/** O filtro por função numa caixa só: escolher já envia, sem botão. */
export function EscolherFuncao({ funcoes, atual, soPendentes }: { funcoes: { id: number; nome: string }[]; atual: number | null; soPendentes: boolean }) {
  return (
    <form method="get" className="min-w-0 flex-1">
      {soPendentes && <input type="hidden" name="pendentes" value="1" />}
      <select
        name="funcao"
        defaultValue={atual ?? ""}
        aria-label="Filtrar por função"
        className="field h-10 w-full py-0 text-sm"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">Todas as funções</option>
        {funcoes.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nome}
          </option>
        ))}
      </select>
    </form>
  );
}
