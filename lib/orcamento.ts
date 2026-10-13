import { formatInTimeZone } from "date-fns-tz";

import { toInstant, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { ultimoCustoPorProduto } from "@/lib/historico";
import { somarDias } from "@/lib/periodo";
import { custosPara, precoPedido, produtosSemPreco, valorPedido, valorRecebido } from "@/lib/valor-do-item";

/**
 * O orçamento de compra da semana: faturamento da semana anterior × meta de
 * CMV teórico. Digitado uma vez, na primeira compra da semana; as compras
 * seguintes só mostram quanto já foi pedido contra ele.
 *
 * Gasto aqui é o que foi PEDIDO (não o que chegou): é isso que se controla na
 * hora de comprar. O recebido e o CMV real ficam para o relatório.
 */

/** Na primeira vez, antes de a casa escolher a sua. */
export const META_CMV_PADRAO = 32;

/** A segunda-feira da semana de um dia do calendário ("2026-09-25" → "2026-09-21"). */
export function segundaDaSemana(dia: string): string {
  const d = new Date(`${dia}T00:00:00.000Z`);
  return somarDias(dia, -((d.getUTCDay() + 6) % 7));
}

function dataDaSemana(segunda: string) {
  return new Date(`${segunda}T00:00:00.000Z`);
}

/**
 * Quanto somam os pedidos criados entre dois instantes, sem os cancelados.
 * Item sem preço ainda (pedido direto esperando o fornecedor, requisição)
 * entra pelo estimado do atacado ou pelo último custo; sem nenhum, conta em
 * `semPreco`.
 */
async function pedidoEntre(inicio: Date, fim: Date, timezone: string) {
  const itens = await prisma.pedidoCompraItem.findMany({
    where: { pedidoCompra: { createdAt: { gte: inicio, lt: fim }, estatus: { not: "CANCELADO" } } },
    select: {
      produtoId: true,
      quantidadeSolicitada: true,
      precoUnitario: true,
      precoEstimado: true,
      pedidoCompra: { select: { id: true, createdAt: true } },
    },
  });
  const custos = await custosPara(itens);

  /* Dia a dia, com a mesma conta: para quem olha a barra ver o que entrou
     e o que ficou de fora (item sem preço nenhum soma zero). */
  const dias = new Map<string, { valor: number; pedidos: Set<number>; semPreco: number }>();
  for (const i of itens) {
    const dia = formatInTimeZone(i.pedidoCompra.createdAt, timezone, "yyyy-MM-dd");
    const d = dias.get(dia) ?? { valor: 0, pedidos: new Set<number>(), semPreco: 0 };
    d.pedidos.add(i.pedidoCompra.id);
    const p = precoPedido(i, custos);
    if (p === null) d.semPreco += 1;
    else d.valor += (i.quantidadeSolicitada?.toNumber() ?? 0) * p;
    dias.set(dia, d);
  }
  return { ...valorPedido(itens, custos), dias };
}

/** Um dia da semana no "Já pedido": quanto somou, de quantos pedidos, e o que ficou sem preço. */
export type DiaDoOrcamento = { dia: string; pedidos: number; valor: number; semPreco: number };

export type OrcamentoDaSemana = {
  /** A segunda-feira ("2026-09-21"). */
  semana: string;
  /** Nulos enquanto ninguém digitou o faturamento desta semana. */
  faturamento: number | null;
  orcamento: number | null;
  /** A desta semana, ou a última usada, para o campo vir preenchido. */
  metaCmv: number;
  /** O que já foi pedido na semana. */
  gasto: number;
  semPreco: number;
  /** De segunda até hoje, um por dia, mesmo os dias sem pedido. */
  porDia: DiaDoOrcamento[];
};

/** O orçamento da semana de hoje, com o que já foi pedido nela. */
export async function orcamentoDaSemana(timezone: string): Promise<OrcamentoDaSemana> {
  const hoje = todayInTimezone(timezone);
  const semana = segundaDaSemana(hoje);
  const [linha, ultima, pedido] = await Promise.all([
    prisma.orcamentoSemana.findUnique({ where: { semana: dataDaSemana(semana) } }),
    prisma.orcamentoSemana.findFirst({ orderBy: { semana: "desc" }, select: { metaCmv: true } }),
    pedidoEntre(toInstant(semana, "00:00", timezone), toInstant(somarDias(semana, 7), "00:00", timezone), timezone),
  ]);
  const porDia: DiaDoOrcamento[] = [];
  for (let dia = semana; dia <= hoje; dia = somarDias(dia, 1)) {
    const d = pedido.dias.get(dia);
    porDia.push({
      dia,
      pedidos: d?.pedidos.size ?? 0,
      valor: Math.round((d?.valor ?? 0) * 100) / 100,
      semPreco: d?.semPreco ?? 0,
    });
  }
  const faturamento = linha ? linha.faturamentoAnterior.toNumber() : null;
  const metaCmv = (linha ?? ultima)?.metaCmv.toNumber() ?? META_CMV_PADRAO;
  return {
    semana,
    faturamento,
    orcamento: faturamento === null ? null : Math.round(faturamento * metaCmv) / 100,
    metaCmv,
    gasto: pedido.valor,
    semPreco: pedido.semPreco,
    porDia,
  };
}

/** Se a semana de hoje já tem orçamento — o que libera montar a compra. */
export async function semanaTemOrcamento(timezone: string): Promise<boolean> {
  const semana = segundaDaSemana(todayInTimezone(timezone));
  const n = await prisma.orcamentoSemana.count({ where: { semana: dataDaSemana(semana) } });
  return n > 0;
}

export type SemanaDoRelatorio = {
  semana: string;
  faturamento: number | null;
  metaCmv: number | null;
  orcamento: number | null;
  pedido: number;
  recebido: number;
  /** Custo do consumo (contagem inicial + entradas − final, ao último custo). */
  consumo: number | null;
  /**
   * O faturamento DESTA semana. Ele só é digitado na segunda seguinte, como
   * "faturamento anterior" da próxima; até lá é nulo.
   */
  faturamentoDaSemana: number | null;
  /**
   * consumo ÷ faturamento da mesma semana, em %. Nulo sem duas contagens na
   * semana ou enquanto o faturamento dela não foi digitado.
   */
  cmvReal: number | null;
};

/**
 * Semana a semana, da semana de `de` à de `ate`, a mais recente primeiro.
 *
 * Uma passada só sobre o período inteiro, e não uma rodada de consultas por
 * semana: eram ~14 idas ao banco por semana (pedido, recebido, balanço, custo
 * e as relações de cada um), ~80 no mês. Aqui são quatro consultas enxutas —
 * só os campos que a conta usa — e o custo, e cada linha cai na sua semana
 * pelo dia do calendário da casa.
 *
 * As regras são as mesmas de antes: pedido é o que foi criado na semana (sem
 * preço, pelo último custo); recebido é o que chegou, pelo preço pago; o
 * consumo é contagem inicial + entradas entre as duas contagens − final, por
 * produto, dentro da semana (a regra de `balancoDeEstoque`).
 */
export async function orcamentosSemanais(
  de: string,
  ate: string,
  timezone: string,
): Promise<SemanaDoRelatorio[]> {
  const semanas: string[] = [];
  for (let s = segundaDaSemana(de); s <= ate; s = somarDias(s, 7)) semanas.push(s);
  if (semanas.length === 0) return [];

  const inicio = toInstant(semanas[0], "00:00", timezone);
  const fim = toInstant(somarDias(semanas[semanas.length - 1], 7), "00:00", timezone);
  const semanaDe = (d: Date) => segundaDaSemana(formatInTimeZone(d, timezone, "yyyy-MM-dd"));

  const [linhas, pedidos, recebidos, contados] = await Promise.all([
    prisma.orcamentoSemana.findMany({
      // Mais a semana seguinte à última: é nela que mora o faturamento desta.
      where: { semana: { in: [...semanas, somarDias(semanas[semanas.length - 1], 7)].map(dataDaSemana) } },
      select: { semana: true, faturamentoAnterior: true, metaCmv: true },
    }),
    prisma.pedidoCompraItem.findMany({
      where: { pedidoCompra: { createdAt: { gte: inicio, lt: fim }, estatus: { not: "CANCELADO" } } },
      select: {
        produtoId: true,
        quantidadeSolicitada: true,
        precoUnitario: true,
        precoEstimado: true,
        pedidoCompra: { select: { createdAt: true } },
      },
    }),
    prisma.pedidoCompraItem.findMany({
      where: {
        quantidadeRecebida: { gt: 0 },
        pedidoCompra: {
          entregaConfirmada: true,
          estatus: { not: "CANCELADO" },
          dataEntregaReal: { gte: inicio, lt: fim },
        },
      },
      select: {
        produtoId: true,
        quantidadeRecebida: true,
        precoUnitario: true,
        precoPago: true,
        pedidoCompra: { select: { dataEntregaReal: true } },
      },
    }),
    prisma.contagemItem.findMany({
      where: {
        quantidadeContada: { not: null },
        contagem: { concluida: true, dataContagem: { gte: inicio, lt: fim } },
      },
      select: { produtoId: true, quantidadeContada: true, contagem: { select: { dataContagem: true } } },
    }),
  ]);

  // Um custo só, para tudo o que precisa dele: item pedido sem preço e
  // produto com balanço.
  const custos = await ultimoCustoPorProduto([
    ...new Set([...produtosSemPreco(pedidos), ...contados.map((c) => c.produtoId)]),
  ]);

  const porSemana = new Map(linhas.map((l) => [l.semana.toISOString().slice(0, 10), l]));
  const pedido = new Map<string, number>();
  const recebido = new Map<string, number>();
  const somar = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  for (const i of pedidos) {
    const preco = precoPedido(i, custos);
    if (preco !== null) somar(pedido, semanaDe(i.pedidoCompra.createdAt), i.quantidadeSolicitada.toNumber() * preco);
  }
  for (const r of recebidos) {
    if (r.pedidoCompra.dataEntregaReal) somar(recebido, semanaDe(r.pedidoCompra.dataEntregaReal), valorRecebido(r));
  }

  // Balanço por semana e produto: primeira e última contagem da semana, e o
  // que chegou entre as duas.
  const contagensPor = new Map<string, { quando: Date; qtd: number }[]>();
  for (const c of contados) {
    const chave = `${semanaDe(c.contagem.dataContagem)}|${c.produtoId}`;
    const lista = contagensPor.get(chave) ?? [];
    lista.push({ quando: c.contagem.dataContagem, qtd: c.quantidadeContada!.toNumber() });
    contagensPor.set(chave, lista);
  }
  const entradasPor = new Map<string, { quando: Date; qtd: number }[]>();
  for (const r of recebidos) {
    if (!r.pedidoCompra.dataEntregaReal) continue;
    const chave = `${semanaDe(r.pedidoCompra.dataEntregaReal)}|${r.produtoId}`;
    const lista = entradasPor.get(chave) ?? [];
    lista.push({ quando: r.pedidoCompra.dataEntregaReal, qtd: r.quantidadeRecebida!.toNumber() });
    entradasPor.set(chave, lista);
  }
  const consumo = new Map<string, number>();
  for (const [chave, lista] of contagensPor) {
    lista.sort((a, b) => a.quando.getTime() - b.quando.getTime());
    const primeira = lista[0];
    const ultima = lista[lista.length - 1];
    if (lista.length < 2 || primeira.quando.getTime() === ultima.quando.getTime()) continue;
    const entradas = (entradasPor.get(chave) ?? [])
      .filter((e) => e.quando > primeira.quando && e.quando <= ultima.quando)
      .reduce((s, e) => s + e.qtd, 0);
    const [semana, produtoId] = chave.split("|");
    const qtd = Math.round((primeira.qtd + entradas - ultima.qtd) * 1000) / 1000;
    somar(consumo, semana, qtd * (custos.get(Number(produtoId))?.valor ?? 0));
  }

  return semanas
    .map((semana) => {
      const o = porSemana.get(semana);
      const faturamento = o ? o.faturamentoAnterior.toNumber() : null;
      const metaCmv = o ? o.metaCmv.toNumber() : null;
      const c = consumo.has(semana) ? Math.round(consumo.get(semana)! * 100) / 100 : null;
      // O CMV compara o consumo da semana com o que ela mesma faturou. O
      // faturamento digitado nesta semana é o da anterior: dividir por ele
      // misturava duas semanas.
      const seguinte = porSemana.get(somarDias(semana, 7));
      const faturamentoDaSemana = seguinte ? seguinte.faturamentoAnterior.toNumber() : null;
      return {
        semana,
        faturamento,
        metaCmv,
        orcamento: faturamento !== null && metaCmv !== null ? Math.round(faturamento * metaCmv) / 100 : null,
        pedido: Math.round((pedido.get(semana) ?? 0) * 100) / 100,
        recebido: Math.round((recebido.get(semana) ?? 0) * 100) / 100,
        consumo: c,
        faturamentoDaSemana,
        cmvReal: c !== null && faturamentoDaSemana ? (c / faturamentoDaSemana) * 100 : null,
      };
    })
    .reverse();
}
