"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TempoRestante } from "@/components/tempo-restante";
import { mudarPrazoDaContagem } from "@/lib/actions/contagem";

/** "2026-09-26T18:30" no relógio do aparelho, para o campo de data e hora. */
function paraCampo(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Até quando vai a contagem, e o jeito de o estoquista mudar isso pelo link.
 *
 * Aberta, é o relógio de sempre com um lápis ao lado. Vencida, o mesmo campo
 * aparece aberto para reabrir o link — o que ele já contou continua lá.
 */
export function PrazoDaContagem({
  token,
  fimIso,
  fimTexto,
  vencida = false,
}: {
  token: string;
  fimIso: string;
  /** "sábado, 26 de setembro às 18:30", no fuso da casa. */
  fimTexto: string;
  vencida?: boolean;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(vencida);
  const [valor, setValor] = useState(() => {
    // Vencida, sugere daqui a duas horas; aberta, o prazo de agora.
    const base = vencida ? new Date(Date.now() + 2 * 60 * 60 * 1000) : new Date(fimIso);
    return paraCampo(base);
  });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar() {
    setErro(null);
    const novo = new Date(valor);
    if (Number.isNaN(novo.getTime())) return setErro("Escolha a data e a hora.");
    startTransition(async () => {
      const r = await mudarPrazoDaContagem(token, novo.toISOString());
      if (!r.ok) return setErro(r.message ?? "Não foi possível mudar o prazo.");
      setEditando(false);
      router.refresh();
    });
  }

  return (
    <div className="text-sm">
      {!vencida && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[var(--muted-foreground)]">
          <TempoRestante fimIso={fimIso} />
          {/* Sem o ponto na frente: quebrando a linha no celular, ele sobrava sozinho no começo. */}
          <span>até {fimTexto}</span>
          {!editando && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              title="Mudar até quando vai a contagem"
              aria-label="Mudar até quando vai a contagem"
              className="inline-flex size-7 items-center justify-center rounded-md hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
            >
              <Pencil aria-hidden className="size-4" />
            </button>
          )}
        </p>
      )}

      {editando && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
          <label className="text-xs">
            <span className="mb-1 block font-semibold">{vencida ? "Reabrir até" : "Contar até"}</span>
            <input
              type="datetime-local"
              value={valor}
              min={paraCampo(new Date())}
              onChange={(e) => setValor(e.target.value)}
              className="field h-10 w-auto text-sm"
            />
          </label>
          <button
            type="button"
            disabled={pendente}
            onClick={salvar}
            className="h-10 rounded-md bg-[var(--botao)] px-4 text-sm font-semibold text-[var(--botao-texto)] disabled:opacity-60"
          >
            {pendente ? "Salvando…" : vencida ? "Reabrir" : "Salvar"}
          </button>
          {!vencida && (
            <button
              type="button"
              onClick={() => {
                setEditando(false);
                setErro(null);
              }}
              className="h-10 rounded-md px-3 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            >
              voltar
            </button>
          )}
          {erro && (
            <p role="alert" className="w-full text-xs" style={{ color: "var(--destructive)" }}>
              {erro}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
