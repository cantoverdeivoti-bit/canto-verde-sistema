"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adicionarItemNaCotacao } from "@/lib/actions/cotacao";
import { UNIT_LABEL, chave, formatAmount, lerNumeroBR } from "@/lib/format";
import { faltaParaOLote, serveNoLote } from "@/lib/lote";
import type { ProductUnit } from "@/generated/prisma/client";

/** Um produto que pode entrar na compra. Já vem sem os que estão nela. */
export type Candidato = {
  id: number;
  nome: string;
  unidade: ProductUnit;
  categoria: string | null;
  /** O que o cadastro diz que tem na prateleira. Vira o "Tem hoje" da linha. */
  estoque: number;
  lote: number | null;
};

/**
 * Acrescentar à compra um produto que a contagem não trouxe.
 *
 * A compra nasce do que foi contado, e é boa regra. Mas ela não cobre quem
 * sabe algo que a prateleira não diz: vai ter festa no sábado, o fornecedor
 * está com preço bom no arroz, o estoquista pulou uma gaveta. A saída era
 * mandar contar de novo.
 *
 * Fechado por padrão. Acrescentar é a exceção da tela — o trabalho aqui é
 * conferir o que a contagem trouxe —, e um formulário aberto em cima da lista
 * disputaria com ela toda visita.
 *
 * A busca filtra no navegador e não no servidor: são 341 produtos ativos, e a
 * lista inteira cabe numa ida só. Um `findMany` por tecla daria latência a um
 * problema que não tem.
 */
export function Acrescentar({
  cotacaoId,
  candidatos,
}: {
  cotacaoId: number;
  candidatos: Candidato[];
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<Candidato | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  // Mesmo índice normalizado da busca da lista: acha "agua" digitando "água",
  // e acha pelo nome da gaveta também.
  const indice = useMemo(
    () => new Map(candidatos.map((c) => [c.id, chave(`${c.nome} ${c.categoria ?? ""}`)])),
    [candidatos],
  );

  const termo = chave(busca);
  const achados = useMemo(
    () =>
      termo === ""
        ? []
        : candidatos.filter((c) => indice.get(c.id)?.includes(termo) ?? false).slice(0, 8),
    [candidatos, indice, termo],
  );

  const valor = quantidade.trim() === "" ? null : lerNumeroBR(quantidade);
  const serve = valor === null || escolhido === null || serveNoLote(valor, escolhido.lote);

  function escolher(c: Candidato) {
    setEscolhido(c);
    setBusca("");
    setErro(null);
    /* Nasce com um lote, ou vazio. Um lote é o menor pedido que existe para
       quem compra em fardo, e poupa a conta mais comum. Sem lote não há
       palpite honesto: quanto se compra de orégano é justamente o que ele
       veio decidir. */
    setQuantidade(c.lote === null ? "" : formatAmount(c.lote));
  }

  function fechar() {
    setAberto(false);
    setEscolhido(null);
    setBusca("");
    setQuantidade("");
    setErro(null);
  }

  function acrescentar() {
    if (escolhido === null || valor === null) return;
    setErro(null);
    startTransition(async () => {
      const r = await adicionarItemNaCotacao(cotacaoId, escolhido.id, valor);
      if (!r.ok) return setErro(r.message);
      fechar();
      // A linha nova vem do servidor, na gaveta e na ordem certas. Enfiá-la na
      // lista pelo cliente daria uma segunda verdade sobre o que a cotação tem.
    });
  }

  if (!aberto) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setAberto(true)}>
        Acrescentar produto
      </Button>
    );
  }

  return (
    <div className="card w-full max-w-xl space-y-3 p-2.5">
      <p className="text-sm font-medium">Acrescentar um produto à compra</p>

      {escolhido === null ? (
        <>
          <Input
            autoFocus
            type="search"
            aria-label="Buscar o produto a acrescentar"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome do produto ou da gaveta"
            className="h-9"
          />

          {/* Lista só depois de digitar: 341 nomes despejados de uma vez não é
              escolha, é rolagem. */}
          {termo !== "" &&
            (achados.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                Nada com esse nome fora da compra. Pode ser que já esteja na
                lista, ou que o produto esteja desativado.
              </p>
            ) : (
              <ul className="space-y-1">
                {achados.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => escolher(c)}
                      className="flex w-full items-baseline gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--surface)]"
                    >
                      <span className="font-medium">{c.nome}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {c.categoria ?? "sem gaveta"} · tem{" "}
                        {formatAmount(c.estoque)} {UNIT_LABEL[c.unidade]}
                        {c.lote !== null &&
                          ` · de ${formatAmount(c.lote)} em ${formatAmount(c.lote)}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}
        </>
      ) : (
        <>
          <p className="text-sm">
            <span className="font-medium">{escolhido.nome}</span>{" "}
            <button
              type="button"
              onClick={() => setEscolhido(null)}
              className="text-xs text-[var(--primary)] underline-offset-4 hover:underline"
            >
              trocar
            </button>
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-[var(--muted-foreground)]" htmlFor="qtd-nova">
              Comprar
            </label>
            <Input
              id="qtd-nova"
              autoFocus
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              aria-invalid={!serve}
              className={`h-8 w-20 text-right text-sm tabular-nums ${
                serve ? "" : "border-[var(--destructive)] bg-[var(--danger-soft)]"
              }`}
            />
            <span className="text-sm text-[var(--muted-foreground)]">
              {UNIT_LABEL[escolhido.unidade]}
            </span>

            {/* O lote recusa aqui pela mesma função da lista. A tela que
                acrescenta não pode ser a porta por onde 13 entra num fardo
                de 12. */}
            {!serve && valor !== null && escolhido.lote !== null && (
              <span className="text-xs" style={{ color: "var(--destructive)" }}>
                {(() => {
                  const f = faltaParaOLote(valor, escolhido.lote)!;
                  return `pode ser ${
                    f.abaixo === null ? "" : `${formatAmount(f.abaixo)} ou `
                  }${formatAmount(f.acima)} ${UNIT_LABEL[escolhido.unidade]}`;
                })()}
              </span>
            )}
          </div>

          <p className="text-xs text-[var(--muted-foreground)]">
            Ninguém contou este item hoje. O &quot;tem hoje&quot; dele vai ser{" "}
            {formatAmount(escolhido.estoque)} {UNIT_LABEL[escolhido.unidade]}, que
            é o que o cadastro diz.
          </p>
        </>
      )}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pendente || escolhido === null || valor === null || !serve}
          onClick={acrescentar}
        >
          {pendente ? "Acrescentando…" : "Acrescentar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={fechar}>
          cancelar
        </Button>
      </div>
    </div>
  );
}
