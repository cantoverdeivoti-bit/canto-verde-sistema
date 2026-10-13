import { ultimoCustoPorProduto } from "@/lib/historico";

/**
 * Quanto vale um item de pedido. Uma regra só, para toda tela que soma
 * dinheiro de compra dizer o mesmo número.
 *
 * Recebido: o que chegou × o que foi pago (nas entradas de antes do campo
 * `precoPago`, o combinado).
 *
 * Pedido: o que foi pedido × o combinado; sem combinado (atacado, pedido
 * direto esperando o fornecedor), o estimado; sem estimado, o último custo
 * conhecido do produto. Sem nenhum dos três, o item fica fora da soma e conta
 * em `semPreco`, para a tela avisar que o número está curto.
 */

type Numero = { toNumber(): number } | null | undefined;

export type ItemRecebido = { quantidadeRecebida: Numero; precoPago: Numero; precoUnitario: Numero };
export type ItemPedido = { produtoId: number; quantidadeSolicitada: Numero; precoUnitario: Numero; precoEstimado: Numero };
export type Custos = Map<number, { valor: number }>;

/** Preço por unidade do que chegou, ou nulo sem preço nenhum. */
export function precoRecebido(i: Omit<ItemRecebido, "quantidadeRecebida">): number | null {
  return (i.precoPago ?? i.precoUnitario)?.toNumber() ?? null;
}

/** Valor do que chegou, arredondado ao centavo. Zero quando nada chegou ou não há preço. */
export function valorRecebido(i: ItemRecebido): number {
  const q = i.quantidadeRecebida?.toNumber() ?? 0;
  const p = precoRecebido(i);
  return q > 0 && p !== null ? Math.round(q * p * 100) / 100 : 0;
}

/** Preço por unidade do que foi pedido, ou nulo sem preço nenhum. */
export function precoPedido(i: Omit<ItemPedido, "quantidadeSolicitada">, custos: Custos): number | null {
  return (i.precoUnitario ?? i.precoEstimado)?.toNumber() ?? custos.get(i.produtoId)?.valor ?? null;
}

/** Os produtos que vão precisar do último custo: os sem combinado e sem estimado. */
export function produtosSemPreco(itens: Omit<ItemPedido, "quantidadeSolicitada">[]): number[] {
  return [
    ...new Set(itens.filter((i) => i.precoUnitario == null && i.precoEstimado == null).map((i) => i.produtoId)),
  ];
}

/** Busca o último custo só de quem precisa. */
export function custosPara(itens: Omit<ItemPedido, "quantidadeSolicitada">[]): Promise<Custos> {
  return ultimoCustoPorProduto(produtosSemPreco(itens));
}

/** Soma do que foi pedido, e quantos itens ficaram sem preço. */
export function valorPedido(itens: ItemPedido[], custos: Custos): { valor: number; semPreco: number } {
  let valor = 0;
  let semPreco = 0;
  for (const i of itens) {
    const p = precoPedido(i, custos);
    if (p === null) semPreco += 1;
    else valor += (i.quantidadeSolicitada?.toNumber() ?? 0) * p;
  }
  return { valor: Math.round(valor * 100) / 100, semPreco };
}

/**
 * O valor de um pedido inteiro, como as listas mostram: depois de conferido,
 * o que chegou; antes, o que foi pedido.
 */
export function valorDoPedido(
  p: { entregaConfirmada: boolean; itens: (ItemPedido & ItemRecebido)[] },
  custos: Custos,
): number {
  if (p.entregaConfirmada) return Math.round(p.itens.reduce((s, i) => s + valorRecebido(i), 0) * 100) / 100;
  return valorPedido(p.itens, custos).valor;
}
