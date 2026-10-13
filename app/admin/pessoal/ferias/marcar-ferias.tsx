"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apagarFerias, marcarFerias } from "@/lib/actions/pessoal";
import { NOME_DA_AREA, type Area } from "@/lib/escala";
import { cruzam, fimDe } from "@/lib/ferias";

const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const OPCOES = [30, 20, 15, 10];

/** O formulário de marcar férias: quem, quando começa e quantos dias. */
export function MarcarFerias({
  pessoas,
  ferias,
  hoje,
}: {
  pessoas: { id: number; nome: string; area: Area | null }[];
  ferias: { colaboradorId: number; inicio: string; fim: string }[];
  hoje: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [quem, setQuem] = useState<number | "">("");
  const [inicio, setInicio] = useState("");
  const [dias, setDias] = useState(30);
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const fim = inicio ? fimDe(inicio, dias) : null;
  const pessoa = pessoas.find((p) => p.id === quem);
  // Quem da mesma equipe já está fora nesses dias.
  const juntos =
    pessoa?.area && inicio && fim
      ? ferias
          .filter((f) => f.colaboradorId !== pessoa.id && cruzam(f, { inicio, fim }))
          .map((f) => pessoas.find((p) => p.id === f.colaboradorId))
          .filter((p) => p && p.area === pessoa.area)
          .map((p) => p!.nome)
      : [];

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (quem === "") return setErro("Escolha quem sai de férias.");
    setErro(null);
    startTransition(async () => {
      const r = await marcarFerias(quem, inicio, dias, obs);
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      setInicio("");
      setObs("");
      setAberto(false);
    });
  }

  if (!aberto) {
    return (
      <Button type="button" className="h-11 gap-1.5" onClick={() => setAberto(true)} disabled={pessoas.length === 0}>
        <Plus aria-hidden className="size-4" />
        Marcar férias
      </Button>
    );
  }

  return (
    <form onSubmit={salvar} className="space-y-3 rounded-xl border border-[var(--primary)]/40 bg-[var(--card)] p-3">
      <p className="font-semibold">Marcar férias</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-medium">Quem</span>
          <select
            value={quem}
            onChange={(e) => setQuem(e.target.value === "" ? "" : Number(e.target.value))}
            className="field w-full"
            required
          >
            <option value="">Escolha</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
                {p.area ? ` · ${NOME_DA_AREA[p.area]}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Primeiro dia</span>
          <Input type="date" value={inicio} min={hoje} onChange={(e) => setInicio(e.target.value)} required />
        </label>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Dias</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {OPCOES.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={dias === n}
              onClick={() => setDias(n)}
              className="chip px-3 py-2 text-sm"
            >
              {n}
            </button>
          ))}
          <Input
            inputMode="numeric"
            aria-label="Outro número de dias"
            value={OPCOES.includes(dias) ? "" : String(dias)}
            placeholder="outro"
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, ""));
              if (n >= 1 && n <= 30) setDias(n);
            }}
            className="h-10 w-20"
          />
        </div>
      </fieldset>
      {fim && (
        <p className="text-sm">
          Volta no dia seguinte a <strong>{dataBR(fim)}</strong> ({dias} dias corridos).
        </p>
      )}
      {juntos.length > 0 && (
        <p className="text-sm" style={{ color: "var(--warn)" }}>
          Nesses dias {juntos.length === 1 ? "também está fora" : "também estão fora"}: {juntos.join(", ")}, da mesma equipe.
        </p>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Observação</span>
        <Input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={200} placeholder="opcional" />
      </label>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="h-10" disabled={pendente}>
          {pendente ? "Marcando…" : "Marcar"}
        </Button>
        <Button type="button" variant="ghost" className="h-10" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

/** As férias de hoje em diante, com a lixeira para desmarcar. */
export function FeriasMarcadas({
  itens,
}: {
  itens: { id: number; nome: string; quando: string; dias: number; observacao: string | null }[];
}) {
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const [pendente, startTransition] = useTransition();
  if (itens.length === 0) return null;
  return (
    <section>
      <h2 className="section-label mb-2">Marcadas · {itens.length}</h2>
      <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {itens.map((f) => (
          <li key={f.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{f.nome}</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {f.quando} · {f.dias} dias
              </p>
              {f.observacao && <p className="text-xs text-[var(--muted-foreground)]">{f.observacao}</p>}
            </div>
            {confirmando === f.id ? (
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pendente}
                  onClick={() => startTransition(async () => void (await apagarFerias(f.id)))}
                >
                  Apagar
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmando(null)}>
                  voltar
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando(f.id)}
                aria-label={`Apagar as férias de ${f.nome}`}
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
  );
}
