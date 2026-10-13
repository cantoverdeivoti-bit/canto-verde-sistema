import { Prisma } from "@/generated/prisma/client";
import { diaDaqui } from "@/lib/format";
import type { UltimoCusto } from "@/lib/historico";
import { novoToken } from "@/lib/token";

/**
 * O pedido direto que nasce da conferência — de um exclusivo que digita o
 * preço pelo link, ou de um atacado, onde a casa vai buscar.
 *
 * Um lugar só porque são dois caminhos que criam o mesmo pedido: o
 * "Confirmar" de cada fornecedor e o botão do fim, que monta o resto da
 * rodada. Duas cópias desta regra seriam dois pedidos diferentes para a
 * mesma coisa.
 *
 * No atacado ninguém do outro lado digita preço, então:
 * - sem `token` — não há link, e o recado do pedido não o oferece;
 * - sem previsão de entrega — quem busca é a casa, no dia que for;
 * - cada item leva `precoEstimado`, o último custo congelado agora. Fica fora
 *   de `precoUnitario` de propósito: o combinado é o da nota, digitado ao
 *   receber, e um estimado ali viraria "diferença" em Pendências.
 */
export function dadosDoPedidoDireto(
  fornecedor: { deliveryDays: number | null; compraNoAtacado: boolean },
  itens: { produtoId: number; quantidade: Prisma.Decimal }[],
  custo: Map<number, UltimoCusto>,
) {
  const atacado = fornecedor.compraNoAtacado;
  return {
    token: atacado ? null : novoToken(),
    dataEntregaPrevista:
      atacado || fornecedor.deliveryDays === null ? null : diaDaqui(fornecedor.deliveryDays),
    precoTotal: 0,
    itens: {
      // Um INSERT só para os itens, e não um por item.
      createMany: {
        data: itens.map((i) => {
          const estimado = atacado ? custo.get(i.produtoId) : undefined;
          return {
            produtoId: i.produtoId,
            quantidadeSolicitada: i.quantidade,
            // Em branco: o exclusivo confirma pelo link, ou quem recebe
            // digita o da nota. Nulo aqui não é zero.
            precoUnitario: null,
            precoEstimado: estimado ? new Prisma.Decimal(estimado.valor) : null,
          };
        }),
      },
    },
  };
}
