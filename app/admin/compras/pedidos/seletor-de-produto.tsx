"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UNIT_LABEL, chave, lerNumeroBR } from "@/lib/format";
import type { ProductUnit } from "@/generated/prisma/client";

export type ProdutoParaPedido = {
  id: number;
  nome: string;
  unidade: ProductUnit;
  /** De quanto em quanto se compra. Nulo = qualquer número serve. */
  lote: number | null;
  /** Ligado a este fornecedor (cadastro, exclusivo ou categoria que ele atende). */
  doFornecedor: boolean;
};

/**
 * Escolher um produto, a quantidade e (se quiser) o preço, e acrescentar.
 *
 * Busca por nome, sem acento e sem caixa (`chave`), e os produtos deste
 * fornecedor vêm primeiro. Os outros aparecem também, com o aviso — compra
 * urgente de algo que ele não costuma vender é o que o pedido manual veio
 * resolver, e esconder o produto não ajudaria ninguém.
 *
 * `aoAcrescentar` devolve a mensagem de erro do servidor, ou nulo quando deu
 * certo; aí o seletor se limpa para o próximo.
 *
 * Dá para fazer tudo no teclado: Enter na busca escolhe o primeiro achado,
 * Enter na quantidade pula para o preço, Enter no preço pula para o botão, e
 * Enter no botão acrescenta e volta para a busca.
 */
export function SeletorDeProduto({
  produtos,
  aoAcrescentar,
  pendente = false,
  focarAoAbrir = false,
  soProduto = false,
  semMoldura = false,
  semPreco = false,
}: {
  produtos: ProdutoParaPedido[];
  aoAcrescentar: (produtoId: number, quantidade: number, preco: number | null) => Promise<string | null>;
  pendente?: boolean;
  /** Já abre com o cursor na busca — quando é a próxima coisa a fazer na tela. */
  focarAoAbrir?: boolean;
  /** Só escolher o produto, sem quantidade nem preço — a lista de compra fixa.
      Tocar no achado (ou Enter) já acrescenta, e a busca fica pronta para o
      próximo. `aoAcrescentar` recebe quantidade 0. */
  soProduto?: boolean;
  /** Dentro de um cartão que já tem título: sem a borda tracejada nem o
      "Acrescentar produto". */
  semMoldura?: boolean;
  /** Só a quantidade: onde não há preço a dizer (brinde, troca). */
  semPreco?: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<ProdutoParaPedido | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [preco, setPreco] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const buscaRef = useRef<HTMLInputElement>(null);
  const precoRef = useRef<HTMLInputElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  // Voltar à busca depois de acrescentar ou trocar: ela só existe de novo
  // depois que a tela redesenha, então o foco espera o efeito.
  const voltarABusca = useRef(false);
  useEffect(() => {
    if (!escolhido && voltarABusca.current) {
      voltarABusca.current = false;
      buscaRef.current?.focus();
    }
  }, [escolhido]);

  /** Enter leva ao próximo campo, em vez de não fazer nada. */
  function ehEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return false;
    e.preventDefault();
    return true;
  }

  const termo = chave(busca);
  const achados =
    escolhido || termo.length < 2
      ? []
      : produtos
          .filter((p) => chave(p.nome).includes(termo))
          .sort((a, b) => Number(b.doFornecedor) - Number(a.doFornecedor))
          .slice(0, 8);

  async function escolher(p: ProdutoParaPedido) {
    if (!soProduto) return setEscolhido(p);
    setErro(null);
    const falha = await aoAcrescentar(p.id, 0, null);
    if (falha) return setErro(falha);
    setBusca("");
    buscaRef.current?.focus();
  }

  async function acrescentar() {
    if (!escolhido) return;
    const q = lerNumeroBR(quantidade);
    if (q === null || q <= 0) return setErro("Digite a quantidade.");
    const p = preco.trim() === "" ? null : lerNumeroBR(preco);
    if (preco.trim() !== "" && (p === null || p <= 0)) return setErro("Preço inválido.");
    setErro(null);
    const falha = await aoAcrescentar(escolhido.id, q, p);
    if (falha) return setErro(falha);
    voltarABusca.current = true;
    setEscolhido(null);
    setBusca("");
    setQuantidade("");
    setPreco("");
  }

  return (
    <div className={semMoldura ? "" : "rounded-lg border border-dashed border-[var(--border)] p-3"}>
      {!semMoldura && <p className="text-sm font-semibold">Acrescentar produto</p>}

      {!escolhido ? (
        <>
          <Input
            ref={buscaRef}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => {
              if (ehEnter(e) && achados.length > 0) void escolher(achados[0]);
            }}
            placeholder={semMoldura ? "Buscar produto para acrescentar" : "Buscar pelo nome"}
            aria-label="Buscar produto pelo nome"
            className={`${semMoldura ? "" : "mt-2"} h-9 w-full`}
            autoFocus={focarAoAbrir}
          />
          {achados.length > 0 && (
            <ul className="mt-1 divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--background)]">
              {achados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => void escolher(p)}
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                  >
                    <span>{p.nome}</span>
                    <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
                      {UNIT_LABEL[p.unidade]}
                      {!p.doFornecedor && " · não é deste fornecedor"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {termo.length >= 2 && achados.length === 0 && (
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">Nenhum produto com esse nome.</p>
          )}
        </>
      ) : (
        <div className={`${semMoldura ? "" : "mt-2"} space-y-2`}>
          <p className="text-sm">
            <span className="font-medium">{escolhido.nome}</span>
            {!escolhido.doFornecedor && (
              <span className="block text-xs text-[var(--warn)]">
                Este produto não é deste fornecedor no cadastro. Dá para pedir assim mesmo.
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs">
              <span className="mb-1 block font-medium">
                Quantidade ({UNIT_LABEL[escolhido.unidade]})
                {escolhido.lote !== null && ` · lote de ${String(escolhido.lote).replace(".", ",")}`}
              </span>
              <Input
                inputMode="decimal"
                aria-label={`Quantidade de ${escolhido.nome}`}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                onKeyDown={(e) => {
                  if (ehEnter(e)) (semPreco ? botaoRef : precoRef).current?.focus();
                }}
                className="num-display h-9 w-28 text-right"
                autoFocus
              />
            </label>
            {!semPreco && (
            <label className="text-xs">
              <span className="mb-1 block font-medium">
                Preço por {UNIT_LABEL[escolhido.unidade]} <span className="font-normal">(se já sabe)</span>
              </span>
              <Input
                inputMode="decimal"
                aria-label={`Preço de ${escolhido.nome}`}
                value={preco}
                ref={precoRef}
                onChange={(e) => setPreco(e.target.value)}
                onKeyDown={(e) => {
                  if (ehEnter(e)) botaoRef.current?.focus();
                }}
                placeholder="R$"
                className="num-display h-9 w-28 text-right"
              />
            </label>
            )}
            <Button ref={botaoRef} type="button" size="sm" disabled={pendente} onClick={acrescentar}>
              Acrescentar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                voltarABusca.current = true;
                setEscolhido(null);
              }}
            >
              Trocar
            </Button>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="mt-2 text-xs text-[var(--destructive)]">
          {erro}
        </p>
      )}
    </div>
  );
}
