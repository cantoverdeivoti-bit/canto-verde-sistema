"use client";

import { ArrowDown, ArrowUp, FileText, LayoutList, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { ConfirmarNaLinha } from "@/components/confirmar-na-linha";
import { ICONE_DO_TILE, TILE, TILE_EM_DESTAQUE } from "@/components/estilo-do-atalho";
import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  apagarDepartamento,
  apagarSubdepartamento,
  apagarTarefaDoChecklist,
  criarDepartamento,
  criarSubdepartamento,
  moverTarefaDoChecklist,
  renomearDepartamento,
  renomearSubdepartamento,
  salvarTarefaDoChecklist,
} from "@/lib/actions/operacional";
import { plural } from "@/lib/format";
import type { FolhaDeChecklist } from "@/lib/operacional-dados";
import { MOMENTOS, type Momento } from "@/lib/operacional-regras";

import { useAcao } from "@/lib/use-acao";

type Rodar = ReturnType<typeof useAcao>["rodar"];
type Departamento = { id: number; nome: string; folhas: { id: number; nome: string | null; tarefas: number }[] };

const BOTAO_ICONE =
  "flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-30";

const imprimir = (q: string) => `/imprimir/operacional/checklist${q ? `?${q}` : ""}`;
const irPara = (folha: number) => `/admin/operacional/checklists?folha=${folha}`;

/**
 * A tela de Checklists: os departamentos no alto, os subdepartamentos do
 * escolhido embaixo e, na folha aberta, a abertura e o fechamento lado a lado
 * (no celular, um embaixo do outro). Quem não configura o módulo só vê e
 * imprime.
 */
export function EditorDeChecklists({ departamentos, folha, podeMudar }: { departamentos: Departamento[]; folha: FolhaDeChecklist | null; podeMudar: boolean }) {
  const router = useRouter();
  const { erro, pendente, rodar } = useAcao();
  const dep = departamentos.find((d) => d.id === folha?.departamento.id) ?? null;
  const abrir = (r: { ok: boolean }) => "id" in r && typeof r.id === "number" && router.push(irPara(r.id));

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo="Checklists"
        subtitulo="Folhas para imprimir e pendurar no lugar."
        ajuda="Uma folha por departamento e subdepartamento. Ela vale a semana, com um quadradinho por dia para marcar à mão."
      />

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {/* Os departamentos em grade de símbolos, como as abas dos Relatórios. */}
      <GradeDeDepartamentos
        departamentos={departamentos}
        atual={dep?.id ?? null}
        podeMudar={podeMudar}
        pendente={pendente}
        criar={(nome, fim) => rodar(() => criarDepartamento(nome), (r) => (fim(), abrir(r)))}
      />

      {departamentos.length === 0 && (
        <Vazio>Nenhum departamento ainda. Comece por um lugar da casa: Salão, Cozinha geral, Estoque, Bar, Banheiro, Delivery.</Vazio>
      )}

      {dep && folha && (
        <section aria-label={dep.nome} className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4">
          <CabecalhoDoDepartamento dep={dep} podeMudar={podeMudar} rodar={rodar} pendente={pendente} />
          <Fileira rotulo={`Subdepartamentos de ${dep.nome}`}>
            {dep.folhas.map((f) => (
              <Chip key={f.id} href={irPara(f.id)} atual={f.id === folha.id} pequeno>
                {f.nome ?? "Geral"}
                <span className="ml-1.5 text-xs opacity-70">{f.tarefas}</span>
              </Chip>
            ))}
            {podeMudar && (
              <Criar
                rotulo="Subdepartamento"
                exemplo="Ex.: Caixa"
                pequeno
                pendente={pendente}
                criar={(nome, fim) => rodar(() => criarSubdepartamento(dep.id, nome), (r) => (fim(), abrir(r)))}
              />
            )}
          </Fileira>
          <Folha
            key={folha.id}
            folha={folha}
            geral={dep.folhas[0].id}
            totalDoDepartamento={dep.folhas.reduce((s, f) => s + f.tarefas, 0)}
            departamentoId={dep.id}
            podeMudar={podeMudar}
            rodar={rodar}
            pendente={pendente}
          />
        </section>
      )}
    </Pagina>
  );
}

/**
 * Os departamentos num cartão, um símbolo por departamento, o aberto em
 * destaque. "Novo departamento" abre o campo de nome embaixo da grade.
 */
