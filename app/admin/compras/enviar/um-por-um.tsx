"use client";

import { ChevronRight, Send, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { PedidoLinha, type PedidoLinhaRow } from "../pedidos/pedido-linha";

/** Ainda não saiu para o fornecedor: o que o modo um por um percorre. */
function aEnviar(p: PedidoLinhaRow): boolean {
  return (
    !p.entregaConfirmada &&
    !p.atacado &&
    p.wa !== null &&
    (p.estatus === "CRIADO" || p.estatus === "AGUARDANDO_FORNECEDOR")
  );
}

/**
 * "Enviar um por um": os pedidos ainda não enviados, um de cada vez, na
 * tela inteira. Toca no WhatsApp (que já marca como enviado), volta, toca em
 * Próximo. Era rolar a página procurando o próximo cartão a cada envio.
 *
 * A fila é tirada no toque que abre o modo, e não a cada atualização: o
 * pedido enviado sai da lista de "a enviar" assim que o servidor responde, e
 * a fila não pode encolher debaixo do dedo. O cartão mostrado vem sempre da
 * lista nova, com a situação de agora.
 */
export function UmPorUm({ pedidos }: { pedidos: PedidoLinhaRow[] }) {
  const [fila, setFila] = useState<number[] | null>(null);
  const [posicao, setPosicao] = useState(0);

  const pendentes = pedidos.filter(aEnviar);
  if (fila === null && pendentes.length < 2) return null;

  if (fila === null) {
    return (
      <Button
        type="button"
        className="w-full gap-2 sm:w-auto"
        onClick={() => {
          setFila(pendentes.map((p) => p.id));
          setPosicao(0);
        }}
      >
        <Send aria-hidden className="size-4" />
        Enviar um por um ({pendentes.length})
      </Button>
    );
  }

  const atual = pedidos.find((p) => p.id === fila[posicao]);
  const ultimo = posicao >= fila.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[var(--background)] p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Enviar um por um"
    >
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex items-center gap-3">
          <p className="section-label flex-1">
            Enviar · {posicao + 1} de {fila.length}
          </p>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setFila(null)}
            className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-[var(--muted)]"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        {atual ? (
          <ul>
            <PedidoLinha pedido={atual} />
          </ul>
        ) : (
          <p className="card p-4 text-sm text-[var(--muted-foreground)]">Este pedido saiu da lista.</p>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1 gap-1.5"
            onClick={() => (ultimo ? setFila(null) : setPosicao((n) => n + 1))}
          >
            {ultimo ? "Terminar" : "Próximo"}
            {!ultimo && <ChevronRight aria-hidden className="size-4" />}
          </Button>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          Tocar no WhatsApp já marca o pedido como enviado. Se não mandar, abra o pedido e toque em
          &ldquo;Voltar a editar&rdquo;.
        </p>
      </div>
    </div>
  );
}
