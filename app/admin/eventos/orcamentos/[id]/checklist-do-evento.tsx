"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adicionarTarefa, aplicarModelo, apagarTarefa, marcarTarefa } from "@/lib/actions/eventos";
import { ETAPA_CHECKLIST, opcoes } from "@/lib/eventos";
import { formatDiaCurtoString, plural } from "@/lib/format";
import type { EtapaChecklist } from "@/generated/prisma/client";

import { useAcao } from "@/lib/use-acao";

type Tarefa = { id: number; texto: string; etapa: EtapaChecklist; prazo: string | null; responsavel: string | null; feito: boolean };

/** As tarefas do evento, por etapa, com o prazo em data e o atraso em destaque. */
export function ChecklistDoEvento({
  eventoId,
  tarefas,
  modelos,
  hoje,
}: {
  eventoId: number;
  tarefas: Tarefa[];
  modelos: { id: number; nome: string; itens: number }[];
  hoje: string;
}) {
  const [modeloId, setModeloId] = useState(modelos[0] ? String(modelos[0].id) : "");
  const [nova, setNova] = useState({ texto: "", etapa: "ANTES" as EtapaChecklist, prazo: "", responsavel: "" });
  const { erro, pendente, rodar } = useAcao();
  const feitas = tarefas.filter((t) => t.feito).length;
  const atrasadas = tarefas.filter((t) => !t.feito && t.prazo !== null && t.prazo < hoje).length;

  return (
    <section>
      <h2 className="section-label mb-2">
        Checklist{tarefas.length > 0 && ` · ${feitas} de ${tarefas.length}`}
        {atrasadas > 0 && <span style={{ color: "var(--destructive)" }}> · {plural(atrasadas, "atrasada")}</span>}
      </h2>

      {opcoes(ETAPA_CHECKLIST).map((etapa) => {
        const daEtapa = tarefas.filter((t) => t.etapa === etapa.valor);
        if (daEtapa.length === 0) return null;
        return (
          <div key={etapa.valor} className="mb-3">
            <p className="mb-1 text-xs font-semibold text-[var(--muted-foreground)]">{etapa.texto}</p>
            <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
              {daEtapa.map((t) => {
                const atrasada = !t.feito && t.prazo !== null && t.prazo < hoje;
                return (
                  <li key={t.id} className="flex min-h-12 items-center gap-2 px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={t.feito}
                      disabled={pendente}
                      onChange={(ev) => rodar(() => marcarTarefa(t.id, ev.target.checked))}
                      aria-label={t.texto}
                      className="size-5 shrink-0"
                    />
                    <span className={`min-w-0 flex-1 text-sm ${t.feito ? "text-[var(--muted-foreground)] line-through" : ""}`}>
                      {t.texto}
                      {t.responsavel && <span className="ml-1 text-xs text-[var(--muted-foreground)]">· {t.responsavel}</span>}
                    </span>
                    {t.prazo && (
                      <span className="shrink-0 text-xs" style={{ color: atrasada ? "var(--destructive)" : "var(--muted-foreground)" }}>
                        {atrasada ? "atrasada · " : ""}
                        {formatDiaCurtoString(t.prazo)}
                      </span>
                    )}
                    <button type="button" disabled={pendente} onClick={() => rodar(() => apagarTarefa(t.id))} aria-label={`Apagar ${t.texto}`} title="Apagar" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]">
                      <Trash2 aria-hidden className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {modelos.length > 0 ? (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            rodar(() => aplicarModelo(eventoId, Number(modeloId)));
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="min-w-0 flex-1">
            <span className="label">{tarefas.length === 0 ? "Começar pelo modelo" : "Somar as tarefas de um modelo"}</span>
            <select value={modeloId} onChange={(ev) => setModeloId(ev.target.value)} className="field">
              {modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} ({plural(m.itens, "tarefa")})
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className="h-11" disabled={pendente || modeloId === ""}>
            Aplicar
          </Button>
        </form>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">
          Nenhum modelo de checklist. Crie o padrão em{" "}
          <Link href="/admin/eventos/checklists" className="underline">
            Checklists
          </Link>
          .
        </p>
      )}

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          rodar(() => adicionarTarefa(eventoId, nova), () => setNova((n) => ({ ...n, texto: "", prazo: "", responsavel: "" })));
        }}
        className="mt-3 flex flex-wrap items-center gap-2"
      >
        <Input value={nova.texto} onChange={(ev) => setNova((n) => ({ ...n, texto: ev.target.value }))} placeholder="Tarefa avulsa" aria-label="Tarefa avulsa" maxLength={160} className="h-10 min-w-48 flex-1" />
        <select value={nova.etapa} onChange={(ev) => setNova((n) => ({ ...n, etapa: ev.target.value as EtapaChecklist }))} aria-label="Etapa" className="field h-10 w-28 py-0">
          {opcoes(ETAPA_CHECKLIST).map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
        <Input type="date" value={nova.prazo} onChange={(ev) => setNova((n) => ({ ...n, prazo: ev.target.value }))} aria-label="Prazo" className="h-10 w-40" />
        <Input value={nova.responsavel} onChange={(ev) => setNova((n) => ({ ...n, responsavel: ev.target.value }))} placeholder="Quem" aria-label="Responsável" maxLength={60} className="h-10 w-28" />
        <Button type="submit" className="h-10" disabled={pendente || nova.texto.trim().length < 2}>
          Pôr
        </Button>
      </form>

      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}
    </section>
  );
}
