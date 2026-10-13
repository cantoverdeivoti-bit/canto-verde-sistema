"use client";

import { ListChecks, Paperclip, Pin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { criarTarefa, moverTarefa } from "@/lib/actions/tarefas";
import { plural } from "@/lib/format";
import { PRIORIDADE_LABEL, STATUS_TAREFA_LABEL } from "@/lib/tarefas-labels";
import { estouroDeWip, podeMover, type TarefaEmMovimento } from "@/lib/tarefas-fluxo";
import { podeNaTarefa } from "@/lib/tarefas-permissoes";
import { corDoTom, type Tom } from "@/lib/tom";
import type {
  EstadoColuna,
  PapelProjeto,
  PrioridadeTarefa,
  StatusTarefa,
} from "@/generated/prisma/client";

export type ColunaRow = {
  id: number;
  nome: string;
  estado: EstadoColuna;
  wipPorPessoa: number | null;
  alertaLaranjaDias: number | null;
  alertaVermelhoDias: number | null;
};

export type CartaoRow = {
  id: number;
  titulo: string;
  colunaId: number;
  status: StatusTarefa;
  prioridade: PrioridadeTarefa;
  responsavel: { id: number; nome: string; iniciais: string } | null;
  /** Já resolvido no servidor — "hoje", "faltam 5 dias", "atrasada há 2 dias". */
  prazo: { texto: string; tom: Tom; atrasada: boolean } | null;
  diasNaColuna: number | null;
  comentarios: number;
  anexos: number;
  fixada: boolean;
  /** Feitas e total, sem contar as canceladas. Nulo = sem subtarefa. */
  subtarefas: { feitas: number; total: number } | null;
  etiquetas: string[];
  aguardando: string | null;
  /* Os três abaixo não aparecem na tela: servem para o menu "Mover" rodar a
     mesma máquina de estados que o servidor vai rodar, e já mostrar qual
     caminho está fechado antes de a pessoa tentar. */
  temResponsavel: boolean;
  aguardandoPreenchido: boolean;
  temDocumento: boolean;
};

type Membro = { id: number; nome: string };

/**
 * O quadro: colunas lado a lado, uma por etapa.
 *
 * No celular vira um carrossel — uma coluna por tela, deslizando para os lados
 * (RNF-01: tudo com uma mão). No computador as oito ficam visíveis com rolagem
 * horizontal.
 *
 * Não há arrastar. É deliberado: `draggable` não funciona em toque, e o
 * celular é a superfície principal. O menu "Mover" resolve nas duas, e é onde
 * as perguntas da máquina de estados cabem naturalmente — "quem vai fazer?",
 * "esperando o quê?" — em vez de virarem um erro depois que o cartão já saiu
 * do lugar. Arrastar entra depois, no computador, por cima da mesma ação.
 */
export function Quadro({
  projetoId,
  colunas,
  cartoes,
  membros,
  papel,
  souEu,
}: {
  projetoId: number;
  colunas: ColunaRow[];
  cartoes: CartaoRow[];
  membros: Membro[];
  papel: PapelProjeto | null;
  souEu: number;
}) {
  const porColuna = new Map<number, CartaoRow[]>();
  for (const c of colunas) porColuna.set(c.id, []);
  for (const t of cartoes) porColuna.get(t.colunaId)?.push(t);

  return (
    <div className="mt-6 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4 sm:snap-none">
      {colunas.map((coluna) => (
        <Coluna
          key={coluna.id}
          projetoId={projetoId}
          coluna={coluna}
          colunas={colunas}
          cartoes={porColuna.get(coluna.id) ?? []}
          membros={membros}
          papel={papel}
          souEu={souEu}
        />
      ))}
    </div>
  );
}

function Coluna({
  projetoId,
  coluna,
  colunas,
  cartoes,
  membros,
  papel,
  souEu,
}: {
  projetoId: number;
  coluna: ColunaRow;
  colunas: ColunaRow[];
  cartoes: CartaoRow[];
  membros: Membro[];
  papel: PapelProjeto | null;
  souEu: number;
}) {
  const podeCriar = podeNaTarefa(papel, "criarTarefa", true);

  /* O estouro é por PESSOA, não por coluna (RF-117): cinco cartões de cinco
     gente diferente não é ninguém sobrecarregado. Contado aqui em vez de no
     servidor porque os cartões da coluna já estão todos na mão. */
  const porPessoa = new Map<number, number>();
  for (const c of cartoes) {
    if (c.responsavel && c.status === "ABERTA") {
      porPessoa.set(c.responsavel.id, (porPessoa.get(c.responsavel.id) ?? 0) + 1);
    }
  }
  /* `estouroDeWip` e não a comparação escrita aqui: a régua do limite é uma
     regra, e regra repetida na tela é regra que diverge do servidor no dia em
     que uma das duas mudar. `bloquear: false` porque esta contagem só pinta a
     coluna — quem barra o movimento é a ação, com o modo do projeto. */
  const sobrecarregados = [...porPessoa.values()].filter((n) =>
    estouroDeWip({ limite: coluna.wipPorPessoa, jaTem: n, bloquear: false }),
  ).length;

  return (
    <section className="w-[85vw] flex-none snap-start sm:w-64">
      <div className="flex items-baseline gap-2">
        <h2 className="section-label">{coluna.nome}</h2>
        <span className="num-display text-xs text-[var(--muted-foreground)]">
          {cartoes.length}
        </span>
      </div>

      {sobrecarregados > 0 && (
        <p className="mt-1 text-xs" style={{ color: corDoTom("pendente") }}>
          {plural(sobrecarregados, "pessoa no limite", "pessoas no limite")} de{" "}
          {coluna.wipPorPessoa} nesta coluna
        </p>
      )}

      <ul className="mt-2 space-y-2">
        {cartoes.map((c) => (
          <Cartao
            key={c.id}
            cartao={c}
            coluna={coluna}
            colunas={colunas}
            membros={membros}
            papel={papel}
            souEu={souEu}
          />
        ))}
      </ul>

      {podeCriar && (
        <AdicaoRapida projetoId={projetoId} colunaId={coluna.id} souEu={souEu} papel={papel} />
      )}

      {cartoes.length === 0 && !podeCriar && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">vazia</p>
      )}
    </section>
  );
}

