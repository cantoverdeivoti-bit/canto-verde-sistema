"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { concluirTarefa, criarSubtarefa, reabrirTarefa } from "@/lib/actions/tarefas";
import type { StatusTarefa } from "@/generated/prisma/client";

export type Filha = {
  id: number;
  titulo: string;
  status: StatusTarefa;
  responsavel: string | null;
  /** Esta pessoa pode marcar e desmarcar esta? Decidido na página. */
  podeMarcar: boolean;
};

/**
 * As subtarefas, dentro da tarefa pai.
 *
 * A caixa conclui e reabre de verdade (é mover para CONCLUÍDO e voltar,
 * RF-175), e não um visto solto: subtarefa é tarefa, com dono e histórico, e
 * aparece em "Minhas" de quem faz. Cancelada aparece riscada, sem caixa:
 * desfazer um cancelamento é no detalhe dela, onde o motivo está.
 *
 * Concluir a tarefa pai com subtarefa aberta não é barrado, como no TickTick.
 * O número de abertas fica ao lado do botão Concluir, para a decisão ser
 * consciente.
 */
export function Subtarefas({
  tarefaId,
  filhas,
  podeCriar,
}: {
  tarefaId: number;
  filhas: Filha[];
  podeCriar: boolean;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (filhas.length === 0 && !podeCriar) return null;

  function rodar(acao: () => Promise<{ ok: boolean; message?: string }>, depois?: () => void) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      depois?.();
      router.refresh();
    });
  }

  const abertas = filhas.filter((f) => f.status === "ABERTA").length;

  return (
    <section id="subtarefas">
      <h2 className="section-label">
        Subtarefas
        {filhas.length > 0 && (
          <span className="ml-2 font-normal normal-case">
            {abertas === 0 ? "todas fechadas" : `${filhas.length - abertas} de ${filhas.length} feitas`}
          </span>
        )}
      </h2>

      {filhas.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {filhas.map((f) => (
            <li key={f.id} className="flex items-start gap-2.5">
              {f.status === "CANCELADA" ? (
                <span aria-hidden className="mt-0.5 size-4 shrink-0" />
              ) : (
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                  checked={f.status === "CONCLUIDA"}
                  disabled={!f.podeMarcar || pendente}
                  aria-label={`${f.status === "CONCLUIDA" ? "Reabrir" : "Concluir"} ${f.titulo}`}
                  onChange={() =>
                    rodar(() => (f.status === "CONCLUIDA" ? reabrirTarefa(f.id) : concluirTarefa(f.id)))
                  }
                />
              )}
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/tarefas/t/${f.id}`}
                  className={`text-sm underline-offset-4 hover:underline ${
                    f.status === "ABERTA" ? "" : "text-[var(--muted-foreground)] line-through"
                  }`}
                >
                  {f.titulo}
                </Link>
                {f.responsavel && (
                  <span className="ml-2 text-xs text-[var(--muted-foreground)]">{f.responsavel}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {podeCriar && (
        <form
          className="mt-3 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            const t = titulo.trim();
            if (t === "") return;
            rodar(() => criarSubtarefa(tarefaId, { titulo: t }), () => setTitulo(""));
          }}
        >
          <label className="sr-only" htmlFor="nova-subtarefa">
            Nova subtarefa
          </label>
          <input
            id="nova-subtarefa"
            className="field text-sm"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="+ subtarefa"
            maxLength={250}
            disabled={pendente}
          />
        </form>
      )}

      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}
    </section>
  );
}
