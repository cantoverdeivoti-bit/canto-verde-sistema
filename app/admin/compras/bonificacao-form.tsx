"use client";

import { Gift, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { acrescentarBonificacao, tirarBonificacao } from "@/lib/actions/bonificacao";
import {
  ESTADO_DA_BONIFICACAO,
  TIPOS_DE_BONIFICACAO,
  bonificacaoPorExtenso,
  eMercadoria,
  type BonificacaoParaMostrar,
} from "@/lib/bonificacoes";
import type { TipoBonificacao } from "@/generated/prisma/client";

import { SeletorDeProduto, type ProdutoParaPedido } from "./pedidos/seletor-de-produto";

export type AlvoDaBonificacao = { cotacaoId: number; fornecedorId: number } | { pedidoCompraId: number };

/**
 * A bonificação combinada com um fornecedor: a lista do que já foi
 * combinado e o formulário para combinar mais. O mesmo na cotação (no
 * rodapé de cada fornecedor escolhido) e na página do pedido.
 *
 * Unidades a mais só deixam escolher entre os produtos do próprio pedido —
 * "a cada 10, vem 1" é sempre do que está sendo comprado. O brinde deixa
 * escolher qualquer produto.
 */
export function BonificacoesCombinadas({
  alvo,
  existentes,
  produtosDoPedido,
  todosOsProdutos,
  editavel,
  abertoDeInicio = false,
}: {
  alvo: AlvoDaBonificacao;
  existentes: BonificacaoParaMostrar[];
  produtosDoPedido: ProdutoParaPedido[];
  todosOsProdutos: ProdutoParaPedido[];
  editavel: boolean;
  abertoDeInicio?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoDeInicio);
  const [tipo, setTipo] = useState<TipoBonificacao>("UNIDADES");
  const [valor, setValor] = useState("");
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const base = {
    cotacaoId: "cotacaoId" in alvo ? alvo.cotacaoId : null,
    fornecedorId: "fornecedorId" in alvo ? alvo.fornecedorId : null,
    pedidoCompraId: "pedidoCompraId" in alvo ? alvo.pedidoCompraId : null,
  };

  async function combinarMercadoria(produtoId: number, quantidade: number): Promise<string | null> {
    const r = await acrescentarBonificacao({ ...base, tipo, produtoId, quantidade, valor: undefined, nota });
    if (r.ok) setNota("");
    return r.ok ? null : (r.message ?? "Não deu para combinar.");
  }

  function combinarDinheiro(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await acrescentarBonificacao({ ...base, tipo, produtoId: null, quantidade: undefined, valor, nota });
      if (!r.ok) return setErro(r.message ?? "Não deu para combinar.");
      setValor("");
      setNota("");
    });
  }

  function tirar(id: number) {
    setErro(null);
    startTransition(async () => {
      const r = await tirarBonificacao(id);
      if (!r.ok) setErro(r.message ?? "Não deu para tirar.");
    });
  }

  const vivas = existentes.filter((b) => b.estado !== "CANCELADA");

  return (
    <div className="space-y-3">
      {vivas.length > 0 && (
        <ul className="space-y-1.5">
          {vivas.map((b) => (
            <li key={b.id} className="flex items-start gap-2 rounded-lg bg-[var(--primary-soft)] px-3 py-2 text-sm">
              <Gift aria-hidden className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{bonificacaoPorExtenso(b)}</span>
                {b.nota && <span className="block text-xs text-[var(--muted-foreground)]">{b.nota}</span>}
              </span>
              {b.estado !== "COMBINADA" || !editavel ? (
                <span className="selo shrink-0 text-[var(--muted-foreground)]">{ESTADO_DA_BONIFICACAO[b.estado]}</span>
              ) : (
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => tirar(b.id)}
                  aria-label={`Tirar: ${bonificacaoPorExtenso(b)}`}
                  className="-my-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--muted)]"
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editavel && !aberto && (
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setAberto(true)}>
          <Gift aria-hidden className="size-4" />
          {vivas.length > 0 ? "Combinar outra bonificação" : "Combinar bonificação"}
        </Button>
      )}

      {editavel && aberto && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
          <div role="radiogroup" aria-label="Tipo de bonificação" className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {TIPOS_DE_BONIFICACAO.map((t) => (
              <button
                key={t.tipo}
                type="button"
                role="radio"
                aria-checked={tipo === t.tipo}
                onClick={() => {
                  setTipo(t.tipo);
                  setErro(null);
                }}
                className={`rounded-lg border px-2 py-2 text-left text-sm leading-tight ${
                  tipo === t.tipo
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold text-[var(--primary)]"
                    : "border-[var(--border)] hover:bg-[var(--muted)]"
                }`}
              >
                {t.nome}
                <span className="block text-[11px] font-normal text-[var(--muted-foreground)]">{t.dica}</span>
              </button>
            ))}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nota (opcional)</span>
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              maxLength={300}
              placeholder={eMercadoria(tipo) ? "ex: a cada 10 cx, 1 de bonificação" : "ex: combinado com o vendedor"}
            />
          </label>

          {eMercadoria(tipo) ? (
            tipo === "UNIDADES" && produtosDoPedido.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                Escolha antes o que vai ser comprado deste fornecedor: as unidades a mais são de um produto do pedido.
              </p>
            ) : (
              <SeletorDeProduto
                key={tipo}
                produtos={tipo === "UNIDADES" ? produtosDoPedido : todosOsProdutos}
                aoAcrescentar={(id, q) => combinarMercadoria(id, q)}
                semPreco
                semMoldura
              />
            )
          ) : (
            <form onSubmit={combinarDinheiro} className="flex flex-wrap items-end gap-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Valor (R$)</span>
                <Input
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="w-36"
                />
              </label>
              <Button type="submit" disabled={pendente}>
                {pendente ? "Combinando…" : "Combinar"}
              </Button>
            </form>
          )}

          {erro && (
            <p role="alert" className="text-sm font-medium" style={{ color: "var(--destructive)" }}>
              {erro}
            </p>
          )}
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="text-xs text-[var(--muted-foreground)] underline-offset-4 hover:underline"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