/**
 * O "+" do topo da coluna: título, Enter, pronto (RF-001).
 *
 * O cartão nasce na coluna em que o campo foi usado (RF-003), e o campo fica
 * aberto para o próximo (RF-004) — quem está despejando o que tem na cabeça
 * digita cinco seguidos sem tocar em mais nada.
 *
 * Só título. Dono, prazo e prioridade são o detalhe da tarefa, e pedi-los aqui
 * transformaria cinco segundos em trinta — que é o que faz a ideia se perder
 * no meio do serviço.
 */
function AdicaoRapida({
  projetoId,
  colunaId,
  souEu,
  papel,
}: {
  projetoId: number;
  colunaId: number;
  souEu: number;
  papel: PapelProjeto | null;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  function criar() {
    const texto = titulo.trim();
    if (texto === "") return;
    setErro(null);
    startTransition(async () => {
      const r = await criarTarefa({
        projetoId,
        colunaId,
        titulo: texto,
        // Fora do BACKLOG a tarefa precisa de dono, e quem digita é o palpite
        // certo — é o que RN-010 manda sugerir. Quem não for o dono certo,
        // troca no detalhe.
        responsavelId: souEu,
        prioridade: "NENHUMA",
      });
      if (!r.ok) return setErro(r.message);
      setTitulo("");
      router.refresh();
    });
  }

  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        criar();
      }}
    >
      <input
        className="field text-sm"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="+ nova tarefa"
        maxLength={250}
        disabled={pendente}
        aria-label={`Nova tarefa${papel === "EXECUTOR" ? " para você" : ""}`}
      />
      {erro && (
        <p role="alert" className="error">
          {erro}
        </p>
      )}
    </form>
  );
}

