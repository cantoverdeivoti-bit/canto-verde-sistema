import { formatInTimeZone } from "date-fns-tz";

import { toInstant, todayInTimezone } from "@/lib/availability";
import { valorDaBonificacao } from "@/lib/bonificacoes";
import { prisma } from "@/lib/db";
import { ultimoCustoPorProduto } from "@/lib/historico";
import { creditosAReceber } from "@/lib/pendencias";
import { somarDias } from "@/lib/periodo";
import { mediasPorFornecedor } from "@/lib/qualidade";
import { custosPara, precoRecebido, valorPedido, valorRecebido } from "@/lib/valor-do-item";
import { Prisma, type ProductUnit } from "@/generated/prisma/client";

/**
 * As consultas dos relatórios de compras. Só leitura.
 *
 * Gasto é o que CHEGOU: quantidade recebida × preço, na data da entrega. Não
 * `precoTotal`, que é calculado sobre a quantidade pedida — o pedido de 20 kg
 * que chegou com 15 custou 15. O que foi pedido e ainda não chegou é "a
 * caminho", e fica fora do gasto até ser conferido em Recebimentos.
 */

/** O período em instantes: do começo do primeiro dia ao começo do dia seguinte ao último. */
export function instantesDoPeriodo(de: string, ate: string, timezone: string) {
  return {
    inicio: toInstant(de, "00:00", timezone),
    fim: toInstant(somarDias(ate, 1), "00:00", timezone),
  };
}

export type CompraRecebida = {
  produtoId: number;
  nome: string;
  unidade: ProductUnit;
  categoria: string;
  ordemCategoria: number;
  fornecedorId: number;
  fornecedor: string;
  quantidade: number;
  valor: number;
  /** Preço por unidade pago (valor ÷ quantidade). */
  preco: number;
  pedidoId: number;
};

const SEM_CATEGORIA = "Sem categoria";

export async function comprasRecebidas(inicio: Date, fim: Date, produtoId?: number): Promise<CompraRecebida[]> {
  const itens = await prisma.pedidoCompraItem.findMany({
    where: {
      ...(produtoId !== undefined ? { produtoId } : {}),
      pedidoCompra: { entregaConfirmada: true, estatus: { not: "CANCELADO" }, dataEntregaReal: { gte: inicio, lt: fim } },
      quantidadeRecebida: { gt: 0 },
      OR: [{ precoPago: { not: null } }, { precoUnitario: { not: null } }],
    },
    select: {
      pedidoCompraId: true,
      quantidadeRecebida: true,
      precoUnitario: true,
      precoPago: true,
      pedidoCompra: { select: { fornecedor: { select: { id: true, name: true, apelido: true } } } },
      produto: {
        select: {
          id: true,
          name: true,
          unit: true,
          category: { select: { name: true, sortOrder: true } },
        },
      },
    },
  });
  return itens.map((i) => {
    const quantidade = i.quantidadeRecebida!.toNumber();
    const preco = precoRecebido(i)!;
    return {
      produtoId: i.produto.id,
      nome: i.produto.name,
      unidade: i.produto.unit,
      categoria: i.produto.category?.name ?? SEM_CATEGORIA,
      ordemCategoria: i.produto.category?.sortOrder ?? 999,
      fornecedorId: i.pedidoCompra.fornecedor.id,
      fornecedor: i.pedidoCompra.fornecedor.apelido ?? i.pedidoCompra.fornecedor.name,
      quantidade,
      valor: valorRecebido(i),
      preco,
      pedidoId: i.pedidoCompraId,
    };
  });
}

/**
 * Pedidos feitos e ainda não recebidos: quantos, e quanto somam pela regra
 * do valor pedido (`lib/valor-do-item`). `semPreco` são os itens sem preço
 * nenhum, que ficam fora da soma.
 */
