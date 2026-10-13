import type { Prisma } from "@/generated/prisma/client";
import { DIAS_DA_SEMANA, plural } from "@/lib/format";
import { getSettings } from "@/lib/availability";
import { ultimoCustoPorProduto } from "@/lib/historico";
import { dadosDoPedidoDireto } from "@/lib/pedido-direto";
import { inicioDeHoje } from "@/lib/requisicao";
import { calcularSugestoes } from "@/lib/sugestao";

/** "Hortifruti Ivoti · segunda": o nome sai do fornecedor e do dia, sempre. */
export function nomeDaLista(fornecedor: { name: string; apelido: string | null }, diaSemana: number) {
  return `${fornecedor.apelido ?? fornecedor.name} · ${DIAS_DA_SEMANA[diaSemana]}`;
}

/**
 * A compra direta que nasce da contagem de uma compra de rotina, no momento
 * em que ela é finalizada. É o único caminho automático da rotina: a
 * contagem geral de estoque não faz pedido de rotina.
 *
 * Roda DENTRO da transação de `fecharContagem`: o estoque gravado e o pedido
 * criado são a mesma decisão, e um sem o outro deixaria a lista contada e
 * ninguém sabendo que faltou pedir.
 *
 * A conta é a de sempre (ideal do dia menos o contado, arredondado ao lote,
 * por `calcularSugestoes`), e tudo vai para o fornecedor da lista: quem
 * montou a lista já disse de quem compra. O pedido é o mesmo pedido direto
 * da conferência (`dadosDoPedidoDireto`): link de preço para o fornecedor ou,
 * no atacado, o preço estimado.
 *
 * Um pedido por compra de rotina por dia: se já há um de hoje e ele ainda não
 * foi enviado, os produtos que faltavam entram nele; enviado, fica como está
 * e o recado diz o que ficou de fora.
 *
 * `processadaEm` é marcado sempre: a contagem da lista não pode aparecer
 * depois na conferência e ser pedida de novo.
 */
export async function pedidoDaLista(
  tx: Prisma.TransactionClient,
  contagemId: number,
  listaId: number,
): Promise<{ pedidoId: number | null; recado: string }> {
  await tx.contagem.update({ where: { id: contagemId }, data: { processadaEm: new Date() } });
  // A mesma trava do pedido feito à mão: duas contagens finalizando juntas não fazem dois pedidos.
  await tx.$queryRaw`SELECT id FROM "listas_compra" WHERE id = ${listaId} FOR UPDATE`;
  const lista = await tx.listaCompra.findUnique({
    where: { id: listaId },
    select: {
      fornecedorId: true,
      fornecedor: { select: { deliveryDays: true, compraNoAtacado: true, name: true, apelido: true } },
      itens: { select: { produtoId: true, idealStock: true } },
    },
  });
  if (!lista) return { pedidoId: null, recado: "" };
  const fornecedor = lista.fornecedor.apelido ?? lista.fornecedor.name;

  const contados = await tx.contagemItem.findMany({
    where: { contagemId, quantidadeContada: { not: null } },
    select: { produtoId: true, quantidadeContada: true },
  });
  const produtos = await tx.product.findMany({
    where: { id: { in: contados.map((c) => c.produtoId) }, isActive: true },
    select: { id: true, idealStock: true, lotSize: true, categoryId: true, exclusiveSupplierId: true },
  });
  // O ideal deste dia, o da compra de rotina; fora dela, o produto não entra.
  const idealDoDia = new Map(lista.itens.map((i) => [i.produtoId, i.idealStock]));
  const { sugestoes } = calcularSugestoes(
    contados.map((c) => ({ produtoId: c.produtoId, quantidadeContada: c.quantidadeContada! })),
    produtos.flatMap((p) => {
      const ideal = idealDoDia.get(p.id);
      return ideal === undefined ? [] : [{ ...p, idealStock: ideal }];
    }),
  );

  const { capacity } = await getSettings();
  const ja = await tx.pedidoCompra.findFirst({
    where: { listaCompraId: listaId, createdAt: { gte: inicioDeHoje(capacity.timezone) }, estatus: { not: "CANCELADO" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, estatus: true, itens: { select: { produtoId: true } } },
  });

  if (ja) {
    const noPedido = new Set(ja.itens.map((i) => i.produtoId));
    const novos = sugestoes.filter((s) => !noPedido.has(s.produtoId));
    if (novos.length === 0) {
      return { pedidoId: ja.id, recado: `O pedido #${ja.id} de ${fornecedor} já tinha tudo o que falta.` };
    }
    if (ja.estatus !== "CRIADO") {
      return {
        pedidoId: ja.id,
        recado: `O pedido #${ja.id} de ${fornecedor} já foi enviado: ${plural(novos.length, "produto ficou", "produtos ficaram")} de fora.`,
      };
    }
    const custo = lista.fornecedor.compraNoAtacado ? await ultimoCustoPorProduto(novos.map((s) => s.produtoId)) : new Map();
    await tx.pedidoCompraItem.createMany({
      data: dadosDoPedidoDireto(
        lista.fornecedor,
        novos.map((s) => ({ produtoId: s.produtoId, quantidade: s.quantidadeSolicitada })),
        custo,
      ).itens.createMany.data.map((i) => ({ ...i, pedidoCompraId: ja.id })),
    });
    return {
      pedidoId: ja.id,
      recado: `${plural(novos.length, "produto entrou", "produtos entraram")} no pedido #${ja.id} de ${fornecedor}.`,
    };
  }

  if (sugestoes.length === 0) {
    return { pedidoId: null, recado: `Nada para pedir hoje: tudo no estoque ideal de ${fornecedor}.` };
  }

  const custo = lista.fornecedor.compraNoAtacado ? await ultimoCustoPorProduto(sugestoes.map((s) => s.produtoId)) : new Map();
  const pedido = await tx.pedidoCompra.create({
    data: {
      fornecedorId: lista.fornecedorId,
      contagemId,
      listaCompraId: listaId,
      ...dadosDoPedidoDireto(
        lista.fornecedor,
        sugestoes.map((s) => ({ produtoId: s.produtoId, quantidade: s.quantidadeSolicitada })),
        custo,
      ),
    },
    select: { id: true },
  });
  return {
    pedidoId: pedido.id,
    recado: `Pedido #${pedido.id} para ${fornecedor} pronto, com ${plural(sugestoes.length, "produto", "produtos")}.`,
  };
}
