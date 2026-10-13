"use client";

import { ChevronRight, Gift } from "lucide-react";
import { useState } from "react";

import { formatMoney, plural } from "@/lib/format";

import { PedidoCard, estimadoDoPedido, type PedidoRow } from "../pedido-card";

/**
 * Um pedido numa linha só — fornecedor, itens e valor — que abre ali mesmo
 * ao ser tocada.
 *
 * Esperando entrega, abrir é conferir: os itens aparecem já com os três
 * botões, e tocar de novo na linha fecha. Recebido, abrir mostra o que chegou.
 */
export function LinhaDoPedido({
  pedido,
  sub,
  detalhe,
  conferir = false,
  abertoDeInicio = false,
}: {
  pedido: PedidoRow;
  /** A linha pequena sob o nome: a data, quando ela diz alguma coisa. */
  sub?: React.ReactNode;
  /** O contexto dentro do cartão aberto (origem, quando chegou). */
  detalhe?: React.ReactNode;
  conferir?: boolean;
  abertoDeInicio?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoDeInicio);
  const semPreco = pedido.total === 0 && pedido.itens.some((i) => i.precoUnitario === null);

  return (
    <li>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[color-mix(in_oklch,var(--primary)_4%,var(--background))] active:bg-[var(--muted)]"
        style={aberto ? { background: "color-mix(in oklch, var(--primary) 7%, var(--background))" } : undefined}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold leading-snug">{pedido.fornecedor}</span>
          {/* Itens e data embaixo do nome, para o nome caber inteiro no celular. */}
          <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
            {plural(pedido.itens.length, "item", "itens")}
            {sub && <> · {sub}</>}
            {/* Quem recebe precisa saber que tem bonificação para contar. */}
            {(pedido.bonificacoes ?? []).some((b) => b.estado !== "CANCELADA") && (
              <span className="text-[var(--primary)]">
                {" · "}
                <Gift aria-hidden className="inline size-3.5 align-[-2px]" /> bonificação
              </span>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right">
          {semPreco ? (
            <span className="text-xs text-[var(--muted-foreground)]">
              {estimadoDoPedido(pedido) > 0 ? `≈ ${formatMoney(estimadoDoPedido(pedido))}` : "a confirmar"}
            </span>
          ) : (
            <span className="num-display font-semibold">{formatMoney(pedido.total)}</span>
          )}
        </span>
        <ChevronRight
          aria-hidden
          className={`size-4 shrink-0 text-[var(--muted-foreground)] transition-transform ${
            aberto ? "rotate-90" : ""
          }`}
        />
      </button>
      {aberto && (
        <ul className="border-t border-[var(--border)]">
          <PedidoCard
            pedido={pedido}
            conferir={conferir}
            embutido
            semCabecalho
            abertoDeInicio
            detalhe={detalhe}
            aoVoltar={() => setAberto(false)}
          />
        </ul>
      )}
    </li>
  );
}
