"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { plural } from "@/lib/format";
import { PRIORIDADE_LABEL } from "@/lib/tarefas-labels";
import { corDoTom, type Tom } from "@/lib/tom";
import type { Quadrante } from "@/lib/tarefas-matriz";
import type { PrioridadeTarefa } from "@/generated/prisma/client";

export type { Quadrante } from "@/lib/tarefas-matriz";

export type CartaoMatriz = {
  id: number;
  titulo: string;
  quadro: string;
  coluna: string;
  responsavel: string | null;
  prioridade: PrioridadeTarefa;
  prazo: { texto: string; tom: Tom; atrasada: boolean } | null;
  quadrante: Quadrante;
};

/**
 * Os quatro quadrantes, nomeados pelo que se FAZ com eles.
 *
 * "Urgente e importante" descreve a caixa; "Agora" diz o que fazer. Quem abre
 * esta tela no meio do serviço não quer um diagrama, quer saber por onde
 * começar — e o nome do quadrante é a primeira coisa que ele lê.
 *
 * O quarto quadrante é o que mais importa e o que todo mundo ignora: nem urge
 * nem pesa. Chamá-lo de "Reveja" é dizer a verdade — quase tudo ali deveria
 * ser cancelado com motivo, e é isso que esvazia um BACKLOG de 48 cartões.
 */
const QUADRANTES: {
  chave: Quadrante;
  titulo: string;
  regra: string;
  conselho: string;
  tom: Tom;
}[] = [
  {
    chave: "agora",
    titulo: "Agora",
    regra: "prioridade alta ou média · vence hoje, amanhã ou já passou",
    conselho: "É por aqui que o dia começa.",
    tom: "pendente",
  },
  {
    chave: "planeje",
    titulo: "Planeje",
    regra: "prioridade alta ou média · com folga ou sem prazo",
    conselho: "O que vira urgência se ninguém marcar data.",
    tom: "neutro",
  },
  {
    chave: "tireDaFrente",
    titulo: "Tire da frente",
    regra: "prioridade baixa ou nenhuma · vence hoje, amanhã ou já passou",
    conselho: "Grita, mas não pesa. Resolva rápido ou passe adiante.",
    tom: "pendente",
  },
  {
    chave: "reveja",
    titulo: "Reveja",
    regra: "prioridade baixa ou nenhuma · com folga ou sem prazo",
    conselho: "Boa parte disto não vai acontecer. Cancelar com motivo é uma resposta.",
    tom: "neutro",
  },
];

export function Matriz({
  cartoes,
  quadros,
  projetoId,
  soMinhas,
}: {
  cartoes: CartaoMatriz[];
  quadros: { id: number; nome: string }[];
  projetoId: number | null;
  soMinhas: boolean;
}) {
  const router = useRouter();

  function recortar(mudanca: Record<string, string | null>) {
    const atual: Record<string, string | null> = {
      projeto: projetoId ? String(projetoId) : null,
      minhas: soMinhas ? "1" : null,
      ...mudanca,
    };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const qs = p.toString();
    router.push(`/admin/tarefas/matriz${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-44">
          <label className="label" htmlFor="m-quadro">
            Quadro
          </label>
          <select
            id="m-quadro"
            className="field"
            value={projetoId ?? ""}
            onChange={(e) => recortar({ projeto: e.target.value || null })}
          >
            <option value="">todos</option>
            {quadros.map((q) => (
              <option key={q.id} value={q.id}>
                {q.nome}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="chip mb-0.5 text-sm"
          aria-pressed={soMinhas}
          onClick={() => recortar({ minhas: soMinhas ? null : "1" })}
        >
          só as minhas
        </button>
        <p className="ml-auto text-sm text-[var(--muted-foreground)]">
          {plural(cartoes.length, "tarefa aberta", "tarefas abertas")}
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {QUADRANTES.map((q) => {
          const dele = cartoes.filter((c) => c.quadrante === q.chave);
          return (
            <section key={q.chave} className="card p-3.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h2
                  className="text-base font-semibold"
                  style={{ color: corDoTom(q.tom) }}
                >
                  {q.titulo}
                </h2>
                <span className="num-display text-sm text-[var(--muted-foreground)]">
                  {dele.length}
                </span>
              </div>
              {/* A regra por extenso, em cada caixa. Sem isto a matriz é um
                  juízo sobre o trabalho de alguém sem mostrar a conta. */}
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{q.regra}</p>
              <p className="mt-1 text-xs">{q.conselho}</p>

              {dele.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">vazio</p>
              ) : (
                <ul className="mt-3 divide-y divide-dotted divide-[var(--border)]">
                  {dele.map((c) => {
                    const p = PRIORIDADE_LABEL[c.prioridade];
                    return (
                      <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2">
                        {p.marca && (
                          <span
                            className="text-xs font-bold"
                            style={{ color: corDoTom(p.tom) }}
                            aria-label={`prioridade ${p.texto}`}
                          >
                            {p.marca}
                          </span>
                        )}
                        <Link
                          href={`/admin/tarefas/t/${c.id}`}
                          className="text-sm font-medium underline-offset-4 hover:underline"
                        >
                          {c.titulo}
                        </Link>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {c.quadro} · {c.coluna}
                          {c.responsavel ? ` · ${c.responsavel}` : ""}
                        </span>
                        {c.prazo && (
                          <span
                            className="ml-auto text-xs"
                            style={{ color: corDoTom(c.prazo.tom) }}
                          >
                            {c.prazo.texto}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <p className="hint mt-5 max-w-2xl">
        Para mudar uma tarefa de quadrante, mude o que a colocou nele: a
        prioridade ou o prazo, na própria tarefa. A matriz é uma leitura do que
        já está lá — ela não guarda nada por conta própria, então nada aqui
        contradiz o que o quadro mostra.
      </p>
    </div>
  );
}
