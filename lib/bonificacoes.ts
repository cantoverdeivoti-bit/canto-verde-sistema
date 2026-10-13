import { UNIT_LABEL, formatAmount, formatMoney } from "@/lib/format";
import type { EstadoBonificacao, ProductUnit, TipoBonificacao } from "@/generated/prisma/client";

/**
 * As bonificações negociadas com fornecedores, sem banco: os nomes, o texto
 * que vai na mensagem ao fornecedor, o valor de cada uma e o que elas mudam
 * no total a pagar. Usado pela cotação, pelo pedido, pelo recebimento, pelas
 * pendências e pelos relatórios — para todos dizerem a mesma coisa.
 *
 * O preço de tabela nunca muda: a bonificação é um ganho à parte.
 */

export const TIPOS_DE_BONIFICACAO: { tipo: TipoBonificacao; nome: string; dica: string }[] = [
  { tipo: "UNIDADES", nome: "Unidades a mais", dica: "do mesmo produto, de graça" },
  { tipo: "BRINDE", nome: "Brinde", dica: "outro produto, de graça" },
  { tipo: "DESCONTO_NA_NOTA", nome: "Desconto na nota", dica: "valor abatido neste pedido" },
  { tipo: "CREDITO", nome: "Crédito", dica: "valor para um próximo pedido" },
];

export const ESTADO_DA_BONIFICACAO: Record<EstadoBonificacao, string> = {
  COMBINADA: "combinada",
  RECEBIDA: "recebida",
  NAO_VEIO: "não veio",
  ABATIDA: "crédito abatido",
  CANCELADA: "cancelada",
};

/** Os tipos que são mercadoria (contam no estoque) e os que são dinheiro. */
export const eMercadoria = (tipo: TipoBonificacao) => tipo === "UNIDADES" || tipo === "BRINDE";

/** A bonificação já pronta para mostrar: números simples, nome do produto resolvido. */
export type BonificacaoParaMostrar = {
  id: number;
  tipo: TipoBonificacao;
  estado: EstadoBonificacao;
  produto: { nome: string; unidade: ProductUnit } | null;
  quantidade: number | null;
  valor: number | null;
  nota: string | null;
  quantidadeRecebida: number | null;
};

/**
 * Uma linha por extenso: "+ 1 CX de Óleo de algodão", "2 UN de Água (brinde)",
 * "R$ 50,00 de desconto na nota", "R$ 30,00 de crédito para o próximo pedido".
 */
export function bonificacaoPorExtenso(b: Pick<BonificacaoParaMostrar, "tipo" | "produto" | "quantidade" | "valor">): string {
  switch (b.tipo) {
    case "UNIDADES":
      return `+ ${formatAmount(b.quantidade)} ${b.produto ? `${UNIT_LABEL[b.produto.unidade]} de ${b.produto.nome}` : ""}`.trim();
    case "BRINDE":
      return `${formatAmount(b.quantidade)} ${b.produto ? `${UNIT_LABEL[b.produto.unidade]} de ${b.produto.nome}` : ""} (brinde)`;
    case "DESCONTO_NA_NOTA":
      return `${formatMoney(b.valor ?? 0)} de desconto na nota`;
    case "CREDITO":
      return `${formatMoney(b.valor ?? 0)} de crédito para o próximo pedido`;
  }
}

/** O bloco que entra na mensagem ao fornecedor. Vazio sem bonificação. */
export function bonificacoesNoTexto(bs: Pick<BonificacaoParaMostrar, "tipo" | "produto" | "quantidade" | "valor" | "estado">[]): string[] {
  const vivas = bs.filter((b) => b.estado !== "CANCELADA");
  if (vivas.length === 0) return [];
  return ["", "Bonificação combinada:", ...vivas.map((b) => `- ${bonificacaoPorExtenso(b)}`)];
}

/** Quanto sai da nota deste pedido: a soma dos descontos na nota que valem. */
export function descontoNaNota(bs: Pick<BonificacaoParaMostrar, "tipo" | "valor" | "estado">[]): number {
  return bs
    .filter((b) => b.tipo === "DESCONTO_NA_NOTA" && b.estado !== "CANCELADA" && b.estado !== "NAO_VEIO")
    .reduce((s, b) => s + (b.valor ?? 0), 0);
}

/** Quanto fica de crédito para depois. */
export function creditoCombinado(bs: Pick<BonificacaoParaMostrar, "tipo" | "valor" | "estado">[]): number {
  return bs
    .filter((b) => b.tipo === "CREDITO" && b.estado !== "CANCELADA")
    .reduce((s, b) => s + (b.valor ?? 0), 0);
}

/**
 * Quanto a bonificação vale em reais. Dinheiro vale o combinado; mercadoria
 * vale a quantidade (a recebida, se já veio) × o custo do produto, que quem
 * chama passa (o último custo). Sem custo conhecido, a mercadoria vale zero
 * — melhor um ganho a menos no relatório do que um número inventado.
 */
export function valorDaBonificacao(
  b: Pick<BonificacaoParaMostrar, "tipo" | "quantidade" | "valor" | "quantidadeRecebida">,
  custo: number | null,
): number {
  if (!eMercadoria(b.tipo)) return b.valor ?? 0;
  const q = b.quantidadeRecebida ?? b.quantidade ?? 0;
  return custo === null ? 0 : Math.round(q * custo * 100) / 100;
}
