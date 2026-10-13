"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { chave, plural } from "@/lib/format";
import { PRIORIDADE_LABEL, STATUS_TAREFA_LABEL } from "@/lib/tarefas-labels";
import { corDoTom, type Tom } from "@/lib/tom";
import type { PrioridadeTarefa, StatusTarefa } from "@/generated/prisma/client";

export type LinhaTarefa = {
  id: number;
  titulo: string;
  /** Não aparece na tela; entra na busca. */
  descricao: string;
  quadro: string;
  quadroId: number;
  coluna: string;
  status: StatusTarefa;
  prioridade: PrioridadeTarefa;
  responsavel: string | null;
  prazo: { texto: string; tom: Tom; atrasada: boolean } | null;
};

type Agrupar = "nenhum" | "quadro" | "responsavel" | "coluna";

const AGRUPAR: { valor: Agrupar; texto: string }[] = [
  { valor: "quadro", texto: "por quadro" },
  { valor: "responsavel", texto: "por pessoa" },
  { valor: "coluna", texto: "por coluna" },
  { valor: "nenhum", texto: "sem agrupar" },
];

/**
 * A lista, com a busca filtrando a cada tecla.
 *
 * O texto é filtrado no navegador, sobre as linhas que o servidor já mandou —
 * é o mesmo arranjo da busca de produtos e da de fornecedores neste painel. A
 * régua é `chave()`, que tira acento e caixa: quem digita "manutencao"
 * correndo está procurando "Manutenção", e exigir o acento seria transformar a
 * busca num quiz de ortografia.
 *
 * Os filtros que mudam O QUE o servidor traz — quadro, pessoa, encerradas,
 * atrasadas — recarregam pela URL, porque são recorte de consulta e não de
 * exibição, e porque assim viram link que se manda para alguém.
 */
export function ListaTarefas({
  linhas,
  quadros,
  pessoas,
  inicial,
  cortado,
  souEu,
}: {
  linhas: LinhaTarefa[];
  quadros: { id: number; nome: string }[];
  pessoas: { id: number; nome: string }[];
  inicial: {
    q: string;
    projetoId: number | null;
    responsavelId: number | null;
    encerradas: boolean;
    atrasadas: boolean;
  };
  cortado: boolean;
  souEu: number;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(inicial.q);
  const [agrupar, setAgrupar] = useState<Agrupar>("quadro");

  /* O índice é montado uma vez por conjunto de linhas, não a cada tecla. */
  const indice = useMemo(
    () =>
      new Map(
        linhas.map((l) => [
          l.id,
          chave(`${l.titulo} ${l.descricao} ${l.quadro} ${l.responsavel ?? ""} T-${l.id}`),
        ]),
      ),
    [linhas],
  );

  const termo = chave(busca);
  const achadas =
    termo === "" ? linhas : linhas.filter((l) => indice.get(l.id)?.includes(termo));

  const grupos = useMemo(() => {
    if (agrupar === "nenhum") return [{ titulo: "", itens: achadas }];
    const mapa = new Map<string, LinhaTarefa[]>();
    for (const l of achadas) {
      const k =
        agrupar === "quadro"
          ? l.quadro
          : agrupar === "coluna"
            ? l.coluna
            : (l.responsavel ?? "sem dono");
      const g = mapa.get(k);
      if (g) g.push(l);
      else mapa.set(k, [l]);
    }
    return [...mapa]
      .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
      .map(([titulo, itens]) => ({ titulo, itens }));
  }, [achadas, agrupar]);

  /** Recorte que o servidor precisa refazer: vira URL. */
  function recortar(mudanca: Record<string, string | null>) {
    const atual: Record<string, string | null> = {
      projeto: inicial.projetoId ? String(inicial.projetoId) : null,
      responsavel: inicial.responsavelId ? String(inicial.responsavelId) : null,
      encerradas: inicial.encerradas ? "1" : null,
      atrasadas: inicial.atrasadas ? "1" : null,
      ...mudanca,
    };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    const qs = p.toString();
    router.push(`/admin/tarefas/lista${qs ? `?${qs}` : ""}`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="busca">
            Procurar
          </label>
          <input
            id="busca"
            type="search"
            className="field"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="título, detalhe, pessoa ou T-12"
            autoComplete="off"
          />
        </div>

        <div className="min-w-40">
          <label className="label" htmlFor="f-quadro">
            Quadro
          </label>
          <select
            id="f-quadro"
            className="field"
            value={inicial.projetoId ?? ""}
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

        <div className="min-w-40">
          <label className="label" htmlFor="f-pessoa">
            Quem faz
          </label>
          <select
            id="f-pessoa"
            className="field"
            value={inicial.responsavelId ?? ""}
            onChange={(e) => recortar({ responsavel: e.target.value || null })}
          >
            <option value="">qualquer um</option>
            <option value={souEu}>eu</option>
            {pessoas
              .filter((p) => p.id !== souEu)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
          </select>
        </div>

        <div className="min-w-36">
          <label className="label" htmlFor="f-agrupar">
            Agrupar
          </label>
          <select
            id="f-agrupar"
            className="field"
            value={agrupar}
            onChange={(e) => setAgrupar(e.target.value as Agrupar)}
          >
            {AGRUPAR.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.texto}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="chip text-sm"
          aria-pressed={inicial.atrasadas}
          onClick={() => recortar({ atrasadas: inicial.atrasadas ? null : "1" })}
        >
          só atrasadas
        </button>
        <button
          type="button"
          className="chip text-sm"
          aria-pressed={inicial.encerradas}
          onClick={() => recortar({ encerradas: inicial.encerradas ? null : "1" })}
        >
          incluir concluídas e canceladas
        </button>
        <p className="ml-auto text-sm text-[var(--muted-foreground)]">
          {termo === ""
            ? plural(achadas.length, "tarefa", "tarefas")
            : `${achadas.length} de ${linhas.length}`}
        </p>
      </div>

      {cortado && (
        <p className="msg-warn mt-3">
          A lista parou em 500 tarefas. Recorte por quadro ou por pessoa para
          ver o resto — assim a busca não mente dizendo que achou tudo.
        </p>
      )}

      {achadas.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--muted-foreground)]">
          {termo === ""
            ? "Nenhuma tarefa com esses filtros."
            : `Nada com "${busca}". A busca olha título, detalhe, quadro, pessoa e o número da tarefa.`}
        </p>
      ) : (
        grupos.map((g) => (
          <section key={g.titulo || "tudo"} className="mt-7">
            {g.titulo && (
              <h2 className="section-label">
                {g.titulo} · {g.itens.length}
              </h2>
            )}
            <ul className="mt-2 divide-y divide-dotted divide-[var(--border)]">
              {g.itens.map((l) => {
                const p = PRIORIDADE_LABEL[l.prioridade];
                return (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                  >
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
                      href={`/admin/tarefas/t/${l.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {l.titulo}
                    </Link>
                    {l.status !== "ABERTA" && (
                      <span
                        className="selo"
                        style={{ color: corDoTom(STATUS_TAREFA_LABEL[l.status].tom) }}
                      >
                        {STATUS_TAREFA_LABEL[l.status].texto}
                      </span>
                    )}
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {agrupar === "quadro" ? l.coluna : `${l.quadro} · ${l.coluna}`}
                    </span>
                    {l.responsavel && agrupar !== "responsavel" && (
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {l.responsavel}
                      </span>
                    )}
                    {l.prazo && (
                      <span
                        className="ml-auto text-sm"
                        style={{ color: corDoTom(l.prazo.tom) }}
                      >
                        {l.prazo.texto}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