function GradeDeDepartamentos({
  departamentos,
  atual,
  podeMudar,
  pendente,
  criar,
}: {
  departamentos: Departamento[];
  atual: number | null;
  podeMudar: boolean;
  pendente: boolean;
  criar: (nome: string, fim: () => void) => void;
}) {
  const [nome, setNome] = useState<string | null>(null);
  if (departamentos.length === 0 && !podeMudar) return null;
  return (
    <nav aria-label="Departamentos" className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
      <div className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap">
        {departamentos.map((d) => {
          const aberto = d.id === atual;
          return (
            <Link
              key={d.id}
              href={irPara(d.folhas[0]?.id ?? 0)}
              aria-current={aberto ? "page" : undefined}
              className={`${TILE} sm:w-32 ${aberto ? TILE_EM_DESTAQUE : "text-[var(--foreground)] hover:bg-[var(--muted)]"}`}
            >
              <LayoutList aria-hidden className={`${ICONE_DO_TILE} ${aberto ? "" : "text-[var(--primary)]"}`} />
              {d.nome}
            </Link>
          );
        })}
        {podeMudar && <BotaoQuadrado icone={Plus} texto="Novo departamento" ativo={nome !== null} onClick={() => setNome(nome === null ? "" : null)} />}
      </div>
      {nome !== null && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            criar(nome, () => setNome(null));
          }}
          className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] p-3"
        >
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={60}
            placeholder="Ex.: Estoque"
            aria-label="Nome do novo departamento"
            autoFocus
            className="h-10 min-w-0 flex-1"
          />
          <Button type="submit" className="h-10" disabled={pendente || nome.trim().length < 2}>
            Criar
          </Button>
          <Button type="button" variant="ghost" className="h-10" onClick={() => setNome(null)}>
            Cancelar
          </Button>
        </form>
      )}
    </nav>
  );
}

/** Uma fileira de botões redondos que rola de lado no celular, com o escolhido sempre à vista. */
function Fileira({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const caixa = useRef<HTMLElement>(null);
  useEffect(() => {
    caixa.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  return (
    <nav ref={caixa} aria-label={rotulo} className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
      {children}
    </nav>
  );
}

function Chip({ href, atual, pequeno = false, children }: { href: string; atual: boolean; pequeno?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={atual ? "page" : undefined}
      className={`flex shrink-0 items-center rounded-full border font-medium ${pequeno ? "h-9 px-3 text-sm" : "h-10 px-4 text-sm"} ${
        atual ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]"
      }`}
    >
      {children}
    </Link>
  );
}

/** O botão "+ Novo" da fileira, que vira um campo de nome no lugar. */
function Criar({ rotulo, exemplo, pequeno = false, pendente, criar }: { rotulo: string; exemplo: string; pequeno?: boolean; pendente: boolean; criar: (nome: string, fim: () => void) => void }) {
  const [nome, setNome] = useState<string | null>(null);
  if (nome === null) {
    return (
      <button
        type="button"
        onClick={() => setNome("")}
        className={`flex shrink-0 items-center gap-1 rounded-full border border-dashed border-[var(--border)] font-medium text-[var(--primary)] hover:bg-[var(--muted)] ${pequeno ? "h-9 px-3 text-sm" : "h-10 px-4 text-sm"}`}
      >
        <Plus aria-hidden className="size-4" />
        {rotulo}
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        criar(nome, () => setNome(null));
      }}
      className="flex shrink-0 items-center gap-1.5"
    >
      <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} placeholder={exemplo} aria-label={rotulo} autoFocus className="h-9 w-40" />
      <Button type="submit" className="h-9" disabled={pendente || nome.trim().length < 2}>
        Criar
      </Button>
      <Button type="button" variant="ghost" className="h-9" onClick={() => setNome(null)}>
        Cancelar
      </Button>
    </form>
  );
}

/** Um nome com lápis e lixeira; o lápis troca o nome no lugar. */
function NomeEditavel({
  nome,
  rotulo,
  podeMudar,
  pendente,
  salvar,
  apagar,
  className,
}: {
  nome: string;
  rotulo: string;
  podeMudar: boolean;
  pendente: boolean;
  salvar?: (novo: string, fim: () => void) => void;
  /** A pergunta e o que fazer quando confirma: a confirmação aparece na própria linha. */
  apagar?: { pergunta: string; aoConfirmar: () => void };
  className: string;
}) {
  const [novo, setNovo] = useState<string | null>(null);
  if (novo !== null && salvar) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          salvar(novo, () => setNovo(null));
        }}
        className="flex min-w-0 flex-1 flex-wrap gap-2"
      >
        <Input value={novo} onChange={(e) => setNovo(e.target.value)} maxLength={60} aria-label={`Nome do ${rotulo}`} autoFocus className="h-9 min-w-0 flex-1" />
        <Button type="submit" className="h-9" disabled={pendente || novo.trim().length < 2}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" className="h-9" onClick={() => setNovo(null)}>
          Cancelar
        </Button>
      </form>
    );
  }
  return (
    <>
      <span className={className}>{nome}</span>
      {podeMudar && salvar && (
        <button type="button" className={BOTAO_ICONE} onClick={() => setNovo(nome)} aria-label={`Renomear o ${rotulo}`}>
          <Pencil aria-hidden className="size-4" />
        </button>
      )}
      {podeMudar && apagar && (
        <ConfirmarNaLinha pergunta={apagar.pergunta} aoConfirmar={apagar.aoConfirmar} pendente={pendente}>
          {(abrir) => (
            <button type="button" className={BOTAO_ICONE} disabled={pendente} onClick={abrir} aria-label={`Apagar o ${rotulo}`}>
              <Trash2 aria-hidden className="size-4" />
            </button>
          )}
        </ConfirmarNaLinha>
      )}
    </>
  );
}