export async function aCaminho() {
  const itens = await prisma.pedidoCompraItem.findMany({
    where: { pedidoCompra: { entregaConfirmada: false, estatus: { not: "CANCELADO" } } },
    select: { pedidoCompraId: true, produtoId: true, quantidadeSolicitada: true, precoUnitario: true, precoEstimado: true },
  });
  const { valor, semPreco } = valorPedido(itens, await custosPara(itens));
  return { pedidos: new Set(itens.map((i) => i.pedidoCompraId)).size, valor, semPreco };
}

/** Soma por produto — a base da curva ABC e do consumo. */
export function porProduto(linhas: CompraRecebida[]) {
  const mapa = new Map<
    number,
    { produtoId: number; nome: string; unidade: ProductUnit; categoria: string; quantidade: number; valor: number; pedidos: Set<number> }
  >();
  for (const l of linhas) {
    const p = mapa.get(l.produtoId);
    if (p) {
      p.quantidade += l.quantidade;
      p.valor += l.valor;
      p.pedidos.add(l.pedidoId);
    } else {
      mapa.set(l.produtoId, {
        produtoId: l.produtoId,
        nome: l.nome,
        unidade: l.unidade,
        categoria: l.categoria,
        quantidade: l.quantidade,
        valor: l.valor,
        pedidos: new Set([l.pedidoId]),
      });
    }
  }
  return [...mapa.values()].map(({ pedidos, ...p }) => ({ ...p, compras: pedidos.size }));
}

