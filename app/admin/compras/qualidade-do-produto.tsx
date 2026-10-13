"use client";

import { useState, useTransition } from "react";

import { Estrelas, MediaEstrelas } from "@/components/estrelas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { avaliarComoDono, qualidadeDoProduto } from "@/lib/actions/qualidade";
import type { EntregaAvaliada, QualidadeDoProduto as Dados } from "@/lib/qualidade";
import { NOTA_QUE_PEDE_MOTIVO, erroDaNota } from "@/lib/qualidade-regra";

/**
 * A qualidade de um produto, dentro do painel Editar: as médias por marca e
 * por fornecedor, e as últimas entregas avaliadas — com a nota de quem
 * recebeu e a do dono, que ele dá ali mesmo.
 *
 * Carrega ao tocar, e não com a lista: são 381 produtos, e só quem abre este
 * aqui quer ver as notas dele.
 */
export function QualidadeDoProduto({ produtoId, nome }: { produtoId: number; nome: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function carregar() {
    setErro(null);
    startTransition(async () => {
      const r = await qualidadeDoProduto(produtoId);
      if (!r.ok) return setErro(r.message);
      setDados(r.data);
    });
  }

  if (dados === null) {
    return (
      <div>
        <Button type="button" size="sm" variant="outline" disabled={pendente} onClick={carregar}>
          {pendente ? "Carregando…" : "Ver avaliações"}
        </Button>
        {erro && <p className="mt-1 font-medium text-[var(--destructive)]">{erro}</p>}
      </div>
    );
  }

  if (dados.entregas.length === 0) {
    return (
      <p className="text-[var(--muted-foreground)]">
        Nenhuma entrega avaliada ainda. As estrelas aparecem aqui depois do primeiro recebimento.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Medias titulo="Por marca" linhas={dados.porMarca.map((m) => ({ nome: m.marca, media: m.media, n: m.n }))} />
        <Medias
          titulo="Por fornecedor"
          linhas={dados.porFornecedor.map((m) => ({ nome: m.fornecedor, media: m.media, n: m.n }))}
        />
      </div>

      <div>
        <p className="mb-1 font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Últimas entregas</p>
        <ul className="divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--background)]">
          {dados.entregas.map((e) => (
            <Entrega key={e.pedidoCompraItemId} entrega={e} nome={nome} aoSalvar={carregar} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function Medias({ titulo, linhas }: { titulo: string; linhas: { nome: string; media: number; n: number }[] }) {
  return (
    <div>
      <p className="mb-1 font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{titulo}</p>
      <ul className="space-y-1">
        {linhas.map((l) => (
          <li key={l.nome} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">{l.nome}</span>
            <MediaEstrelas media={l.media} n={l.n} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Uma entrega: de quem, que marca, e as duas notas. */
function Entrega({ entrega: e, nome, aoSalvar }: { entrega: EntregaAvaliada; nome: string; aoSalvar: () => void }) {
  return (
    <li className="space-y-1.5 px-2.5 py-2">
      <p className="font-medium">
        {e.em ? new Date(e.em).toLocaleDateString("pt-BR") : "—"} · {e.fornecedor ?? "—"}
        {e.marca && <span className="font-normal text-[var(--muted-foreground)]"> · {e.marca}</span>}
      </p>
      <AvaliacaoDaEntrega
        pedidoCompraItemId={e.pedidoCompraItemId}
        nome={nome}
        recebimento={e.recebimento}
        dono={e.dono}
        aoSalvar={aoSalvar}
      />
    </li>
  );
}

/**
 * A nota de quem recebeu (só leitura) e a do dono, que ele dá ou refaz ali.
 * Mora aqui e serve também à página do pedido recebido: é a mesma conversa
 * sobre a mesma entrega, e duas cópias dela dariam dois jeitos de avaliar.
 */
export function AvaliacaoDaEntrega({
  pedidoCompraItemId,
  nome,
  recebimento,
  dono,
  aoSalvar,
}: {
  pedidoCompraItemId: number;
  nome: string;
  recebimento: EntregaAvaliada["recebimento"];
  dono: EntregaAvaliada["dono"];
  aoSalvar?: () => void;
}) {
  const [nota, setNota] = useState<number | null>(dono?.nota ?? null);
  const [comentario, setComentario] = useState(dono?.comentario ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const mexeu = nota !== (dono?.nota ?? null) || comentario !== (dono?.comentario ?? "");

  function salvar() {
    const problema = erroDaNota(nota, comentario, nome);
    if (problema) return setErro(problema);
    setErro(null);
    startTransition(async () => {
      const r = await avaliarComoDono(pedidoCompraItemId, nota!, comentario);
      if (!r.ok) return setErro(r.message);
      aoSalvar?.();
    });
  }

  return (
    <div className="space-y-1.5 text-xs">
      {recebimento ? (
        <p className="flex flex-wrap items-center gap-x-2 text-[var(--muted-foreground)]">
          <span>Recebimento{recebimento.autor ? ` (${recebimento.autor})` : ""}:</span>
          <Estrelas valor={recebimento.nota} tamanho="pequena" rotulo="Nota de quem recebeu" />
          {recebimento.comentario && <span className="italic">“{recebimento.comentario}”</span>}
        </p>
      ) : (
        <p className="text-[var(--muted-foreground)]">Recebido sem nota.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[var(--muted-foreground)]">Sua nota:</span>
        <Estrelas valor={nota} aoMudar={setNota} rotulo={`Sua nota para ${nome} nesta entrega`} />
      </div>
      {(nota !== null || comentario !== "") && (
        <Input
          value={comentario}
          onChange={(ev) => setComentario(ev.target.value)}
          maxLength={300}
          placeholder={
            nota !== null && nota <= NOTA_QUE_PEDE_MOTIVO ? "Por que a nota baixa? (obrigatório)" : "Comentário (opcional)"
          }
          className="h-8 w-full text-xs"
        />
      )}
      {mexeu && (
        <Button type="button" size="sm" disabled={pendente} onClick={salvar}>
          {pendente ? "Salvando…" : "Salvar sua nota"}
        </Button>
      )}
      {erro && <p className="font-medium text-[var(--destructive)]">{erro}</p>}
    </div>
  );
}
