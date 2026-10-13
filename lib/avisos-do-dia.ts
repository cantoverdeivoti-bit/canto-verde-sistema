import { prisma } from "@/lib/db";
import { diaDaqui, diaISO, plural } from "@/lib/format";
import { notificar } from "@/lib/notificar";

/**
 * Os avisos de toda manhã, que não nascem de um ato de ninguém: o que passou
 * da hora. Roda no cron diário (`app/api/cron/relatorio-semanal`, 8h em
 * Ivoti), e cada um vai só para quem escolheu receber.
 *
 * - Pedidos atrasados: passaram da data de entrega e não chegaram. Avisa
 *   todo dia enquanto estiverem atrasados, porque continuam pedindo ação.
 * - Prazos vencidos: cotação sem resposta e contagem sem finalizar cujo
 *   prazo acabou nas últimas 24 h. Uma vez só, para não repetir amanhã.
 */
export async function avisosDoDia(timezone: string, agora: Date = new Date()) {
  const inicioDeHoje = new Date(`${diaISO(diaDaqui(0, timezone, agora))}T00:00:00.000Z`);
  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000);

  const [atrasados, cotacoes, contagens] = await Promise.all([
    prisma.pedidoCompra.findMany({
      where: { estatus: { not: "CANCELADO" }, entregaConfirmada: false, dataEntregaPrevista: { lt: inicioDeHoje } },
      select: { fornecedor: { select: { name: true, apelido: true } } },
    }),
    prisma.cotacao.count({
      where: { estatus: { in: ["ABERTA", "RESPONDENDO"] }, prazoResposta: { gt: ontem, lte: agora } },
    }),
    prisma.contagem.count({
      where: { concluida: false, canceladaEm: null, expiresAt: { gt: ontem, lte: agora } },
    }),
  ]);

  if (atrasados.length > 0) {
    const nomes = [...new Set(atrasados.map((p) => p.fornecedor.apelido ?? p.fornecedor.name))];
    await notificar("compras-atrasado", {
      titulo: `${plural(atrasados.length, "pedido atrasado", "pedidos atrasados")}`,
      corpo: `Passaram da data de entrega e não chegaram: ${nomes.slice(0, 5).join(", ")}${nomes.length > 5 ? " e outros" : ""}.`,
      url: "/admin/compras/recebimentos",
      etiqueta: "compras-atrasado",
    });
  }

  if (cotacoes + contagens > 0) {
    const partes = [
      cotacoes > 0 && `${plural(cotacoes, "cotação", "cotações")} sem resposta`,
      contagens > 0 && `${plural(contagens, "contagem", "contagens")} sem finalizar`,
    ].filter(Boolean);
    await notificar("compras-prazo", {
      titulo: "Prazo vencido",
      corpo: `O prazo acabou: ${partes.join(" e ")}.`,
      url: contagens > 0 && cotacoes === 0 ? "/admin/compras/contagem" : "/admin/compras/cotacao",
      etiqueta: "compras-prazo",
    });
  }

  return { atrasados: atrasados.length, cotacoes, contagens };
}
