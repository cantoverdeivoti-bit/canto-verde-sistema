import { bonificacoesNoTexto, descontoNaNota, type BonificacaoParaMostrar } from "@/lib/bonificacoes";
import { UNIT_LABEL, formatAmount, formatDateString, formatMoney } from "@/lib/format";
import type { ProductUnit } from "@/generated/prisma/client";

/** O mínimo de um pedido para escrevê-lo por extenso. */
export type PedidoParaTexto = {
  total: number;
  entregaPrevista: string | null;
  token: string | null;
  itens: {
    nome: string;
    unidade: ProductUnit;
    quantidade: number;
    /** Nulo é "o fornecedor ainda não confirmou". */
    precoUnitario: number | null;
  }[];
  /** O que foi combinado de bonificação: vai no fim da mensagem. */
  bonificacoes?: BonificacaoParaMostrar[];
};

/**
 * O pedido escrito por extenso, do jeito que vai pelo WhatsApp.
 *
 * É o pedido com preço acertado (da cotação, ou digitado pela casa): não há o
 * que o fornecedor digitar, então não há link — o que ele precisa receber é a
 * lista, o preço combinado e o total, para conferir e confirmar.
 *
 * Item sem preço sai sem preço, e não com "R$ 0,00": zero num pedido quase
 * nunca quer dizer de graça, e mandá-lo para o fornecedor é convidar uma
 * discussão que a casa vai perder.
 *
 * Rascunho, nunca envio: abre a conversa com o texto pronto e quem manda é a
 * pessoa. É a regra que `lib/whatsapp.ts` já segue em toda a casa.
 *
 * Mora aqui, e não dentro de `pedido-linha.tsx`, porque a página do pedido
 * manda o mesmo texto — duas cópias dele seriam duas conversas diferentes
 * com o mesmo fornecedor.
 */
export function pedidoPorExtenso(p: PedidoParaTexto): string {
  const linhas = p.itens.map((i) => {
    const quanto = `${formatAmount(i.quantidade)} ${UNIT_LABEL[i.unidade]} de ${i.nome}`;
    return i.precoUnitario === null
      ? `- ${quanto}`
      : `- ${quanto} — ${formatMoney(i.precoUnitario)}/${UNIT_LABEL[i.unidade]}`;
  });

  const bonificacoes = p.bonificacoes ?? [];
  const desconto = descontoNaNota(bonificacoes);
  return [
    "Olá! Segue nosso pedido:",
    "",
    ...linhas,
    ...bonificacoesNoTexto(bonificacoes),
    "",
    desconto > 0
      ? `Total: ${formatMoney(p.total)} − ${formatMoney(desconto)} de desconto = ${formatMoney(Math.max(p.total - desconto, 0))}`
      : `Total: ${formatMoney(p.total)}`,
    ...(p.entregaPrevista === null
      ? []
      : [`Entrega combinada: ${formatDateString(p.entregaPrevista)}`]),
    "",
    "Pode confirmar, por favor?",
  ].join("\n");
}

/**
 * O que vai para o fornecedor: o link quando ele tem preço a digitar, e o
 * pedido escrito quando o preço já foi acertado. São as duas conversas que
 * existem, e cada pedido só tem uma delas.
 */
export function recadoDoPedido(p: PedidoParaTexto, origem: string): string {
  return p.token === null
    ? pedidoPorExtenso(p)
    : [
        `Olá! Segue nosso pedido. Confira os itens e digite seu preço por aqui: ${origem}/comprador/pedido/${p.token}`,
        ...bonificacoesNoTexto(p.bonificacoes ?? []),
      ].join("\n");
}
