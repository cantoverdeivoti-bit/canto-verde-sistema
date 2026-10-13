import { formatInTimeZone } from "date-fns-tz";

import { guardModule } from "@/lib/auth-guard";
import { getSettings } from "@/lib/availability";
import { bonificacoesDosPedidos } from "@/lib/bonificacoes-dados";
import { prisma } from "@/lib/db";
import { diaISO, nomeDaCotacao } from "@/lib/format";
import { valorDoPedido } from "@/lib/pedido";
import { produtosParaPedido } from "@/lib/produtos-para-pedido";

import { TelaDeRecebimentos, type Linha } from "./tela";

export const dynamic = "force-dynamic";
export const metadata = { title: "Receber pedidos — Compras" };

/**
 * O caminhão encostou, e agora.
 *
 * A conferência existia dentro do histórico de Contagem de estoque e dentro de
 * cada cotação — dois lugares, e nenhum deles é onde se está quando a
 * mercadoria chega. Pior: para achar o pedido era preciso lembrar de que
 * rodada ele saiu, e quem recebe não pensa em rodada, pensa no nome escrito
 * na nota.
 *
 * Aqui a pergunta é a de quem está com a caixa na mão: quem entregou, o que
 * era para vir, o que veio. Agrupado por fornecedor e ordenado pela entrega
 * prevista, a mais próxima primeiro.
 */
/** Quantos recebidos a tela mostra: os mais recentes. O resto está em Relatórios → Pedidos. */
const RECEBIDOS_NA_TELA = 30;

export default async function RecebimentosPage({
  searchParams,
}: PageProps<"/admin/compras/recebimentos">) {
  // Liberada também pelo link de atalhos (estoquista e recebedor).
  const user = await guardModule("compras", { atalho: true });
  // Só os campos que a tela usa. O que espera entrega vem todo; o que já foi
  // recebido, só os últimos — antes vinha o histórico inteiro, com as linhas
  // completas, a cada visita.
  const campos = {
    id: true,
    createdAt: true,
    cotacaoId: true,
    cotacao: { select: { dataInicio: true } },
    contagemId: true,
    estatus: true,
    precoTotal: true,
    entregaConfirmada: true,
    dataEntregaPrevista: true,
    dataEntregaReal: true,
    motivoSemPedido: true,
    divergenciaDesfecho: true,
    fornecedor: { select: { id: true, name: true, compraNoAtacado: true } },
    itens: {
      select: {
        id: true,
        produtoId: true,
        quantidadeSolicitada: true,
        precoUnitario: true,
        precoEstimado: true,
        emFalta: true,
        marca: true,
        quantidadeRecebida: true,
        problemaRecebimento: true,
        precoPago: true,
        produto: { select: { name: true, unit: true, avaliarQualidade: true } },
      },
    },
  } as const;
  const [esperando, recebidos, timezone, { entrada }] = await Promise.all([
    // Cancelado não é entrega atrasada, é pedido que não existe mais. Deixá-lo
    // aqui seria a tela cobrando uma conferência que nunca vai acontecer.
    prisma.pedidoCompra.findMany({
      where: { estatus: { not: "CANCELADO" }, entregaConfirmada: false },
      orderBy: { createdAt: "asc" },
      select: campos,
    }),
    prisma.pedidoCompra.findMany({
      where: { estatus: { not: "CANCELADO" }, entregaConfirmada: true },
      orderBy: { dataEntregaReal: "desc" },
      take: RECEBIDOS_NA_TELA,
      select: campos,
    }),
    getSettings().then((s) => s.capacity.timezone),
    searchParams,
  ]);
  // A tela espera a ordem de criação (ela mesma inverte os recebidos).
  const pedidos = [...esperando, ...recebidos.reverse()];
  /* Para incluir na conferência o que veio fora do pedido: os produtos e as
     categorias (cadastro rápido). Só quando há o que conferir. */
  const [bonificacoes, paraIncluir] = await Promise.all([
    bonificacoesDosPedidos(pedidos.map((p) => p.id)),
    esperando.length === 0
      ? undefined
      : Promise.all([
          produtosParaPedido(),
          prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
        ]).then(([produtos, categorias]) => ({ produtos, categorias })),
  ]);

  // Recebido, o total é o que valeu (o que chegou × o preço pago), não o combinado.
  const linhas: Linha[] = pedidos.map((p) => ({
    id: p.id,
    fornecedor: p.fornecedor.name,
    fornecedorId: p.fornecedor.id,
    criadoEm: formatInTimeZone(p.createdAt, timezone, "yyyy-MM-dd"),
    cotacaoId: p.cotacaoId,
    cotacaoNome: p.cotacao ? nomeDaCotacao(p.cotacao.dataInicio, timezone) : null,
    contagemId: p.contagemId,
    estatus: p.estatus,
    total: p.precoTotal.toNumber(),
    entregaConfirmada: p.entregaConfirmada,
    entregaPrevista: p.dataEntregaPrevista === null ? null : diaISO(p.dataEntregaPrevista),
    recebidoEm:
      p.dataEntregaReal === null ? null : formatInTimeZone(p.dataEntregaReal, timezone, "yyyy-MM-dd"),
    motivoSemPedido: p.motivoSemPedido,
    desfecho: p.divergenciaDesfecho,
    atacado: p.fornecedor.compraNoAtacado,
    itens: p.itens.map((i) => ({
      id: i.id,
      produtoId: i.produtoId,
      nome: i.produto.name,
      unidade: i.produto.unit,
      quantidade: i.quantidadeSolicitada.toNumber(),
      precoUnitario: i.precoUnitario?.toNumber() ?? null,
      precoEstimado: i.precoEstimado?.toNumber() ?? null,
      emFalta: i.emFalta,
      marca: i.marca,
      recebida: i.quantidadeRecebida?.toNumber() ?? null,
      problema: i.problemaRecebimento,
      precoPago: i.precoPago?.toNumber() ?? null,
      avaliar: i.produto.avaliarQualidade,
    })),
    bonificacoes: bonificacoes.get(p.id) ?? [],
  })).map((l) => ({ ...l, total: valorDoPedido(l) }));

  // Voltando de "Chegou sem pedido": a entrada nova já aberta nos recebidos.
  const entradaAberta = typeof entrada === "string" && /^\d+$/.test(entrada) ? Number(entrada) : undefined;
  return (
    <TelaDeRecebimentos
      linhas={linhas}
      entradaAberta={entradaAberta}
      timezone={timezone}
      peloLink={user.atalho}
      paraIncluir={paraIncluir}
    />
  );
}
