import { bonificacoesDosPedidos } from "@/lib/bonificacoes-dados";
import { prisma } from "@/lib/db";
import { diaISO, nomeDaCotacao } from "@/lib/format";
import { valorDoPedido } from "@/lib/pedido";
import { whatsappNumberLink } from "@/lib/whatsapp";
import type { Prisma } from "@/generated/prisma/client";

import type { PedidoLinhaRow } from "./pedido-linha";

/** Uma linha de pedido, com o que as telas usam para agrupar por rodada. */
export type LinhaDePedido = PedidoLinhaRow & { contadoEm: Date | null; lista: string | null; listaCompraId: number | null };

/** Só os campos que a linha usa. */
const CAMPOS = {
  id: true,
  estatus: true,
  precoTotal: true,
  entregaConfirmada: true,
  dataEntregaPrevista: true,
  cotacaoId: true,
  cotacao: { select: { dataInicio: true } },
  contagemId: true,
  listaCompraId: true,
  listaCompra: { select: { nome: true } },
  naoEntregueEm: true,
  motivoSemPedido: true,
  token: true,
  fornecedor: { select: { name: true, phone: true, compraNoAtacado: true } },
  contagem: { select: { dataContagem: true, listaCompra: { select: { nome: true } } } },
  itens: {
    select: {
      id: true,
      quantidadeSolicitada: true,
      precoUnitario: true,
      precoEstimado: true,
      emFalta: true,
      problemaRecebimento: true,
      quantidadeRecebida: true,
      precoPago: true,
      produto: { select: { name: true, unit: true } },
    },
    orderBy: { produto: { name: "asc" } },
  },
} as const;

/**
 * Os pedidos que atendem `where`, já no formato de `PedidoLinha`.
 *
 * Mora aqui porque duas telas mostram a mesma linha: Pedidos, que é a lista
 * de tudo, e Enviar, que é a rodada de compra na ordem de mandar. Duas cópias
 * da consulta seriam duas linhas que um dia divergem — uma com o WhatsApp
 * montado de um jeito, a outra de outro.
 */
export async function linhasDePedidos(
  where: Prisma.PedidoCompraWhereInput,
  take?: number,
): Promise<LinhaDePedido[]> {
  const pedidos = await prisma.pedidoCompra.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    select: CAMPOS,
  });
  const bonificacoes = await bonificacoesDosPedidos(pedidos.map((p) => p.id));
  return pedidos.map((p) => ({
    id: p.id,
    fornecedor: p.fornecedor.name,
    bonificacoes: bonificacoes.get(p.id) ?? [],
    estatus: p.estatus,
    // Recebido: o que valeu (chegou × pago). Antes: o combinado.
    total: valorDoPedido({
      entregaConfirmada: p.entregaConfirmada,
      total: p.precoTotal.toNumber(),
      itens: p.itens.map((i) => ({
        recebida: i.quantidadeRecebida?.toNumber() ?? null,
        precoPago: i.precoPago?.toNumber() ?? null,
        precoUnitario: i.precoUnitario?.toNumber() ?? null,
      })),
    }),
    entregaConfirmada: p.entregaConfirmada,
    entregaPrevista: p.dataEntregaPrevista === null ? null : diaISO(p.dataEntregaPrevista),
    cotacaoId: p.cotacaoId,
    cotacaoNome: p.cotacao ? nomeDaCotacao(p.cotacao.dataInicio) : null,
    contagemId: p.contagemId,
    motivoSemPedido: p.motivoSemPedido,
    token: p.token,
    // Montado no servidor: o número cru não vira conversa sozinho, e a regra
    // de normalizar mora em `lib/whatsapp`.
    wa: whatsappNumberLink(p.fornecedor.phone),
    atacado: p.fornecedor.compraNoAtacado,
    contadoEm: p.contagem?.dataContagem ?? null,
    // A Requisição: a do pedido (contagem geral ou a dela), ou a da contagem
    // nos pedidos de antes de o pedido lembrar a Requisição.
    lista: p.listaCompra?.nome ?? p.contagem?.listaCompra?.nome ?? null,
    requisicao: p.listaCompra?.nome ?? p.contagem?.listaCompra?.nome ?? null,
    listaCompraId: p.listaCompraId,
    naoEntregue: p.naoEntregueEm !== null,
    itens: p.itens.map((i) => ({
      id: i.id,
      nome: i.produto.name,
      unidade: i.produto.unit,
      quantidade: i.quantidadeSolicitada.toNumber(),
      precoUnitario: i.precoUnitario?.toNumber() ?? null,
      precoEstimado: i.precoEstimado?.toNumber() ?? null,
      emFalta: i.emFalta,
      problema: i.problemaRecebimento,
    })),
  }));
}
