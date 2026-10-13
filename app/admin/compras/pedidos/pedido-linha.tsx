"use client";

import { Check, Copy, Gift, MessageCircle, ShoppingCart, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cancelarPedido, marcarEnviado } from "@/lib/actions/pedido";
import { MOTIVO_SEM_PEDIDO, corDoTom, rotuloDoPedido } from "@/lib/cotacao-labels";
import {
  UNIT_LABEL,
  formatAmount,
  formatDiaNumericoString,
  formatMoney,
} from "@/lib/format";

import { recadoDoPedido } from "./texto-do-pedido";
import { bonificacaoPorExtenso, type BonificacaoParaMostrar } from "@/lib/bonificacoes";
import type { MotivoSemPedido, PedidoCompraStatus, ProductUnit } from "@/generated/prisma/client";

/** Um pedido nesta lista. De onde ele veio é o que muda a linha de contexto. */
export type PedidoLinhaRow = {
  id: number;
  fornecedor: string;
  estatus: PedidoCompraStatus;
  total: number;
  entregaConfirmada: boolean;
  entregaPrevista: string | null;
  /** Preenchido, o pedido saiu de uma cotação. */
  cotacaoId: number | null;
  /** "Cotação de 02/10", quando veio de uma. */
  cotacaoNome: string | null;
  /** Preenchido, nasceu de uma contagem. Nulo nos dois = pedido avulso. */
  contagemId: number | null;
  /** Preenchido, chegou sem pedido: nasceu já recebido, em Recebimentos. */
  motivoSemPedido?: MotivoSemPedido | null;
  /** O nome da Requisição de onde o pedido nasceu. */
  requisicao?: string | null;
  /** Encerrado em Recebimentos com "Não foi entregue". */
  naoEntregue?: boolean;
  /** O link do fornecedor exclusivo. Só o pedido direto tem. */
  token: string | null;
  /** `wa.me` já montado no servidor. Nulo = fornecedor sem telefone. */
  wa: string | null;
  /** Compra no atacado: a casa vai buscar. Sem WhatsApp nem link — a lista. */
  atacado?: boolean;
  /** O que foi combinado de bonificação: vai na mensagem e ganha o selo. */
  bonificacoes?: BonificacaoParaMostrar[];
  itens: {
    id: number;
    nome: string;
    unidade: ProductUnit;
    quantidade: number;
    /** Nulo é "o fornecedor ainda não confirmou" — só no pedido direto. */
    precoUnitario: number | null;
    /** Atacado: o último custo, congelado quando o pedido nasceu. */
    precoEstimado?: number | null;
    /** O fornecedor avisou pelo link que não tem. */
    emFalta?: boolean;
    /** O que a conferência anotou como falta, devolvido ou avaria. */
    problema?: "FALTA" | "DEVOLVIDO" | "AVARIA" | null;
  }[];
};

/**
 * Um pedido na lista, com o link que nunca teve onde aparecer.
 *
 * Este é o conserto do buraco que deu origem a esta tela: `montarCotacao`
 * gera um `token` para o fornecedor exclusivo confirmar o preço, grava, e
 * devolve para quem chamou — que descartava. A página
 * `/comprador/pedido/<token>` existia, funcionava, e não tinha como ser
 * alcançada por ninguém.
 *
 * Componente próprio, e não `PedidoCard` com mais props. Aquele tem uma regra
 * escrita no topo dele — "aparece em três telas e dá entrada em uma só" —,
 * porque entrada de estoque não tem desfazer e duas portas para a mesma ação é
 * como um pedido acaba conferido duas vezes. Enchê-lo de link, WhatsApp e
 * edição faria dele o componente que faz tudo, e essa regra seria a primeira
 * a cair. O custo é a lista de itens escrita duas vezes; vale.
 *
 * Aqui não se dá entrada. Quem recebe mercadoria vai a Recebimentos.
 */