function CabecalhoDoDepartamento({ dep, podeMudar, rodar, pendente }: { dep: Departamento; podeMudar: boolean; rodar: Rodar; pendente: boolean }) {
  const router = useRouter();
  const total = dep.folhas.reduce((s, f) => s + f.tarefas, 0);
  const subs = dep.folhas.filter((f) => f.nome !== null).length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <NomeEditavel
        nome={dep.nome}
        rotulo="departamento"
        className="mr-1 text-base font-semibold"
        podeMudar={podeMudar}
        pendente={pendente}
        salvar={(novo, fim) => rodar(() => renomearDepartamento(dep.id, novo), fim)}
        apagar={{
          pergunta: `Apagar o departamento "${dep.nome}", ${plural(subs, "o subdepartamento", "os subdepartamentos")} e ${plural(total, "a tarefa", "as tarefas")}?`,
          aoConfirmar: () => rodar(() => apagarDepartamento(dep.id), () => router.push("/admin/operacional/checklists")),
        }}
      />
    </div>
  );
}

/** A folha aberta. `geral` é a folha do departamento todo, para onde volta ao apagar um subdepartamento. */
function Folha({
  folha,
  geral,
  totalDoDepartamento,
  departamentoId,
  podeMudar,
  rodar,
  pendente,
}: {
  folha: FolhaDeChecklist;
  geral: number;
  totalDoDepartamento: number;
  departamentoId: number;
  podeMudar: boolean;
  rodar: Rodar;
  pendente: boolean;
}) {
  const router = useRouter();
  const total = folha.momentos.reduce((s, m) => s + m.tarefas.length, 0);
  return (
    <div className="space-y-3">
      {/* A folha Geral não repete o nome: o departamento já aparece logo
          acima. No subdepartamento, o nome é só o dele ("Caixa"), e não
          "Cozinha / Caixa": era esse texto que o renomear gravava. */}
      <div className="flex flex-wrap items-center gap-1 border-t border-[var(--border)] pt-3">
        {folha.sub !== null && (
          <NomeEditavel
            nome={folha.sub}
            rotulo="subdepartamento"
            className="mr-1 font-semibold"
            podeMudar={podeMudar}
            pendente={pendente}
            salvar={(novo, fim) => rodar(() => renomearSubdepartamento(folha.id, novo), fim)}
            apagar={{
              pergunta: `Apagar "${folha.sub}" e ${plural(total, "a tarefa", "as tarefas")}?`,
              aoConfirmar: () => rodar(() => apagarSubdepartamento(folha.id), () => router.push(irPara(geral))),
            }}
          />
        )}
        <span className="text-sm text-[var(--muted-foreground)]">{plural(total, "tarefa", "tarefas")}</span>
      </div>
      {/* As impressões numa fileira de símbolos: a folha aberta em destaque. */}
      <CartaoDeBotoes>
        {total > 0 && <BotaoQuadrado icone={Printer} texto="Imprimir esta folha" tom="primario" href={imprimir(`folha=${folha.id}`)} baixar />}
        {totalDoDepartamento > 0 && (
          <BotaoQuadrado icone={FileText} texto="Imprimir o departamento" href={imprimir(`departamento=${departamentoId}`)} baixar />
        )}
        <BotaoQuadrado icone={LayoutList} texto="Imprimir todas" href={imprimir("")} baixar />
      </CartaoDeBotoes>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {folha.momentos.map((m) => (
          <CartaoDoMomento key={m.chave} folhaId={folha.id} momento={m} podeMudar={podeMudar} rodar={rodar} pendente={pendente} />
        ))}
      </div>
    </div>
  );
}

