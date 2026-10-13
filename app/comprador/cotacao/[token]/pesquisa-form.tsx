"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { responderPesquisa } from "@/lib/actions/pesquisa";
import { plural } from "@/lib/format";

/** Uma pergunta da casa, com o que este fornecedor já respondeu. */
export type PerguntaDaCasa = {
  id: number;
  descricao: string;
  observacoes: string | null;
  /** Nulo enquanto ele não respondeu nada sobre esta. */
  temAnterior: boolean | null;
  precoAnterior: string;
  embalagemAnterior: string;
  marcaAnterior: string;
  observacaoAnterior: string;
};

/** O rascunho de uma resposta, tudo texto porque campo é texto. */
type Rascunho = {
  tem: boolean | null;
  preco: string;
  embalagem: string;
  marca: string;
  obs: string;
};

/**
 * "Você tem isto?" — as perguntas da casa sobre o que ela ainda não compra.
 *
 * Bloco à parte, com botão próprio, e NÃO junto do formulário de preço. O
 * preço é o que paga a rodada: uma falha ao gravar uma curiosidade não pode
 * derrubar os trinta preços que ele acabou de digitar, e um formulário só
 * faria exatamente isso. Pela mesma razão fica depois, e não antes.
 *
 * Três estados por pergunta, e não dois: "tenho", "não tenho" e o silêncio de
 * quem ainda não respondeu. Sem o "não tenho" explícito, a casa ficaria
 * esperando por uma resposta que já veio — e perguntaria de novo no mês que
 * vem a quem já disse que não trabalha com aquilo.
 *
 * O preço continua opcional mesmo em "tenho": quem vende mas precisa
 * consultar manda "tenho, preço a ver", que é melhor do que um número
 * inventado para conseguir enviar.
 */
export function PesquisaForm({
  token,
  perguntas,
}: {
  token: string;
  perguntas: PerguntaDaCasa[];
}) {
  const [rascunhos, setRascunhos] = useState<Record<number, Rascunho>>(() =>
    Object.fromEntries(
      perguntas.map((p) => [
        p.id,
        {
          tem: p.temAnterior,
          preco: p.precoAnterior,
          embalagem: p.embalagemAnterior,
          marca: p.marcaAnterior,
          obs: p.observacaoAnterior,
        },
      ]),
    ),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [gravadas, setGravadas] = useState(0);
  const [pendente, startTransition] = useTransition();

  function mexer(id: number, troca: Partial<Rascunho>) {
    setGravadas(0);
    setRascunhos((a) => ({ ...a, [id]: { ...a[id], ...troca } }));
  }

  // Só as que ele respondeu. Mandar as em branco gravaria um "não tenho" que
  // ele não disse — silêncio não é resposta, e este é o campo cuja ausência
  // a casa lê como "ainda não sei".
  const respondidas = perguntas.filter((p) => rascunhos[p.id]?.tem !== null);

  function enviar() {
    setErro(null);
    startTransition(async () => {
      const r = await responderPesquisa(
        token,
        respondidas.map((p) => {
          const d = rascunhos[p.id];
          return {
            pesquisaId: p.id,
            temProduto: d.tem === true,
            precoUnitario: d.preco,
            embalagem: d.embalagem,
            marca: d.marca,
            observacoes: d.obs,
          };
        }),
      );
      if (!r.ok) return setErro(r.message);
      setGravadas(r.data.gravadas);
    });
  }

  return (
    <section className="mt-12 border-t border-[var(--border)] pt-8">
      <h2 className="text-base font-semibold">Você trabalha com isto?</h2>
      <p className="mt-2 text-base text-[var(--muted-foreground)]">
        Não faz parte do pedido — é só para sabermos se vale pedir das próximas
        vezes. Se não tiver, dizer que não já ajuda.
      </p>

      <ul className="mt-6 space-y-5">
        {perguntas.map((p) => {
          const d = rascunhos[p.id];
          return (
            <li key={p.id}>
              <p className="font-medium">{p.descricao}</p>
              {p.observacoes && (
                <p className="mt-0.5 text-base text-[var(--muted-foreground)]">
                  {p.observacoes}
                </p>
              )}

              {/* Dois botões, e não uma caixa de marcar. Caixa desmarcada é
                  ambígua entre "não" e "ainda não olhei", e é justamente essa
                  diferença que esta tela precisa capturar. */}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => mexer(p.id, { tem: true })}
                  aria-pressed={d.tem === true}
                  className="chip"
                >
                  Tenho
                </button>
                <button
                  type="button"
                  onClick={() => mexer(p.id, { tem: false })}
                  aria-pressed={d.tem === false}
                  className="chip"
                >
                  Não trabalho com isso
                </button>
              </div>

              {d.tem === true && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base text-[var(--muted-foreground)]">R$</span>
                    <Input
                      inputMode="decimal"
                      value={d.preco}
                      onChange={(e) => mexer(p.id, { preco: e.target.value })}
                      placeholder="0,00"
                      aria-label={`Preço de ${p.descricao}`}
                      className="h-9 w-24 text-right tabular-nums"
                    />
                    <Input
                      value={d.embalagem}
                      onChange={(e) => mexer(p.id, { embalagem: e.target.value })}
                      placeholder="como vende (caixa com 6, garrafa 500ml)"
                      aria-label={`Embalagem de ${p.descricao}`}
                      className="h-9 min-w-48 flex-1"
                    />
                  </div>
                  <Input
                    value={d.marca}
                    onChange={(e) => mexer(p.id, { marca: e.target.value })}
                    placeholder="marca"
                    aria-label={`Marca de ${p.descricao}`}
                    className="h-9"
                  />
                  {/* O preço é opcional de propósito: quem vende mas precisa
                      consultar manda "tenho" e escreve aqui. Um número
                      inventado para conseguir enviar seria pior que nenhum. */}
                  <Textarea
                    rows={2}
                    value={d.obs}
                    onChange={(e) => mexer(p.id, { obs: e.target.value })}
                    placeholder="Se não souber o preço agora, escreva aqui o que puder."
                    aria-label={`Observação sobre ${p.descricao}`}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {erro && (
        <p role="alert" className="msg-error mt-4">
          {erro}
        </p>
      )}

      {gravadas > 0 && (
        <p className="mt-4 text-base font-medium" style={{ color: "var(--ok)" }}>
          Obrigado — {plural(gravadas, "resposta anotada", "respostas anotadas")}.
        </p>
      )}

      <div className="mt-5">
        <Button
          type="button"
          disabled={pendente || respondidas.length === 0}
          onClick={enviar}
        >
          {pendente
            ? "Enviando…"
            : respondidas.length === 0
              ? "Responda ao menos uma"
              : `Enviar ${plural(respondidas.length, "resposta", "respostas")}`}
        </Button>
      </div>
    </section>
  );
}
