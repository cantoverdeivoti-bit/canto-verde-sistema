"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adicionarItemAoModelo,
  apagarItemDoModelo,
  apagarModelo,
  criarModelo,
  criarModeloPadrao,
  renomearModelo,
  salvarItemDoModelo,
} from "@/lib/actions/eventos";
import { ETAPA_CHECKLIST, opcoes } from "@/lib/eventos";
import type { EtapaChecklist } from "@/generated/prisma/client";

import { useAcao } from "@/lib/use-acao";

type Item = { id: number; texto: string; etapa: EtapaChecklist; dias: number | null };
type Modelo = { id: number; nome: string; itens: Item[] };

/** "-7" → "7 dias antes"; "0" → "no dia". */
function quandoE(dias: number | null): string {
  if (dias === null) return "sem prazo";
  if (dias === 0) return "no dia";
  const n = Math.abs(dias);
  return `${n} ${n === 1 ? "dia" : "dias"} ${dias < 0 ? "antes" : "depois"}`;
}

export function Modelos({ modelos }: { modelos: Modelo[] }) {
  const [nome, setNome] = useState("");
  const { erro, pendente, rodar } = useAcao();

  return (
    <div className="space-y-5">
      {modelos.length === 0 && (
        <div className="card space-y-2 p-4">
          <p className="text-sm">
            Nenhum modelo ainda. O modelo padrão traz o roteiro de um evento: sinal, cardápio, alergias, convidados, equipe,
            compra, montagem e o pós-evento. Dá para editar depois.
          </p>
          <Button type="button" disabled={pendente} onClick={() => rodar(() => criarModeloPadrao())}>
            Criar o modelo padrão
          </Button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          rodar(() => criarModelo(nome), () => setNome(""));
        }}
        className="flex gap-2"
      >
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Novo modelo, ex.: Coquetel" maxLength={80} aria-label="Nome do novo modelo" className="min-w-0 flex-1" />
        <Button type="submit" className="h-11 shrink-0 gap-1.5" disabled={pendente || nome.trim().length < 2}>
          <Plus aria-hidden className="size-4" />
          Criar
        </Button>
      </form>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {modelos.map((m) => (
        <ModeloCard key={m.id} modelo={m} />
      ))}
    </div>
  );
}

function ModeloCard({ modelo }: { modelo: Modelo }) {
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(modelo.nome);
  const [apagando, setApagando] = useState(false);
  const { erro, pendente, rodar } = useAcao();

  return (
    <section className="card p-3">
      <div className="flex items-center gap-2">
        {renomeando ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rodar(() => renomearModelo(modelo.id, nome), () => setRenomeando(false));
            }}
            className="flex min-w-0 flex-1 gap-1.5"
          >
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} autoFocus aria-label="Nome do modelo" className="h-10 min-w-0 flex-1" />
            <Button type="submit" size="sm" disabled={pendente}>
              Salvar
            </Button>
          </form>
        ) : (
          <h2 className="min-w-0 flex-1 truncate font-semibold">{modelo.nome}</h2>
        )}
        {!renomeando && (
          <button type="button" onClick={() => setRenomeando(true)} aria-label={`Renomear ${modelo.nome}`} title="Renomear" className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
            <Pencil aria-hidden className="size-4" />
          </button>
        )}
        {apagando ? (
          <>
            <Button type="button" variant="destructive" size="sm" disabled={pendente} onClick={() => rodar(() => apagarModelo(modelo.id))}>
              Apagar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setApagando(false)}>
              voltar
            </Button>
          </>
        ) : (
          <button type="button" onClick={() => setApagando(true)} aria-label={`Apagar ${modelo.nome}`} title="Apagar modelo" className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]">
            <Trash2 aria-hidden className="size-4" />
          </button>
        )}
      </div>

      <ul className="mt-2 divide-y divide-[var(--border)]">
        {modelo.itens.map((i) => (
          <ItemDoModelo key={i.id} item={i} />
        ))}
      </ul>
      <ItemForm
        inicial={{ texto: "", etapa: "ANTES", dias: "" }}
        rotulo="Pôr tarefa"
        salvar={(v) => adicionarItemAoModelo(modelo.id, v)}
      />
      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}
    </section>
  );
}

function ItemDoModelo({ item }: { item: Item }) {
  const [editando, setEditando] = useState(false);
  const { erro, pendente, rodar } = useAcao();
  if (editando)
    return (
      <li className="py-2">
        <ItemForm
          inicial={{ texto: item.texto, etapa: item.etapa, dias: item.dias === null ? "" : String(item.dias) }}
          rotulo="Salvar"
          salvar={(v) => salvarItemDoModelo(item.id, v)}
          depois={() => setEditando(false)}
          cancelar={() => setEditando(false)}
        />
      </li>
    );
  return (
    <li className="flex min-h-12 items-center gap-2 py-1.5">
      <span className="w-24 shrink-0 text-xs text-[var(--muted-foreground)]">{quandoE(item.dias)}</span>
      <span className="min-w-0 flex-1 text-sm">{item.texto}</span>
      <span className="hidden text-xs text-[var(--muted-foreground)] sm:inline">{ETAPA_CHECKLIST[item.etapa]}</span>
      <button type="button" onClick={() => setEditando(true)} aria-label={`Editar ${item.texto}`} title="Editar" className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
        <Pencil aria-hidden className="size-4" />
      </button>
      <button type="button" disabled={pendente} onClick={() => rodar(() => apagarItemDoModelo(item.id))} aria-label={`Apagar ${item.texto}`} title="Apagar" className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]">
        <Trash2 aria-hidden className="size-4" />
      </button>
      {erro && <span className="error">{erro}</span>}
    </li>
  );
}

type NoForm = { texto: string; etapa: EtapaChecklist; dias: string };

function ItemForm({
  inicial,
  rotulo,
  salvar,
  depois,
  cancelar,
}: {
  inicial: NoForm;
  rotulo: string;
  salvar: (v: NoForm) => Promise<{ ok: boolean; message?: string }>;
  depois?: () => void;
  cancelar?: () => void;
}) {
  const [v, setV] = useState(inicial);
  const { erro, pendente, rodar } = useAcao();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvar(v), () => {
          setV(inicial);
          depois?.();
        });
      }}
      className="mt-2 flex flex-wrap items-center gap-2"
    >
      <Input value={v.texto} onChange={(e) => setV((a) => ({ ...a, texto: e.target.value }))} placeholder="Tarefa" maxLength={160} aria-label="Tarefa" className="h-10 min-w-48 flex-1" />
      <select value={v.etapa} onChange={(e) => setV((a) => ({ ...a, etapa: e.target.value as EtapaChecklist }))} aria-label="Etapa" className="field h-10 w-28 py-0">
        {opcoes(ETAPA_CHECKLIST).map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
      <Input value={v.dias} onChange={(e) => setV((a) => ({ ...a, dias: e.target.value }))} placeholder="dias" inputMode="numeric" aria-label="Dias em relação ao evento" title="-7 é uma semana antes" className="h-10 w-20" />
      <Button type="submit" size="sm" className="h-10" disabled={pendente || v.texto.trim().length < 2}>
        {rotulo}
      </Button>
      {cancelar && (
        <Button type="button" variant="ghost" size="sm" onClick={cancelar}>
          Cancelar
        </Button>
      )}
      {erro && <p className="error w-full">{erro}</p>}
    </form>
  );
}