function CartaoDoMomento({
  folhaId,
  momento: m,
  podeMudar,
  rodar,
  pendente,
}: {
  folhaId: number;
  momento: FolhaDeChecklist["momentos"][number];
  podeMudar: boolean;
  rodar: Rodar;
  pendente: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <h3 className="font-semibold">{m.nome}</h3>
        <span className="text-xs text-[var(--muted-foreground)]">{plural(m.tarefas.length, "tarefa", "tarefas")}</span>
        {m.tarefas.length > 0 && (
          <a
            href={imprimir(`folha=${folhaId}&momento=${m.chave}`)}
            download
            className={`${BOTAO_ICONE} ml-auto`}
            aria-label={`Imprimir só ${m.nome.toLowerCase()}`}
            title={`Imprimir só ${m.nome.toLowerCase()}`}
          >
            <Printer aria-hidden className="size-4" />
          </a>
        )}
      </div>
      {m.tarefas.length === 0 && <p className="px-3 py-3 text-sm text-[var(--muted-foreground)]">Nenhuma tarefa ainda.</p>}
      <ul className="divide-y divide-[var(--border)]">
        {m.tarefas.map((t, i) => (
          <LinhaDaTarefa key={t.id} folhaId={folhaId} tarefa={t} primeira={i === 0} ultima={i === m.tarefas.length - 1} podeMudar={podeMudar} rodar={rodar} pendente={pendente} />
        ))}
      </ul>
      {podeMudar && <NovaTarefa folhaId={folhaId} momento={m.chave} rodar={rodar} pendente={pendente} />}
    </div>
  );
}

function LinhaDaTarefa({
  folhaId,
  tarefa: t,
  primeira,
  ultima,
  podeMudar,
  rodar,
  pendente,
}: {
  folhaId: number;
  tarefa: FolhaDeChecklist["momentos"][number]["tarefas"][number];
  primeira: boolean;
  ultima: boolean;
  podeMudar: boolean;
  rodar: Rodar;
  pendente: boolean;
}) {
  const [editando, setEditando] = useState<{ texto: string; momento: Momento } | null>(null);

  if (editando) {
    return (
      <li className="px-3 py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            rodar(() => salvarTarefaDoChecklist(t.id, { listaId: folhaId, ...editando }), () => setEditando(null));
          }}
          className="space-y-2"
        >
          <Input value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} maxLength={200} aria-label="Tarefa" autoFocus className="h-10" />
          <div className="flex flex-wrap gap-2">
            <select value={editando.momento} onChange={(e) => setEditando({ ...editando, momento: e.target.value as Momento })} className="field h-9 w-auto" aria-label="Momento">
              {MOMENTOS.map((m) => (
                <option key={m.chave} value={m.chave}>
                  {m.nome}
                </option>
              ))}
            </select>
            <Button type="submit" className="h-9" disabled={pendente || editando.texto.trim().length < 2}>
              Salvar
            </Button>
            <Button type="button" variant="outline" className="h-9" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <ConfirmarNaLinha pergunta={`Apagar "${t.texto}"?`} aoConfirmar={() => rodar(() => apagarTarefaDoChecklist(t.id))} pendente={pendente}>
              {(abrir) => (
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto h-9 gap-1.5"
                  style={{ color: "var(--destructive)" }}
                  disabled={pendente}
                  onClick={abrir}
                >
                  <Trash2 aria-hidden className="size-4" />
                  Apagar
                </Button>
              )}
            </ConfirmarNaLinha>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1 py-0.5 pr-1 pl-3">
      <span className="min-w-0 flex-1 py-1.5 text-sm">{t.texto}</span>
      {podeMudar && (
        <>
          <button type="button" className={BOTAO_ICONE} disabled={primeira || pendente} onClick={() => rodar(() => moverTarefaDoChecklist(t.id, -1))} aria-label="Subir">
            <ArrowUp aria-hidden className="size-4" />
          </button>
          <button type="button" className={BOTAO_ICONE} disabled={ultima || pendente} onClick={() => rodar(() => moverTarefaDoChecklist(t.id, 1))} aria-label="Descer">
            <ArrowDown aria-hidden className="size-4" />
          </button>
          <button type="button" className={BOTAO_ICONE} onClick={() => setEditando({ texto: t.texto, momento: t.momento })} aria-label={`Editar "${t.texto}"`}>
            <Pencil aria-hidden className="size-4" />
          </button>
        </>
      )}
    </li>
  );
}

/** A linha de adicionar no pé do momento: digita e Enter, e já pode digitar a próxima. */
function NovaTarefa({ folhaId, momento, rodar, pendente }: { folhaId: number; momento: Momento; rodar: Rodar; pendente: boolean }) {
  const [texto, setTexto] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarTarefaDoChecklist(null, { listaId: folhaId, momento, texto }), () => setTexto(""));
      }}
      className="flex gap-2 border-t border-[var(--border)] bg-[var(--background)] p-2"
    >
      <Input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={200}
        placeholder="Nova tarefa"
        aria-label={`Nova tarefa ${momento === "ABERTURA" ? "na abertura" : "no fechamento"}`}
        className="h-10 min-w-0 flex-1"
      />
      <Button type="submit" className="h-10 gap-1" disabled={pendente || texto.trim().length < 2}>
        <Plus aria-hidden className="size-4" />
        Adicionar
      </Button>
    </form>
  );
}
