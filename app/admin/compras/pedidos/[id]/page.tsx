import { notFound } from "next/navigation";

import { Pagina } from "@/components/pagina";
import { getSettings } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { MOTIVO_SEM_PEDIDO } from "@/lib/cotacao-labels";
import { prisma } from "@/lib/db";
import { diaISO, formatDayAndMonth, nomeDaCotacao } from "@/lib/format";
import { bonificacoesDosPedidos } from "@/lib/bonificacoes-dados";
import { valorDoPedido } from "@/lib/pedido";
import { produtosParaPedido } from "@/lib/produtos-para-pedido";
import { can } from "@/lib/roles";
import { whatsappNumberLink } from "@/lib/whatsapp";

import { PedidoDetalhe } from "./pedido-detalhe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedido — Compras" };

/**
 * Um pedido só: onde se edita, se manda e se imprime.
 *
 * A lista de Pedidos mostra tudo numa linha por pedido e não edita nada.
 * Mudar quantidade, tirar e acrescentar produto, digitar o preço combinado
 * por telefone, marcar como enviado — isso precisa de espaço, e mora aqui.
 *
 * Pedido de cotação aparece, mas não se edita: os números dele são os que o
 * fornecedor cotou, e a cotação é o lugar de mudar.
 */
export default async function PedidoPage({ params, searchParams }: PageProps<"/admin/compras/pedidos/[id]">) {
  const user = await guardModule("compras", { atalho: true });

  const { id } = await params;
  const pedidoId = Number(id);
  if (!Number.isInteger(pedidoId)) notFound();
  /* Veio do lápis da conferência: a volta é para ela, e não para a lista de
     pedidos. Só números e vírgulas, para o link nunca apontar para fora. */
  const { volta } = await searchParams;
  const voltaParaConferir = typeof volta === "string" && /^\d+(,\d+)*$/.test(volta) ? volta : null;

  const [pedido, produtos, { capacity }, bonificacoes] = await Promise.all([
    prisma.pedidoCompra.findUnique({
      where: { id: pedidoId },
      // Só os campos que a página usa.
      select: {
        id: true,
        estatus: true,
        precoTotal: true,
        entregaConfirmada: true,
        dataEntregaPrevista: true,
        dataEnvio: true,
        cotacaoId: true,
        cotacao: { select: { dataInicio: true } },
        contagemId: true,
        listaCompra: { select: { nome: true } },
        naoEntregueEm: true,
        motivoSemPedido: true,
        token: true,
        fornecedor: { select: { id: true, name: true, phone: true, compraNoAtacado: true } },
        contagem: { select: { dataContagem: true, listaCompra: { select: { nome: true } } } },
        itens: {
          select: {
            produtoId: true,
            id: true,
            quantidadeSolicitada: true,
            precoUnitario: true,
            precoEstimado: true,
            emFalta: true,
            quantidadeRecebida: true,
            problemaRecebimento: true,
            precoPago: true,
            produto: { select: { name: true, unit: true, lotSize: true, avaliarQualidade: true } },
            // As estrelas desta entrega: de quem recebeu e do dono.
            avaliacoes: {
              select: {
                origem: true,
                nota: true,
                comentario: true,
                autor: { select: { name: true, username: true } },
              },
            },
          },
          orderBy: { produto: { name: "asc" } },
        },
      },
    }),
    produtosParaPedido(),
    getSettings(),
    bonificacoesDosPedidos([pedidoId]),
  ]);
  if (!pedido) notFound();

  const origem =
    pedido.cotacao && pedido.cotacaoId !== null
      ? { tipo: "cotacao" as const, texto: nomeDaCotacao(pedido.cotacao.dataInicio, capacity.timezone), href: `/admin/compras/cotacao/${pedido.cotacaoId}` }
      : pedido.contagemId !== null
        ? {
            tipo: "contagem" as const,
            texto: `${pedido.contagem?.listaCompra ? `Compra de rotina ${pedido.contagem.listaCompra.nome}` : "Pedido direto"} · contagem de ${
              pedido.contagem ? formatDayAndMonth(pedido.contagem.dataContagem, capacity.timezone) : "—"
            }`,
            href: null,
          }
        : pedido.listaCompra
          ? { tipo: "avulso" as const, texto: `Compra de rotina ${pedido.listaCompra.nome} · contagem do dia`, href: null }
        : pedido.motivoSemPedido
          ? { tipo: "avulso" as const, texto: `Chegou sem pedido · ${MOTIVO_SEM_PEDIDO[pedido.motivoSemPedido].texto}`, href: null }
          : { tipo: "avulso" as const, texto: "Pedido manual", href: null };

  return (
    <Pagina largura="estreita">
      <PedidoDetalhe
        // Pelo link de atalhos a lista de pedidos pede login: a volta é para os atalhos.
        voltar={{
          href: user.atalho
            ? "/atalhos"
            : voltaParaConferir
              ? `/admin/compras/conferir?c=${voltaParaConferir}`
              : "/admin/compras/pedidos",
          texto: user.atalho ? "Atalhos" : voltaParaConferir ? "Conferir lista" : "Pedidos",
        }}
        peloLink={user.atalho}
        podeComprar={can(user, "compras", { configure: true })}
        pedido={{
          id: pedido.id,
          fornecedor: pedido.fornecedor.name,
          fornecedorId: pedido.fornecedor.id,
          estatus: pedido.estatus,
          naoEntregue: pedido.naoEntregueEm !== null,
          // Recebido: o que valeu (chegou × pago). Antes: o combinado.
          total: valorDoPedido({
            entregaConfirmada: pedido.entregaConfirmada,
            total: pedido.precoTotal.toNumber(),
            itens: pedido.itens.map((i) => ({
              recebida: i.quantidadeRecebida?.toNumber() ?? null,
              precoPago: i.precoPago?.toNumber() ?? null,
              precoUnitario: i.precoUnitario?.toNumber() ?? null,
            })),
          }),
          entregaConfirmada: pedido.entregaConfirmada,
          entregaPrevista: pedido.dataEntregaPrevista === null ? null : diaISO(pedido.dataEntregaPrevista),
          enviadoEm:
            pedido.dataEnvio === null ? null : formatDayAndMonth(pedido.dataEnvio, capacity.timezone),
          cotacaoId: pedido.cotacaoId,
          token: pedido.token,
          wa: whatsappNumberLink(pedido.fornecedor.phone),
          atacado: pedido.fornecedor.compraNoAtacado,
          // A cotação pede login: pelo link, a origem é só texto.
          origem: user.atalho ? { ...origem, href: null } : origem,
          bonificacoes: bonificacoes.get(pedido.id) ?? [],
          itens: pedido.itens.map((i) => ({
            id: i.id,
            produtoId: i.produtoId,
            nome: i.produto.name,
            unidade: i.produto.unit,
            lote: i.produto.lotSize === null ? null : i.produto.lotSize.toNumber(),
            quantidade: i.quantidadeSolicitada.toNumber(),
            precoUnitario: i.precoUnitario?.toNumber() ?? null,
            precoEstimado: i.precoEstimado?.toNumber() ?? null,
            emFalta: i.emFalta,
            recebida: i.quantidadeRecebida?.toNumber() ?? null,
            problema: i.problemaRecebimento,
            precoPago: i.precoPago?.toNumber() ?? null,
            // Avaliável: produto marcado (ou que já tem nota) e que chegou.
            qualidade:
              (i.produto.avaliarQualidade || i.avaliacoes.length > 0) && (i.quantidadeRecebida?.toNumber() ?? 0) > 0
                ? {
                    recebimento: (() => {
                      const a = i.avaliacoes.find((x) => x.origem === "RECEBIMENTO");
                      return a
                        ? { nota: a.nota, comentario: a.comentario, autor: a.autor?.name ?? a.autor?.username ?? null }
                        : null;
                    })(),
                    dono: (() => {
                      const a = i.avaliacoes.find((x) => x.origem === "DONO");
                      return a ? { nota: a.nota, comentario: a.comentario } : null;
                    })(),
                  }
                : null,
          })),
        }}
        // O catálogo só serve para acrescentar item e combinar bonificação, e
        // as duas coisas acabam quando o pedido chega ou é cancelado: aí ele
        // não vai para a tela.
        produtos={(pedido.entregaConfirmada || pedido.estatus === "CANCELADO" ? [] : produtos).map((p) => ({
          id: p.id,
          nome: p.nome,
          unidade: p.unidade,
          lote: p.lote,
          doFornecedor: p.fornecedorIds.includes(pedido.fornecedor.id),
        }))}
      />
    </Pagina>
  );
}