export function PedidoLinha({
  pedido: p,
  podeComprar = true,
}: {
  pedido: PedidoLinhaRow;
  /** Mandar e cancelar o que ainda não foi é de quem configura Compras; o estoquista só abre. */
  podeComprar?: boolean;
}) {
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [pendente, startTransition] = useTransition();

  const rotulo = p.naoEntregue
    ? { texto: "não entregue", tom: "neutro" as const }
    : rotuloDoPedido(p.estatus, p.atacado);
  const semPreco = p.itens.filter((i) => i.precoUnitario === null && !i.emFalta).length;
  const emFalta = p.itens.filter((i) => i.emFalta).length;
  // O atacado sem nota ainda: quanto deve dar, pela última compra de cada item.
  const estimado = p.itens.reduce((s, i) => s + i.quantidade * (i.precoUnitario ?? i.precoEstimado ?? 0), 0);
  const comProblema = p.itens.filter((i) => i.problema).length;
  /* O pedido está de pé: dá para mandar. Depois de conferido ou cancelado a
     página do fornecedor já recusa o link, e mandar a lista de um pedido
     cancelado seria pedir de novo o que foi desfeito. */
  const daParaEnviar = !p.entregaConfirmada && p.estatus !== "CANCELADO" && podeComprar;
  const esperaComprador = !podeComprar && (p.estatus === "CRIADO" || p.estatus === "AGUARDANDO_FORNECEDOR");

  function recado(): string {
    return recadoDoPedido(p, window.location.origin);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(recado());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro(
        p.token === null
          ? "Não consegui copiar. Selecione o texto e copie à mão."
          : "Não consegui copiar. Selecione o endereço e copie à mão.",
      );
    }
  }

  function whatsapp() {
    if (p.wa === null) return;
    window.open(`${p.wa}?text=${encodeURIComponent(recado())}`, "_blank", "noopener");
    /* Abrir o WhatsApp já conta como mandar: era um segundo toque, em outra
       tela, de que ninguém lembrava — e o pedido ficava "a enviar" depois de
       chegar. Se ele desistir, "Voltar a editar" na página do pedido desfaz. */
    if (p.estatus === "CRIADO" || p.estatus === "AGUARDANDO_FORNECEDOR") {
      startTransition(async () => {
        await marcarEnviado(p.id, true);
      });
    }
  }

  function cancelar() {
    setErro(null);
    startTransition(async () => {
      const r = await cancelarPedido(p.id);
      if (!r.ok) return setErro(r.message);
      setCancelando(false);
    });
  }

  return (
    <li className="card p-3">
      {/* Nome à esquerda e valor à direita, na mesma linha e centrados; o
          selo desceu para a linha de detalhes, onde não empurra nada. */}
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate font-semibold">
          {p.fornecedor}
          {(p.bonificacoes ?? []).some((b) => b.estado !== "CANCELADA") && (
            <span
              className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-medium text-[var(--primary)]"
              title={(p.bonificacoes ?? []).map((b) => bonificacaoPorExtenso(b)).join(" · ")}
            >
              <Gift aria-hidden className="size-3.5" />
              bonificação
            </span>
          )}
        </p>
        {p.atacado && p.total === 0 && semPreco > 0 ? (
          <p className="num-display shrink-0 text-[var(--muted-foreground)]" title="Estimado pela última compra">
            {estimado > 0 ? `≈ ${formatMoney(estimado)}` : "sem estimativa"}
          </p>
        ) : p.total === 0 && semPreco > 0 ? (
          <p className="shrink-0 text-sm text-[var(--muted-foreground)]">a confirmar</p>
        ) : (
          <p className="num-display shrink-0">{formatMoney(p.total)}</p>
        )}
      </div>

      {/* Situação, origem e entrega, com o mesmo espaço entre cada um. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
        <span className="selo" style={{ color: corDoTom(rotulo.tom) }}>
          {rotulo.texto}
        </span>
        {p.cotacaoId !== null ? (
          <Link
            href={`/admin/compras/cotacao/${p.cotacaoId}`}
            className="text-[var(--primary)] underline-offset-4 hover:underline"
          >
            {p.cotacaoNome}
          </Link>
        ) : (
          <span>
            {p.motivoSemPedido
              ? `chegou sem pedido · ${MOTIVO_SEM_PEDIDO[p.motivoSemPedido].texto.toLowerCase()}`
              : p.requisicao
                ? `Compra de rotina ${p.requisicao}`
                : p.atacado
                ? "compra no atacado"
                : p.contagemId !== null
                  ? "pedido direto"
                  : "pedido avulso"}
          </span>
        )}
        {/* Sem "·" entre eles: quando a linha quebra, o ponto ficava sozinho
            no fim de cima. O espaço já separa. */}
        {p.entregaPrevista !== null && <span>chega {formatDiaNumericoString(p.entregaPrevista)}</span>}
      </div>

      {/* Um item por linha, a quantidade alinhada na frente: era um
          parágrafo corrido separado por "·", e com vinte e seis itens o olho
          se perdia no meio. Ainda não é a tabela da conferência — aqui a
          pergunta é só "o que eu pedi para quem". */}
      <ul className="mt-3 divide-y divide-[var(--border)] text-sm">
        {p.itens.map((i, n) => (
          <li key={n} className="flex items-baseline gap-3 py-1.5">
            <span className="num-display w-16 shrink-0 text-right">
              {formatAmount(i.quantidade)} <span className="text-xs text-[var(--muted-foreground)]">{UNIT_LABEL[i.unidade]}</span>
            </span>
            <span className={`min-w-0 flex-1 ${i.emFalta ? "text-[var(--destructive)]" : ""}`}>
              {i.nome}
              {i.emFalta && <span className="text-xs font-semibold"> · em falta</span>}
            </span>
          </li>
        ))}
      </ul>

      {/* "Sem preço" num pedido direto é o fornecedor que ainda não abriu o
          link — e é o que explica um total a confirmar. */}
      {semPreco > 0 && !p.atacado && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--warn)" }}>
          {semPreco === 1 ? "1 item" : `${semPreco} itens`} esperando o preço do fornecedor
        </p>
      )}
      {/* O fornecedor avisou pelo link: dá tempo de buscar em outro lugar. */}
      {emFalta > 0 && !p.entregaConfirmada && (
        <p className="mt-0.5 text-xs font-semibold" style={{ color: "var(--destructive)" }}>
          {emFalta === 1 ? "1 item em falta" : `${emFalta} itens em falta`} no fornecedor
        </p>
      )}
      {/* Recebido com falta, devolução ou avaria: o que a conferência anotou. */}
      {comProblema > 0 && (
        <p className="mt-0.5 text-xs font-semibold" style={{ color: "var(--destructive)" }}>
          {comProblema === 1 ? "1 item com problema" : `${comProblema} itens com problema`} no recebimento
        </p>
      )}

      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}

      {/* A confirmação diz ANTES do clique o que o cancelamento não desfaz.
          É a diferença entre o dono decidir e o dono descobrir: cancelar um
          pedido já recebido deixa a mercadoria na prateleira e o preço no
          histórico, e estornar isso por baixo de quem contou seria pior do
          que não estornar. */}
      {cancelando && (
        <div className="mt-2 space-y-2 rounded border border-dashed border-[var(--border)] p-2.5">
          <p className="text-sm font-medium">
            Cancelar o pedido de {p.fornecedor}, de {formatMoney(p.total)}?
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Ele sai de Recebimentos e o link do fornecedor deixa de funcionar.
            {p.entregaConfirmada &&
              " O que tinha entrado SAI do estoque, e o preço dessa entrada sai do histórico."}{" "}
            Não dá para reabrir depois.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pendente} onClick={cancelar}>
              {pendente ? "Cancelando…" : "Cancelar o pedido"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pendente}
              onClick={() => setCancelando(false)}
            >
              voltar
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
        {/* Mandar é o que esta tela existe para fazer: o WhatsApp vem na
            frente, em verde. Abrir leva à página do pedido (editar, marcar
            como enviado). */}
        {/* No atacado não há a quem mandar: o que se leva é a lista. */}
        {daParaEnviar && p.atacado && (
          <Link
            href={`/admin/compras/pedidos/${p.id}/lista`}
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--botao)] px-4 text-[15px] font-semibold text-[var(--botao-texto)] hover:opacity-90"
          >
            <ShoppingCart aria-hidden className="size-4" />
            Lista de compra
          </Link>
        )}
        {daParaEnviar && !p.atacado && (
          <>
            <button
              type="button"
              disabled={p.wa === null}
              title={p.wa ? "Mandar pelo WhatsApp" : "Este fornecedor não tem telefone cadastrado"}
              aria-label="Mandar pelo WhatsApp"
              onClick={whatsapp}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg bg-[var(--botao)] text-[var(--botao-texto)] hover:opacity-90 disabled:opacity-50"
            >
              <MessageCircle aria-hidden className="size-5" />
            </button>
            <button
              type="button"
              onClick={copiar}
              title={copiado ? "Copiado" : p.token === null ? "Copiar o pedido" : "Copiar o link do pedido"}
              aria-label={copiado ? "Copiado" : p.token === null ? "Copiar o pedido" : "Copiar o link do pedido"}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]"
            >
              {copiado ? (
                <Check aria-hidden className="size-5 text-[var(--ok-strong)]" />
              ) : (
                <Copy aria-hidden className="size-5" />
              )}
            </button>
          </>
        )}
        <Link
          href={`/admin/compras/pedidos/${p.id}`}
          className="inline-flex h-11 flex-1 items-center justify-center rounded-lg border border-[var(--border)] px-4 text-sm font-medium hover:border-[var(--primary)]"
        >
          Abrir
        </Link>

        {/* Cancelar continua valendo para pedido já recebido — decisão do
            dono, tomada sabendo que não estorna nada. Só o já cancelado não
            tem o botão: não há o que cancelar duas vezes. */}
        {p.estatus !== "CANCELADO" && !cancelando && !esperaComprador && (
          <button
            type="button"
            title="Cancelar pedido"
            aria-label="Cancelar pedido"
            onClick={() => {
              setErro(null);
              setCancelando(true);
            }}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--destructive)]"
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>
    </li>
  );
}
