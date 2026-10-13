"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { useAviso } from "@/components/aviso-do-topo";
import { CabecalhoDaPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import {
  atualizarTarefa,
  cancelarTarefa,
  comentar,
  concluirTarefa,
  excluirTarefa,
  reabrirTarefa,
  restaurarTarefa,
} from "@/lib/actions/tarefas";
import { plural } from "@/lib/format";
import {
  MOTIVOS_CANCELAMENTO,
  MOTIVO_CANCELAMENTO_LABEL,
  PRIORIDADES,
  PRIORIDADE_LABEL,
  STATUS_TAREFA_LABEL,
} from "@/lib/tarefas-labels";
import { podeNaTarefa } from "@/lib/tarefas-permissoes";
import { corDoTom, type Tom } from "@/lib/tom";
import type {
  MotivoCancelamento,
  PapelProjeto,
  PrioridadeTarefa,
  StatusTarefa,
} from "@/generated/prisma/client";

import { MenuDaTarefa, type ItensDoMenu } from "./menu-da-tarefa";
import { VincularPai } from "./vincular-pai";

export type LinhaDoTempo = {
  chave: string;
  /** ISO, só para ordenar. O que a tela mostra é `quando`. */
  em: string;
  quando: string;
  quem: string;
  tipo: "fala" | "sistema";
  texto: string;
  removido: boolean;
};

type TarefaDetalhe = {
  id: number;
  titulo: string;
  descricao: string | null;
  status: StatusTarefa;
  prioridade: PrioridadeTarefa;
  colunaNome: string;
  responsavelId: number | null;
  prazo: string | null;
  situacaoPrazo: { texto: string; tom: Tom; atrasada: boolean } | null;
  documentoUrl: string | null;
  aguardandoDescricao: string | null;
  qtdAdiamentos: number;
  motivoCancelamento: MotivoCancelamento | null;
  textoCancelamento: string | null;
  fixada: boolean;
  subtarefasAbertas: number;
};

/** O que o menu ⋯ e o bloco de tarefa pai precisam, já decidido na página. */
export type DadosDoMenu = {
  itens: Omit<ItensDoMenu, "cancelar" | "excluir">;
  paiAtual: { id: number; titulo: string } | null;
  candidatosAPai: { id: number; titulo: string }[];
};

/**
 * A ficha da tarefa, e o que dá para fazer com ela.
 *
 * Um formulário só para os campos, e não um botão de salvar por campo: quem
 * abre esta tela normalmente muda duas ou três coisas de uma vez — o prazo e
 * quem faz, a prioridade e o título. O histórico registra cada campo
 * separadamente de qualquer jeito, então salvar junto não perde informação.
 */
export function Detalhe({
  voltar,
  contexto,
  tarefa,
  membros,
  linhas,
  papel,
  souEu,
  criadaPorMim,
  menu,
  secoes,
}: {
  /** O quadro da tarefa: o "‹ voltar" do cabeçalho. */
  voltar: { href: string; texto: string };
  /** O número, quem criou e a tarefa pai: a linha embaixo do título. */
  contexto: ReactNode;
  tarefa: TarefaDetalhe;
  membros: { id: number; nome: string }[];
  linhas: LinhaDoTempo[];
  papel: PapelProjeto | null;
  souEu: number;
  criadaPorMim: boolean;
  menu: DadosDoMenu;
  /** Subtarefas, etiquetas e anexos: entram entre os botões e a ficha. */
  secoes: ReactNode;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const mostrar = useAviso();

  const [titulo, setTitulo] = useState(tarefa.titulo);
  const [descricao, setDescricao] = useState(tarefa.descricao ?? "");
  const [prioridade, setPrioridade] = useState<PrioridadeTarefa>(tarefa.prioridade);
  const [responsavelId, setResponsavelId] = useState<number | null>(tarefa.responsavelId);
  const [prazo, setPrazo] = useState(tarefa.prazo ?? "");
  const [documentoUrl, setDocumentoUrl] = useState(tarefa.documentoUrl ?? "");

  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoCancelamento>("NAO_E_MAIS_NECESSARIA");
  const [textoMotivo, setTextoMotivo] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [texto, setTexto] = useState("");

  const ehMinha = tarefa.responsavelId === souEu;
  const podeEditar = podeNaTarefa(papel, "editar", ehMinha);
  const podeConcluir = podeNaTarefa(papel, "concluir", ehMinha);
  const podeCancelar = podeNaTarefa(papel, "cancelar", ehMinha);
  const podeExcluir = podeNaTarefa(papel, "excluir", criadaPorMim);
  const podeComentar = podeNaTarefa(papel, "comentar");

  function rodar(acao: () => Promise<{ ok: boolean; message?: string }>, aviso?: string) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      if (aviso) mostrar(aviso);
      setCancelando(false);
      setExcluindo(false);
      setVinculando(false);
      router.refresh();
    });
  }

  const salvar = () =>
    rodar(() =>
      atualizarTarefa(tarefa.id, {
        titulo,
        descricao: descricao.trim() || null,
        prioridade,
        responsavelId,
        prazo: prazo === "" ? null : prazo,
        documentoUrl: documentoUrl.trim() || null,
      }),
      "Salvo",
    );

  /* Na lixeira, a tarefa some desta tela (ela só abre as que estão fora da
     lixeira): volta para o quadro, com o Desfazer na faixa de baixo. */
  const excluir = () => {
    setErro(null);
    startTransition(async () => {
      const r = await excluirTarefa(tarefa.id);
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      router.push(voltar.href);
      mostrar(`T-${tarefa.id} foi para a lixeira`, {
        desfazer: async () => {
          const v = await restaurarTarefa(tarefa.id);
          if (v.ok) router.push(`/admin/tarefas/t/${tarefa.id}`);
          else mostrar(v.message ?? "Não deu para desfazer.");
        },
      });
    });
  };

  return (
    <div className="space-y-8">
      <section>
        <CabecalhoDaPagina titulo={tarefa.titulo} voltar={voltar} subtitulo={contexto} />
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="selo" style={{ color: "var(--muted-foreground)" }}>
            {tarefa.colunaNome}
          </span>
          {tarefa.status !== "ABERTA" && (
            <span
              className="selo"
              style={{ color: corDoTom(STATUS_TAREFA_LABEL[tarefa.status].tom) }}
            >
              {STATUS_TAREFA_LABEL[tarefa.status].texto}
            </span>
          )}
          {tarefa.situacaoPrazo && (
            <span
              className="text-sm"
              style={{ color: corDoTom(tarefa.situacaoPrazo.tom) }}
            >
              {tarefa.situacaoPrazo.texto}
            </span>
          )}
        </div>

        {tarefa.aguardandoDescricao && (
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            esperando: {tarefa.aguardandoDescricao}
          </p>
        )}

        {/* RN-024: três adiamentos ou mais é o sinal que o gestor precisa ver.
            Não acusa ninguém — diz o número e deixa a conversa acontecer. */}
        {tarefa.qtdAdiamentos >= 3 && (
          <p className="mt-1 text-xs" style={{ color: corDoTom("pendente") }}>
            o prazo desta tarefa já foi adiado {tarefa.qtdAdiamentos} vezes
          </p>
        )}

        {tarefa.status === "CANCELADA" && tarefa.motivoCancelamento && (
          <p className="mt-1 text-sm">
            Cancelada: {MOTIVO_CANCELAMENTO_LABEL[tarefa.motivoCancelamento]}
            {tarefa.textoCancelamento ? ` — ${tarefa.textoCancelamento}` : ""}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {tarefa.status === "ABERTA" && podeConcluir && (
          <Button
            type="button"
            size="sm"
            disabled={pendente}
            onClick={() => rodar(() => concluirTarefa(tarefa.id))}
          >
            Concluir
          </Button>
        )}
        {tarefa.status !== "ABERTA" && podeConcluir && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pendente}
            onClick={() => rodar(() => reabrirTarefa(tarefa.id))}
          >
            Reabrir
          </Button>
        )}
        {/* Concluir com subtarefa aberta não é barrado; mas a decisão tem de
            ser consciente, então o número fica ao lado do botão. */}
        {tarefa.status === "ABERTA" && tarefa.subtarefasAbertas > 0 && (
          <span className="text-xs" style={{ color: corDoTom("pendente") }}>
            {plural(tarefa.subtarefasAbertas, "subtarefa aberta", "subtarefas abertas")}
          </span>
        )}
        <div className="ml-auto">
          <MenuDaTarefa
            tarefaId={tarefa.id}
            fixada={tarefa.fixada}
            itens={{
              ...menu.itens,
              cancelar: tarefa.status === "ABERTA" && podeCancelar,
              excluir: podeExcluir,
            }}
            rodar={rodar}
            aoErro={setErro}
            aoCancelar={() => {
              setExcluindo(false);
              setVinculando(false);
              setCancelando(true);
            }}
            aoExcluir={() => {
              setCancelando(false);
              setVinculando(false);
              setExcluindo(true);
            }}
            aoVincular={() => {
              setCancelando(false);
              setExcluindo(false);
              setVinculando(true);
            }}
          />
        </div>
      </div>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {/* Cancelar pede o motivo de uma lista (RF-176). O "Não farei" do
          TickTick não pergunta nada, e um ano depois ninguém sabe se as
          tarefas morreram por falta de gente, de dinheiro ou por engano. */}
      {cancelando && (
        <div className="space-y-2 rounded border border-dashed border-[var(--border)] p-2.5">
          <p className="text-sm font-medium">Por que esta tarefa não vai acontecer?</p>
          <select
            className="field text-sm"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value as MotivoCancelamento)}
            aria-label="Motivo do cancelamento"
          >
            {MOTIVOS_CANCELAMENTO.map((m) => (
              <option key={m} value={m}>
                {MOTIVO_CANCELAMENTO_LABEL[m]}
              </option>
            ))}
          </select>
          {motivo === "OUTRO" && (
            <input
              className="field text-sm"
              value={textoMotivo}
              onChange={(e) => setTextoMotivo(e.target.value)}
              placeholder="em uma linha"
              maxLength={500}
            />
          )}
          <p className="text-xs text-[var(--muted-foreground)]">
            O cartão fica onde está, marcado — não vai para CONCLUÍDO. Ele não
            foi feito, e misturar os dois estragaria a única conta que aquela
            coluna serve para fazer.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pendente}
              onClick={() =>
                rodar(() =>
                  cancelarTarefa(tarefa.id, {
                    motivo,
                    texto: textoMotivo.trim() || null,
                  }),
                )
              }
            >
              Cancelar a tarefa
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pendente}
              onClick={() => setCancelando(false)}
            >
              Voltar
            </Button>
          </div>
        </div>
      )}

      {excluindo && (
        <div className="card-alerta space-y-2 p-2.5">
          <p className="text-sm font-medium">Mandar T-{tarefa.id} para a lixeira?</p>
          <p className="text-xs">
            Ela some do quadro e volta de lá por 30 dias. Depois disso sai de
            vez. O histórico do que já aconteceu fica.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pendente}
              onClick={excluir}
            >
              Excluir
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pendente}
              onClick={() => setExcluindo(false)}
            >
              Voltar
            </Button>
          </div>
        </div>
      )}

      {vinculando && (
        <VincularPai
          tarefaId={tarefa.id}
          paiAtual={menu.paiAtual}
          candidatos={menu.candidatosAPai}
          pendente={pendente}
          rodar={rodar}
          aoFechar={() => setVinculando(false)}
        />
      )}

      {secoes}

      {/* Na folha impressa, a ficha sai como texto: um formulário impresso
          mostra caixas, e quem lê o papel quer o conteúdo. */}
      <section className="hidden space-y-1 text-sm print:block">
        <p>Quem faz: {membros.find((m) => m.id === tarefa.responsavelId)?.nome ?? "sem dono"}</p>
        <p>Prazo: {tarefa.prazo ? tarefa.prazo.split("-").reverse().join("/") : "sem prazo"}</p>
        <p>Prioridade: {PRIORIDADE_LABEL[tarefa.prioridade].texto}</p>
        {tarefa.descricao && <p className="whitespace-pre-wrap">{tarefa.descricao}</p>}
      </section>

      {podeEditar && (
        <section className="print:hidden">
          <h2 className="section-label">A ficha</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              salvar();
            }}
          >
            <div>
              <label className="label" htmlFor="t-titulo">
                O que precisa ser feito
              </label>
              <input
                id="t-titulo"
                className="field"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                maxLength={250}
                required
              />
            </div>

            <div>
              <label className="label" htmlFor="t-descricao">
                Detalhe <span className="font-normal">(opcional)</span>
              </label>
              <textarea
                id="t-descricao"
                className="field min-h-24"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="t-dono">
                  Quem faz
                </label>
                <select
                  id="t-dono"
                  className="field"
                  value={responsavelId ?? ""}
                  onChange={(e) =>
                    setResponsavelId(e.target.value === "" ? null : Number(e.target.value))
                  }
                >
                  <option value="">sem dono</option>
                  {membros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="t-prazo">
                  Prazo
                </label>
                <input
                  id="t-prazo"
                  type="date"
                  className="field"
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                />
              </div>

              <div>
                <label className="label" htmlFor="t-prioridade">
                  Prioridade
                </label>
                <select
                  id="t-prioridade"
                  className="field"
                  value={prioridade}
                  onChange={(e) => setPrioridade(e.target.value as PrioridadeTarefa)}
                >
                  {PRIORIDADES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORIDADE_LABEL[p].texto}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label" htmlFor="t-doc">
                  Documento <span className="font-normal">(link)</span>
                </label>
                <input
                  id="t-doc"
                  type="url"
                  className="field"
                  value={documentoUrl}
                  onChange={(e) => setDocumentoUrl(e.target.value)}
                  placeholder="https://…"
                />
                <p className="hint">É o que a coluna DOCUMENTADO exige.</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={pendente}>
                {pendente ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </section>
      )}

      <section id="historico">
        <h2 className="section-label">O que aconteceu</h2>

        <ul className="mt-3 space-y-2">
          {linhas.map((l) => (
            <li
              key={l.chave}
              className={
                l.tipo === "fala"
                  ? "card p-2.5"
                  : "border-l-2 border-[var(--border)] py-0.5 pl-2.5"
              }
            >
              <p
                className={
                  l.tipo === "fala" ? "text-sm" : "text-xs text-[var(--muted-foreground)]"
                }
              >
                {l.tipo === "sistema" ? (
                  <>
                    {l.quem} {l.texto}
                  </>
                ) : (
                  <span className={l.removido ? "italic opacity-60" : ""}>{l.texto}</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted-foreground)] opacity-80">
                {l.tipo === "fala" ? `${l.quem} · ${l.quando}` : l.quando}
              </p>
            </li>
          ))}
        </ul>

        {podeComentar && (
          <form
            className="mt-3 space-y-2 print:hidden"
            onSubmit={(e) => {
              e.preventDefault();
              const t = texto.trim();
              if (t === "") return;
              rodar(async () => {
                const r = await comentar(tarefa.id, { texto: t });
                if (r.ok) setTexto("");
                return r;
              });
            }}
          >
            <label className="label sr-only" htmlFor="t-comentario">
              Comentar
            </label>
            <textarea
              id="t-comentario"
              className="field min-h-16"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="O fornecedor ligou, vem na terça…"
              maxLength={5000}
            />
            <Button type="submit" size="sm" disabled={pendente || texto.trim() === ""}>
              Comentar
            </Button>
          </form>
        )}

        <p className="hint mt-3">
          {plural(linhas.length, "registro", "registros")} — histórico e conversa
          na mesma linha do tempo. Nada daqui é editado ou apagado, nem por quem
          administra.
        </p>
      </section>
    </div>
  );
}