/** O cartão do kanban, e o menu que o move. */
function Cartao({
  cartao,
  coluna,
  colunas,
  membros,
  papel,
  souEu,
}: {
  cartao: CartaoRow;
  coluna: ColunaRow;
  colunas: ColunaRow[];
  membros: Membro[];
  papel: PapelProjeto | null;
  souEu: number;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [aberto, setAberto] = useState(false);
  const [destinoId, setDestinoId] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // O rascunho do que a máquina de estados pedir no caminho.
  const [responsavelId, setResponsavelId] = useState<number | null>(null);
  const [aguardandoDescricao, setAguardandoDescricao] = useState("");
  const [aguardandoPrevisao, setAguardandoPrevisao] = useState("");
  const [documentoUrl, setDocumentoUrl] = useState("");

  const ehMinha = cartao.responsavel?.id === souEu;
  const podeMexer = podeNaTarefa(papel, "mover", ehMinha);
  const prioridade = PRIORIDADE_LABEL[cartao.prioridade];

  /** O cartão como a máquina de estados o vê, já com o rascunho aplicado. */
  const comRascunho: TarefaEmMovimento = {
    temResponsavel: cartao.temResponsavel || responsavelId !== null,
    aguardandoPreenchido:
      cartao.aguardandoPreenchido ||
      (aguardandoDescricao.trim() !== "" && aguardandoPrevisao !== ""),
    temRecorrencia: false,
    temDocumento: cartao.temDocumento || documentoUrl.trim() !== "",
    checklistPendente: 0,
    ehGestor: papel === "GESTOR",
    // O limite de WIP depende de quantas OUTRAS tarefas a pessoa tem, e isso
    // o navegador não sabe. O servidor confere e recusa com a mensagem certa.
    wip: null,
  };

  const destino = colunas.find((c) => c.id === destinoId) ?? null;
  const veredito = destino
    ? podeMover(coluna.estado, destino.estado, comRascunho)
    : null;

  function mover() {
    if (!destino) return;
    setErro(null);
    startTransition(async () => {
      const r = await moverTarefa(cartao.id, {
        colunaDestinoId: destino.id,
        responsavelId: responsavelId ?? undefined,
        aguardandoDescricao: aguardandoDescricao.trim() || undefined,
        aguardandoPrevisao: aguardandoPrevisao || undefined,
        documentoUrl: documentoUrl.trim() || undefined,
      });
      if (!r.ok) return setErro(r.message);
      setAberto(false);
      setDestinoId(null);
      setResponsavelId(null);
      setAguardandoDescricao("");
      setAguardandoPrevisao("");
      setDocumentoUrl("");
      router.refresh();
    });
  }

  /* Cor do tempo parado (RF-116). Vermelho ganha do laranja, e sem limite
     configurado o indicador some — número sem régua não diz nada. */
  const corDoTempo =
    cartao.diasNaColuna === null
      ? null
      : coluna.alertaVermelhoDias !== null &&
          cartao.diasNaColuna >= coluna.alertaVermelhoDias
        ? "var(--destructive)"
        : coluna.alertaLaranjaDias !== null &&
            cartao.diasNaColuna >= coluna.alertaLaranjaDias
          ? "var(--warn)"
          : null;

  return (
    <li className="card p-2.5">
      <div className="flex items-start gap-2">
        {cartao.fixada && (
          <Pin
            aria-label="fixada no topo"
            className="mt-0.5 size-3.5 shrink-0 text-[var(--muted-foreground)]"
          />
        )}
        {prioridade.marca && (
          <span
            className="mt-0.5 text-xs leading-none font-bold"
            style={{ color: corDoTom(prioridade.tom) }}
            aria-label={`prioridade ${prioridade.texto}`}
          >
            {prioridade.marca}
          </span>
        )}
        <Link
          href={`/admin/tarefas/t/${cartao.id}`}
          className="text-sm leading-snug font-medium underline-offset-4 hover:underline"
        >
          {cartao.titulo}
        </Link>
      </div>

      {cartao.status !== "ABERTA" && (
        <span
          className="selo mt-1"
          style={{ color: corDoTom(STATUS_TAREFA_LABEL[cartao.status].tom) }}
        >
          {STATUS_TAREFA_LABEL[cartao.status].texto}
        </span>
      )}

      {cartao.etiquetas.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {cartao.etiquetas.map((e) => (
            <span key={e} className="selo text-[11px]" style={{ color: "var(--muted-foreground)" }}>
              {e}
            </span>
          ))}
        </div>
      )}

      {cartao.aguardando && coluna.estado === "EXECUCAO_BLOQUEADA" && (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          esperando: {cartao.aguardando}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {cartao.responsavel ? (
          <span
            className="selo"
            style={{ color: "var(--muted-foreground)" }}
            title={cartao.responsavel.nome}
          >
            {cartao.responsavel.iniciais}
          </span>
        ) : (
          <span className="selo" style={{ color: corDoTom("pendente") }}>
            sem dono
          </span>
        )}

        {cartao.prazo && (
          <span style={{ color: corDoTom(cartao.prazo.tom) }}>{cartao.prazo.texto}</span>
        )}

        {corDoTempo && (
          <span
            className="num-display"
            style={{ color: corDoTempo }}
            title={`parado nesta coluna há ${cartao.diasNaColuna} dias`}
          >
            {cartao.diasNaColuna}d
          </span>
        )}

        {cartao.comentarios > 0 && (
          <span className="text-[var(--muted-foreground)]">
            {cartao.comentarios} comentário{cartao.comentarios > 1 ? "s" : ""}
          </span>
        )}

        {cartao.subtarefas && (
          <span
            className="num-display inline-flex items-center gap-0.5 text-[var(--muted-foreground)]"
            title={`${cartao.subtarefas.feitas} de ${cartao.subtarefas.total} subtarefas feitas`}
          >
            <ListChecks aria-hidden className="size-3.5" />
            {cartao.subtarefas.feitas}/{cartao.subtarefas.total}
          </span>
        )}

        {cartao.anexos > 0 && (
          <span
            className="num-display inline-flex items-center gap-0.5 text-[var(--muted-foreground)]"
            title={`${cartao.anexos} anexo${cartao.anexos > 1 ? "s" : ""}`}
          >
            <Paperclip aria-hidden className="size-3.5" />
            {cartao.anexos}
          </span>
        )}

        {podeMexer && (
          <button
            type="button"
            className="ml-auto text-[var(--primary)] underline-offset-4 hover:underline"
            aria-expanded={aberto}
            onClick={() => {
              setAberto(!aberto);
              setDestinoId(null);
              setErro(null);
            }}
          >
            Mover
          </button>
        )}
      </div>

      {/* O painel abre embutido na linha, como toda confirmação desta casa.
          Cada destino já vem sabendo se aceita o cartão: a mesma
          `podeMover` que o servidor vai rodar decide aqui qual botão fica
          apagado e qual recusa explicar o caminho certo. */}
      {aberto && (
        <div className="mt-2 space-y-2 rounded border border-dashed border-[var(--border)] p-2.5">
          {destinoId === null ? (
            <>
              <p className="text-xs text-[var(--muted-foreground)]">Mover para:</p>
              <div className="flex flex-wrap gap-1.5">
                {colunas
                  .filter((c) => c.id !== coluna.id)
                  .map((c) => {
                    const r = podeMover(coluna.estado, c.estado, comRascunho);
                    // Caminho que não existe fica apagado e diz por onde ir.
                    // Caminho que só precisa de um campo continua clicável —
                    // é o campo que vai abrir.
                    const fechado = !r.ok && r.exige === null;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        className="chip text-xs"
                        disabled={fechado || pendente}
                        title={r.ok ? undefined : r.motivo}
                        onClick={() => setDestinoId(c.id)}
                      >
                        {c.nome}
                      </button>
                    );
                  })}
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Coluna apagada é caminho que não existe — passe o cursor para
                ver por onde ir.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">
                {coluna.nome} → {destino?.nome}
              </p>

              {/* O formulário é guiado pela máquina de estados, um campo por
                  vez: ela devolve QUAL exigência falhou, a tela abre aquele
                  campo, e ao preencher ela devolve a próxima ou libera. É o
                  que impede a tela de ter uma segunda cópia das regras. */}
              {veredito && !veredito.ok && veredito.exige === "responsavel" && (
                <div>
                  <label className="label text-xs" htmlFor={`dono-${cartao.id}`}>
                    Quem vai fazer?
                  </label>
                  <select
                    id={`dono-${cartao.id}`}
                    className="field text-sm"
                    value={responsavelId ?? ""}
                    onChange={(e) =>
                      setResponsavelId(e.target.value === "" ? null : Number(e.target.value))
                    }
                  >
                    <option value="">escolha</option>
                    {membros.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                  {membros.length === 0 && (
                    <p className="hint">
                      Este quadro ainda não tem membros. Quem administra precisa
                      incluir gente nele.
                    </p>
                  )}
                </div>
              )}

              {veredito && !veredito.ok && veredito.exige === "motivoEPrevisao" && (
                <div className="space-y-2">
                  <div>
                    <label className="label text-xs" htmlFor={`esp-${cartao.id}`}>
                      Esperando o quê, ou quem?
                    </label>
                    <input
                      id={`esp-${cartao.id}`}
                      className="field text-sm"
                      value={aguardandoDescricao}
                      onChange={(e) => setAguardandoDescricao(e.target.value)}
                      placeholder="entrega do fornecedor Hortifruti"
                      maxLength={500}
                    />
                  </div>
                  <div>
                    <label className="label text-xs" htmlFor={`prev-${cartao.id}`}>
                      Previsão
                    </label>
                    <input
                      id={`prev-${cartao.id}`}
                      type="date"
                      className="field text-sm"
                      value={aguardandoPrevisao}
                      onChange={(e) => setAguardandoPrevisao(e.target.value)}
                    />
                    <p className="hint">
                      Na data da previsão o sistema cobra você. É para isso que
                      ela existe.
                    </p>
                  </div>
                </div>
              )}

              {veredito && !veredito.ok && veredito.exige === "documento" && (
                <div>
                  <label className="label text-xs" htmlFor={`doc-${cartao.id}`}>
                    Qual é o documento?
                  </label>
                  <input
                    id={`doc-${cartao.id}`}
                    type="url"
                    className="field text-sm"
                    value={documentoUrl}
                    onChange={(e) => setDocumentoUrl(e.target.value)}
                    placeholder="https://…"
                  />
                </div>
              )}

              {veredito && !veredito.ok && veredito.exige !== null &&
                !["responsavel", "motivoEPrevisao", "documento"].includes(
                  veredito.exige,
                ) && (
                  <p role="alert" className="msg-warn">
                    {veredito.motivo}
                  </p>
                )}

              {erro && (
                <p role="alert" className="msg-error">
                  {erro}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={pendente || !veredito?.ok}
                  onClick={mover}
                >
                  {pendente ? "Movendo…" : `Mover para ${destino?.nome}`}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pendente}
                  onClick={() => {
                    setDestinoId(null);
                    setErro(null);
                  }}
                >
                  Voltar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
