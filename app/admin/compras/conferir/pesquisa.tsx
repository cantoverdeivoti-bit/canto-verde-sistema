"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { ConfirmarNaLinha } from "@/components/confirmar-na-linha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { adicionarPesquisa, removerPesquisa } from "@/lib/actions/pesquisa";
import { plural } from "@/lib/format";

export type ItemDePesquisa = {
  id: number;
  descricao: string;
  observacoes: string | null;
  /** Quantos fornecedores já responderam. Zero enquanto ninguém abriu o link. */
  respostas: number;
};

/**
 * "Você tem isto, e por quanto?" — as perguntas que pegam carona na cotação.
 *
 * A rodada é a única hora da semana em que sete fornecedores estão olhando
 * para a mesma tela. A pergunta sobre o que a casa não compra ficava para um
 * WhatsApp que nunca saía; aqui ela custa uma linha de texto e vai junto do
 * link que já ia ser mandado.
 *
 * Fica DEPOIS da lista de compra, e recolhida quando não há pergunta nenhuma.
 * A compra é o trabalho; isto é curiosidade que vale a carona — e curiosidade
 * disputando o alto da tela com a decisão da semana inverteria os dois.
 *
 * Nada daqui vira pedido. Se a resposta agradar, o caminho é cadastrar o
 * produto e comprá-lo na rodada seguinte, como qualquer outro.
 */
export function Pesquisa({
  cotacaoId,
  itens,
}: {
  cotacaoId: number;
  itens: ItemDePesquisa[];
}) {
  const [aberto, setAberto] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function perguntar() {
    setErro(null);
    startTransition(async () => {
      const r = await adicionarPesquisa(cotacaoId, descricao, observacoes);
      if (!r.ok) return setErro(r.message);
      setDescricao("");
      setObservacoes("");
      setAberto(false);
    });
  }

  function remover(id: number) {
    setErro(null);
    startTransition(async () => {
      await removerPesquisa(id);
    });
  }

  return (
    <section className="mt-10 border-t border-[var(--border)] pt-6">
      <h2 className="section-label">Pesquisa de preço</h2>
      <p className="hint mt-1">
        O que você não compra hoje, mas quer saber se dá para comprar. Vai no
        fim da tela de cada fornecedor chamado, junto com os preços. Não entra
        na compra desta semana — é para você decidir depois.
      </p>

      {itens.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {itens.map((i) => (
            <li key={i.id} className="card flex flex-wrap items-baseline gap-x-3 gap-y-1 p-2.5">
              <p className="font-medium">{i.descricao}</p>
              {i.observacoes && (
                <p className="text-xs text-[var(--muted-foreground)]">{i.observacoes}</p>
              )}

              {/* Quantos responderam, e não quem: quem é a tela da cotação,
                  que tem largura para as respostas lado a lado. Aqui a
                  pergunta é se já vale a pena ir olhar. */}
              <p className="ml-auto text-xs text-[var(--muted-foreground)]">
                {i.respostas === 0
                  ? "ninguém respondeu ainda"
                  : plural(i.respostas, "resposta", "respostas")}
              </p>

              {/* Pergunta antes: apagar leva junto as respostas que os
                  fornecedores já deram, e elas não voltam. */}
              <ConfirmarNaLinha
                pergunta={`Apagar a pergunta sobre ${i.descricao}?${
                  i.respostas > 0 ? ` ${plural(i.respostas, "resposta vai", "respostas vão")} junto.` : ""
                }`}
                pendente={pendente}
                aoConfirmar={() => remover(i.id)}
              >
                {(abrir) => (
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={abrir}
                    aria-label={`Apagar a pergunta sobre ${i.descricao}`}
                    title="Apagar esta pergunta"
                    className="flex h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                )}
              </ConfirmarNaLinha>
            </li>
          ))}
        </ul>
      )}

      {erro && (
        <p role="alert" className="msg-error mt-3">
          {erro}
        </p>
      )}

      {aberto ? (
        <div className="card mt-3 max-w-xl space-y-3 p-2.5">
          <div>
            <label className="label" htmlFor="pesquisa-descricao">
              O que você quer perguntar
            </label>
            <Input
              id="pesquisa-descricao"
              autoFocus
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Azeite trufado 500ml"
              className="h-9"
            />
          </div>

          <div>
            <label className="label" htmlFor="pesquisa-obs">
              Algum detalhe? <span className="font-normal">(opcional)</span>
            </label>
            <Textarea
              id="pesquisa-obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Para o risoto do fim de semana. Se tiver de 250ml também serve."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pendente || descricao.trim() === ""}
              onClick={perguntar}
            >
              {pendente ? "Gravando…" : "Perguntar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pendente}
              onClick={() => {
                setAberto(false);
                setErro(null);
              }}
            >
              cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={() => setAberto(true)}
        >
          {itens.length === 0 ? "Perguntar sobre um produto" : "Perguntar sobre outro"}
        </Button>
      )}
    </section>
  );
}