/** Soma por categoria, da maior para a menor, com o % do total. */
export function porCategoria(linhas: CompraRecebida[]) {
  const mapa = new Map<string, number>();
  for (const l of linhas) mapa.set(l.categoria, (mapa.get(l.categoria) ?? 0) + l.valor);
  const total = linhas.reduce((s, l) => s + l.valor, 0);
  return [...mapa]
    .map(([categoria, valor]) => ({ categoria, valor, pct: total > 0 ? (valor / total) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

export type PrecoNoTempo = {
  data: Date;
  preco: number;
  /** Nulo = compra antiga, importada do sistema anterior. */
  fornecedor: string | null;
};

/** O histórico de preço de um produto (todo, ou só o do período), do mais antigo ao mais novo. */
export async function precosDoProduto(produtoId: number, periodo?: { inicio: Date; fim: Date }): Promise<PrecoNoTempo[]> {
  const linhas = await prisma.historicoPrecosCompra.findMany({
    where: { produtoId, ...(periodo ? { dataCompra: { gte: periodo.inicio, lt: periodo.fim } } : {}) },
    orderBy: { dataCompra: "asc" },
    select: {
      dataCompra: true,
      precoUnitario: true,
      fornecedor: { select: { name: true, apelido: true } },
    },
  });
  return linhas.map((l) => ({
    data: l.dataCompra,
    preco: l.precoUnitario.toNumber(),
    fornecedor: l.fornecedor ? (l.fornecedor.apelido ?? l.fornecedor.name) : null,
  }));
}

export type LinhaDeEstoque = {
  produtoId: number;
  nome: string;
  unidade: ProductUnit;
  categoria: string;
  ordemCategoria: number;
  inicial: number;
  inicialEm: Date;
  final: number;
  finalEm: Date;
  entradas: number;
  /** inicial + entradas − final. Negativo = a conta não fecha (contagem ou recebimento errado). */
  consumo: number;
};

/**
 * O balanço de estoque do período, produto a produto:
 * contagem inicial + entradas − contagem final = consumo.
 *
 * Inicial é a PRIMEIRA contagem finalizada do produto no período e final é a
 * ÚLTIMA; entradas são os recebimentos conferidos entre as duas. Produto com
 * uma contagem só no período não tem balanço — volta em \`umaContagem\`, para a
 * tela dizer por que ele não está na conta.
 */
export async function balancoDeEstoque(inicio: Date, fim: Date) {
  const contados = await prisma.contagemItem.findMany({
    where: {
      quantidadeContada: { not: null },
      contagem: { concluida: true, dataContagem: { gte: inicio, lt: fim } },
    },
    select: {
      produtoId: true,
      quantidadeContada: true,
      contagem: { select: { dataContagem: true } },
      produto: {
        select: { name: true, unit: true, category: { select: { name: true, sortOrder: true } } },
      },
    },
  });

  const porProduto = new Map<number, typeof contados>();
  for (const c of contados) {
    const l = porProduto.get(c.produtoId);
    if (l) l.push(c);
    else porProduto.set(c.produtoId, [c]);
  }

  const linhas: LinhaDeEstoque[] = [];
  const umaContagem: { produtoId: number; nome: string }[] = [];
  const janelas = new Map<number, { de: Date; ate: Date }>();
  for (const [produtoId, lista] of porProduto) {
    lista.sort((a, b) => a.contagem.dataContagem.getTime() - b.contagem.dataContagem.getTime());
    const primeira = lista[0];
    const ultima = lista[lista.length - 1];
    if (lista.length < 2 || primeira.contagem.dataContagem.getTime() === ultima.contagem.dataContagem.getTime()) {
      umaContagem.push({ produtoId, nome: primeira.produto.name });
      continue;
    }
    janelas.set(produtoId, { de: primeira.contagem.dataContagem, ate: ultima.contagem.dataContagem });
    linhas.push({
      produtoId,
      nome: primeira.produto.name,
      unidade: primeira.produto.unit,
      categoria: primeira.produto.category?.name ?? SEM_CATEGORIA,
      ordemCategoria: primeira.produto.category?.sortOrder ?? 999,
      inicial: primeira.quantidadeContada!.toNumber(),
      inicialEm: primeira.contagem.dataContagem,
      final: ultima.quantidadeContada!.toNumber(),
      finalEm: ultima.contagem.dataContagem,
      entradas: 0,
      consumo: 0,
    });
  }

  // As entradas de cada produto entre as suas duas contagens.
  if (linhas.length > 0) {
    const recebidos = await prisma.pedidoCompraItem.findMany({
      where: {
        produtoId: { in: linhas.map((l) => l.produtoId) },
        quantidadeRecebida: { gt: 0 },
        pedidoCompra: { entregaConfirmada: true, estatus: { not: "CANCELADO" }, dataEntregaReal: { gte: inicio, lt: fim } },
      },
      select: { produtoId: true, quantidadeRecebida: true, pedidoCompra: { select: { dataEntregaReal: true } } },
    });
    const porId = new Map(linhas.map((l) => [l.produtoId, l]));
    for (const r of recebidos) {
      const j = janelas.get(r.produtoId);
      const quando = r.pedidoCompra.dataEntregaReal!;
      if (!j || quando <= j.de || quando > j.ate) continue;
      porId.get(r.produtoId)!.entradas += r.quantidadeRecebida!.toNumber();
    }
  }
  for (const l of linhas) {
    l.consumo = Math.round((l.inicial + l.entradas - l.final) * 1000) / 1000;
  }

  return { linhas, umaContagem };
}

export type DesempenhoDoFornecedor = {
  fornecedorId: number;
  nome: string;
  /** Σ recebido × preço pago (ou o combinado, nas entradas de antes). */
  gasto: number;
  pedidos: number;
  /**
   * Pedidos com previsão de entrega — a base do "no prazo". Inclui os que
   * venceram e ainda não chegaram (`semChegar`), que contam como atraso.
   */
  comPrevisao: number;
  noPrazo: number;
  /** Previsão vencida dentro do período, e o pedido ainda não chegou. */
  semChegar: number;
  /** Encerrados em Recebimentos com "Não foi entregue" no período. Os que
      tinham previsão contam também como fora do prazo. */
  naoEntregue: number;
  /** Média de dias de atraso dos que atrasaram. */
  atrasoMedio: number | null;
  falta: number;
  devolvido: number;
  avaria: number;
  /** Σ (pago − combinado) × recebido. Positivo: pagou mais que o combinado. */
  diferencaPreco: number;
};

/**
 * Como cada fornecedor entregou no período: quanto a casa gastou com ele, se
 * chegou no dia prometido, e o que veio com problema. Só pedidos recebidos e
 * não cancelados, pela data em que chegaram.
 *
 * Atraso é em dias do calendário da casa: chegou no dia previsto é no prazo,
 * a qualquer hora. Pedido sem previsão fica fora da conta do prazo.
 *
 * O pedido que tinha de chegar no período, já passou do dia e não chegou
 * também conta como atraso: sem isso, o fornecedor que nunca entrega some
 * da conta e parece pontual.
 */
export async function desempenhoDosFornecedores(
  inicio: Date,
  fim: Date,
  timezone: string,
): Promise<DesempenhoDoFornecedor[]> {
  // A previsão é data de calendário gravada ao meio-dia UTC: vencida é
  // antes da meia-noite UTC de hoje (dia da casa).
  const hoje = new Date(`${todayInTimezone(timezone)}T00:00:00.000Z`);
  const [pedidos, pendentes, naoEntregues] = await Promise.all([
    prisma.pedidoCompra.findMany({
      where: {
        entregaConfirmada: true,
        estatus: { not: "CANCELADO" },
        dataEntregaReal: { gte: inicio, lt: fim },
      },
      select: {
        fornecedorId: true,
        dataEntregaReal: true,
        dataEntregaPrevista: true,
        fornecedor: { select: { name: true, apelido: true } },
        itens: {
          select: {
            quantidadeRecebida: true,
            precoUnitario: true,
            precoPago: true,
            problemaRecebimento: true,
          },
        },
      },
    }),
    prisma.pedidoCompra.findMany({
      where: {
        entregaConfirmada: false,
        estatus: { not: "CANCELADO" },
        dataEntregaPrevista: { gte: inicio, lt: fim < hoje ? fim : hoje },
      },
      select: { fornecedorId: true, fornecedor: { select: { name: true, apelido: true } } },
    }),
    prisma.pedidoCompra.findMany({
      where: { naoEntregueEm: { gte: inicio, lt: fim } },
      select: {
        fornecedorId: true,
        dataEntregaPrevista: true,
        fornecedor: { select: { name: true, apelido: true } },
      },
    }),
  ]);

  const porFornecedor = new Map<number, DesempenhoDoFornecedor & { somaAtraso: number; atrasados: number }>();
  const doFornecedor = (p: { fornecedorId: number; fornecedor: { name: string; apelido: string | null } }) => {
    let d = porFornecedor.get(p.fornecedorId);
    if (!d) {
      d = {
        fornecedorId: p.fornecedorId,
        nome: p.fornecedor.apelido ?? p.fornecedor.name,
        gasto: 0,
        pedidos: 0,
        comPrevisao: 0,
        noPrazo: 0,
        semChegar: 0,
        naoEntregue: 0,
        atrasoMedio: null,
        falta: 0,
        devolvido: 0,
        avaria: 0,
        diferencaPreco: 0,
        somaAtraso: 0,
        atrasados: 0,
      };
      porFornecedor.set(p.fornecedorId, d);
    }
    return d;
  };
  for (const p of pendentes) {
    const d = doFornecedor(p);
    d.comPrevisao += 1;
    d.semChegar += 1;
  }
  // Não veio e não vem mais: falha dele, e fora do prazo quando tinha data.
  for (const p of naoEntregues) {
    const d = doFornecedor(p);
    d.naoEntregue += 1;
    if (p.dataEntregaPrevista) d.comPrevisao += 1;
  }
  for (const p of pedidos) {
    const d = doFornecedor(p);
    d.pedidos += 1;

    if (p.dataEntregaPrevista && p.dataEntregaReal) {
      d.comPrevisao += 1;
      // A previsão é data de calendário gravada ao meio-dia UTC; a chegada é
      // um instante, lido no relógio da casa.
      const previsto = p.dataEntregaPrevista.toISOString().slice(0, 10);
      const chegou = formatInTimeZone(p.dataEntregaReal, timezone, "yyyy-MM-dd");
      if (chegou <= previsto) d.noPrazo += 1;
      else {
        d.atrasados += 1;
        d.somaAtraso += Math.round(
          (new Date(`${chegou}T12:00:00Z`).getTime() - new Date(`${previsto}T12:00:00Z`).getTime()) / 86_400_000,
        );
      }
    }

    for (const i of p.itens) {
      if (i.problemaRecebimento === "FALTA") d.falta += 1;
      if (i.problemaRecebimento === "DEVOLVIDO") d.devolvido += 1;
      if (i.problemaRecebimento === "AVARIA") d.avaria += 1;
      const q = i.quantidadeRecebida?.toNumber() ?? 0;
      d.gasto += valorRecebido(i);
      if (q > 0 && i.precoPago && i.precoUnitario) {
        d.diferencaPreco += q * (i.precoPago.toNumber() - i.precoUnitario.toNumber());
      }
    }
  }

  return [...porFornecedor.values()]
    .map(({ somaAtraso, atrasados, ...d }) => ({
      ...d,
      gasto: Math.round(d.gasto * 100) / 100,
      diferencaPreco: Math.round(d.diferencaPreco * 100) / 100,
      atrasoMedio: atrasados > 0 ? Math.round((somaAtraso / atrasados) * 10) / 10 : null,
    }))
    .sort((a, b) => b.gasto - a.gasto);
}

export type ExtrasDoFornecedor = {
  /** Média de estrelas de tudo que ele entregou e foi avaliado. */
  estrelas: { media: number; n: number } | null;
  /** Itens pedidos a ele no período, e quantos ele avisou "em falta". */
  itensPedidos: number;
  itensEmFalta: number;
  /** Horas, em média, entre o convite da cotação e a resposta. */
  respostaHoras: number | null;
  /** Créditos combinados em divergência e ainda não abatidos (de qualquer época). */
  creditos: number;
  /** O que ele deu de bonificação no período, em reais (ver `bonificacoesRecebidas`). */
  bonificacao: number;
};

/**
 * O que completa o desempenho: qualidade, falta no estoque dele, quanto
 * demora para responder cotação e o que ele ainda deve em crédito. Separado
 * de `desempenhoDosFornecedores` porque aquele roda também na escolha
 * automática da cotação, que não precisa disto.
 *
 * A resposta conta até a ÚLTIMA vez que ele enviou: quem corrige a resposta
 * depois aparece mais lento do que foi na primeira.
 */
export async function extrasDosFornecedores(inicio: Date, fim: Date): Promise<Map<number, ExtrasDoFornecedor>> {
  const [estrelas, itens, convites, creditos, bonificacoes] = await Promise.all([
    mediasPorFornecedor(),
    prisma.pedidoCompraItem.findMany({
      where: { pedidoCompra: { createdAt: { gte: inicio, lt: fim }, estatus: { not: "CANCELADO" } } },
      select: { emFalta: true, pedidoCompra: { select: { fornecedorId: true } } },
    }),
    prisma.cotacaoFornecedor.findMany({
      where: { dataRespostaRecebida: { gte: inicio, lt: fim } },
      select: { fornecedorId: true, dataEnvio: true, dataRespostaRecebida: true },
    }),
    creditosAReceber(),
    bonificacoesRecebidas(inicio, fim),
  ]);

  const out = new Map<number, ExtrasDoFornecedor & { somaHoras: number; respostas: number }>();
  const de = (id: number) => {
    let e = out.get(id);
    if (!e) {
      e = {
        estrelas: null,
        itensPedidos: 0,
        itensEmFalta: 0,
        respostaHoras: null,
        creditos: 0,
        bonificacao: 0,
        somaHoras: 0,
        respostas: 0,
      };
      out.set(id, e);
    }
    return e;
  };
  for (const [id, m] of estrelas) de(id).estrelas = m;
  for (const i of itens) {
    const e = de(i.pedidoCompra.fornecedorId);
    e.itensPedidos += 1;
    if (i.emFalta) e.itensEmFalta += 1;
  }
  for (const c of convites) {
    const e = de(c.fornecedorId);
    e.somaHoras += (c.dataRespostaRecebida!.getTime() - c.dataEnvio.getTime()) / 3_600_000;
    e.respostas += 1;
  }
  for (const c of creditos) de(c.fornecedorId).creditos += c.valor;
  for (const [id, v] of bonificacoes.porFornecedor) de(id).bonificacao = v;

  return new Map(
    [...out].map(([id, { somaHoras, respostas, ...e }]) => [
      id,
      {
        ...e,
        creditos: Math.round(e.creditos * 100) / 100,
        respostaHoras: respostas > 0 ? Math.round((somaHoras / respostas) * 10) / 10 : null,
      },
    ]),
  );
}

/**
 * Quanto a casa economizou negociando no período: para cada item de pedido
 * de cotação criado no período cujo preço foi negociado, (preço de antes −
 * preço negociado) × quantidade pedida. Só conta negociação que virou
 * pedido — negociar e não comprar não economiza nada.
 */
export async function economiaNegociada(inicio: Date, fim: Date): Promise<{ valor: number; itens: number }> {
  const [r] = await prisma.$queryRaw<{ valor: Prisma.Decimal | null; itens: bigint }[]>`
    SELECT SUM((pr."precoNegociadoDe" - pr."precoUnitario") * i."quantidadeSolicitada") AS valor,
           COUNT(*) AS itens
      FROM "pedido_compra_itens" i
      JOIN "pedidos_compra" pc ON pc.id = i."pedidoCompraId"
      JOIN "cotacao_itens" ci ON ci."cotacaoId" = pc."cotacaoId" AND ci."produtoId" = i."produtoId"
      JOIN "cotacao_fornecedores" cf ON cf."cotacaoId" = pc."cotacaoId" AND cf."fornecedorId" = pc."fornecedorId"
      JOIN "precos" pr ON pr."cotacaoItemId" = ci.id AND pr."cotacaoFornecedorId" = cf.id
     WHERE pc.estatus <> 'CANCELADO'
       AND pc."createdAt" >= ${inicio} AND pc."createdAt" < ${fim}
       AND pr."precoNegociadoDe" IS NOT NULL
       AND pr."precoNegociadoDe" > pr."precoUnitario"`;
  return { valor: Math.round((r?.valor?.toNumber() ?? 0) * 100) / 100, itens: Number(r?.itens ?? 0) };
}

/**
 * O que os fornecedores deram de bonificação no período, em reais.
 *
 * - Unidades a mais e brinde: o que veio × o último custo do produto (o de
 *   hoje — a bonificação não grava preço). Sem custo conhecido, vale zero.
 * - Desconto na nota: o valor combinado, no dia em que veio abatido.
 * - Crédito: o valor combinado, no dia em que foi abatido num pedido — antes
 *   disso é promessa, e está em "Créditos a receber".
 */
export async function bonificacoesRecebidas(
  inicio: Date,
  fim: Date,
): Promise<{ valor: number; itens: number; porFornecedor: Map<number, number> }> {
  const linhas = await prisma.bonificacao.findMany({
    where: {
      OR: [
        { estado: "RECEBIDA", recebidaEm: { gte: inicio, lt: fim } },
        { estado: "ABATIDA", resolvidaEm: { gte: inicio, lt: fim } },
      ],
    },
    select: { fornecedorId: true, tipo: true, produtoId: true, quantidade: true, quantidadeRecebida: true, valor: true },
  });
  const custos = await ultimoCustoPorProduto([
    ...new Set(linhas.flatMap((b) => (b.produtoId === null ? [] : [b.produtoId]))),
  ]);
  const porFornecedor = new Map<number, number>();
  let valor = 0;
  for (const b of linhas) {
    const v = valorDaBonificacao(
      {
        tipo: b.tipo,
        quantidade: b.quantidade?.toNumber() ?? null,
        quantidadeRecebida: b.quantidadeRecebida?.toNumber() ?? null,
        valor: b.valor?.toNumber() ?? null,
      },
      b.produtoId === null ? null : (custos.get(b.produtoId)?.valor ?? null),
    );
    valor += v;
    porFornecedor.set(b.fornecedorId, Math.round(((porFornecedor.get(b.fornecedorId) ?? 0) + v) * 100) / 100);
  }
  return { valor: Math.round(valor * 100) / 100, itens: linhas.length, porFornecedor };
}
