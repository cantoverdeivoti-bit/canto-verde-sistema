import { Prisma } from "@/generated/prisma/client";
import { formatAmount } from "@/lib/format";
import { faltaParaOLote } from "@/lib/lote";

/**
 * Quanto custa um pedido, somando só o que já tem preço.
 *
 * `PedidoCompra.precoTotal` é derivado e GRAVADO — a tela lê a coluna, não a
 * soma. Isso é escolha boa (o cartão do pedido aparece em três listas e
 * somaria três vezes), mas cobra uma disciplina: toda escrita que mexe em
 * quantidade ou em preço de item tem de refazer o total na mesma transação.
 * Deixar para depois é como o cartão passa a mentir para sempre.
 *
 * **Item sem preço soma zero, e zero aqui não é preço: é parcela que ainda
 * não existe.** Só o pedido direto tem itens assim — entre o link ser gerado
 * e o fornecedor confirmar —, e o total cresce conforme ele responde. O que
 * faltar sai da nota, na conferência do recebimento.
 *
 * Em arquivo próprio porque a conta estava escrita DUAS VEZES, idêntica, em
 * `confirmarPedidoDireto` e em `receberPedido`. Com as ações de editar pedido
 * seriam cinco cópias — e a quinta é sempre a que esquece o `null`.
 */
export function somaDoPedido(
  itens: {
    quantidadeSolicitada: Prisma.Decimal;
    precoUnitario: Prisma.Decimal | null;
  }[],
): Prisma.Decimal {
  return itens.reduce(
    (acc, i) =>
      i.precoUnitario === null
        ? acc
        : acc.plus(i.precoUnitario.times(i.quantidadeSolicitada)),
    new Prisma.Decimal(0),
  );
}

/**
 * O que o pedido custou de fato, depois de recebido: o que chegou × o preço
 * pago (o da nota; sem ele, o combinado). Antes de receber, o total gravado.
 *
 * Existe porque `precoTotal` é o COMBINADO — quantidade pedida × preço
 * acertado — e continua sendo, de propósito: é contra ele que a diferença do
 * recebimento é medida. Mas quem abre um pedido recebido quer ver o que
 * pagou. Mostrar o combinado ali fazia a correção de preço digitada na
 * conferência parecer que não tinha sido gravada.
 */
export function valorDoPedido(p: {
  entregaConfirmada: boolean;
  total: number;
  itens: { recebida?: number | null; precoPago?: number | null; precoUnitario: number | null }[];
}): number {
  if (!p.entregaConfirmada) return p.total;
  const pago = p.itens.reduce(
    (s, i) => s + (i.recebida ?? 0) * (i.precoPago ?? i.precoUnitario ?? 0),
    0,
  );
  return Math.round(pago * 100) / 100;
}

/**
 * Por que uma quantidade não serve no lote, na fala da casa: "Coca-cola: 13
 * não fecha o lote de 12 — seriam 12 ou 24." Nulo quando serve.
 *
 * A mesma frase que `montarCotacao` escreve, agora num lugar só: a edição do
 * pedido e o pedido manual recusam pelo mesmo motivo, e duas grafias da mesma
 * recusa seriam duas regras.
 */
export function foraDoLote(nome: string, quantidade: number, lote: number | null): string | null {
  const f = faltaParaOLote(quantidade, lote);
  if (f === null || lote === null) return null;
  return (
    `${nome}: ${formatAmount(quantidade)} não fecha o lote de ${formatAmount(lote)} — ` +
    (f.abaixo !== null
      ? `seriam ${formatAmount(f.abaixo)} ou ${formatAmount(f.acima)}.`
      : `seriam ${formatAmount(f.acima)}.`)
  );
}
