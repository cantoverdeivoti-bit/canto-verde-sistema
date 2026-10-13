import { cache } from "react";

import { prisma } from "@/lib/db";
import { dataDaCotacao } from "@/lib/format";
import type { ItemDoAviso } from "@/lib/avisos";
import { blocoDoAviso, type BlocoDeAviso } from "@/lib/blocos-de-aviso";
import { bonificacaoPorExtenso, eMercadoria, valorDaBonificacao } from "@/lib/bonificacoes";
import { ultimoCustoPorProduto } from "@/lib/historico";
import type { Prisma, ProblemaRecebimento, ProductUnit, TipoAviso } from "@/generated/prisma/client";

/**
 * O que em Compras espera por alguém: o que pede decisão (aprovar, recusar,
 * resolver) e o que falta nos cadastros para o resto funcionar sozinho.
 *
 * Só leitura. As decisões moram em `lib/actions/pendencias.ts` e nas ações
 * que já existiam (autorizar produto novo, oferta de fornecedor).
 */

// ---------------------------------------------------------------------------
// Divergência de recebimento — regra pura
// ---------------------------------------------------------------------------

export type ItemConferido = {
  quantidadeSolicitada: number;
  /** Nulo no pedido já recebido = ninguém tocou no item = não veio. */
  quantidadeRecebida: number | null;
  /** O combinado. */
  precoUnitario: number | null;
  /** O da nota. */
  precoPago: number | null;
  problema: ProblemaRecebimento | null;
};

export type Divergencia = {
  /** Quanto veio a menos (0 quando veio o pedido ou mais). */
  faltou: number;
  /** Quanto veio a mais. */
  sobrou: number;
  /** Pago acima (+) ou abaixo (−) do combinado, por unidade. */
  diferencaPreco: number;
  problema: ProblemaRecebimento | null;
  /** R$ pagos acima do combinado no que chegou. Negativo = pagou menos. */
  pagoAMais: number;
  /** O que não veio, a preço combinado. */
  valorQueFaltou: number;
};

/**
 * O item chegou diferente do combinado? Quantidade a menos ou a mais, preço
 * da nota diferente (um centavo de tolerância, do arredondamento) ou um
 * problema marcado na conferência. Nulo quando veio certo.
 */
export function divergenciaDoItem(i: ItemConferido): Divergencia | null {
  const veio = i.quantidadeRecebida ?? 0;
  const faltou = Math.max(i.quantidadeSolicitada - veio, 0);
  const sobrou = Math.max(veio - i.quantidadeSolicitada, 0);
  const diferencaPreco =
    i.precoPago !== null && i.precoUnitario !== null ? i.precoPago - i.precoUnitario : 0;
  const precoDiferente = Math.abs(diferencaPreco) >= 0.005;
  if (faltou < 0.0005 && sobrou < 0.0005 && !precoDiferente && i.problema === null) return null;
  return {
    faltou,
    sobrou,
    diferencaPreco: precoDiferente ? diferencaPreco : 0,
    problema: i.problema,
    pagoAMais: precoDiferente ? Math.round(diferencaPreco * veio * 100) / 100 : 0,
    valorQueFaltou: i.precoUnitario !== null ? Math.round(faltou * i.precoUnitario * 100) / 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// As listas
// ---------------------------------------------------------------------------

export type PedidoComDivergencia = {
  id: number;
  fornecedor: string;
  recebidoEm: Date | null;
  itens: {
    id: number;
    nome: string;
    unidade: ProductUnit;
    quantidadeSolicitada: number;
    quantidadeRecebida: number;
    precoUnitario: number | null;
    precoPago: number | null;
    divergencia: Divergencia;
  }[];
  pagoAMais: number;
  valorQueFaltou: number;
};

/**
 * Os pedidos recebidos com diferença ainda sem desfecho — filtrados no banco,
 * pela mesma regra de `divergenciaDoItem`, para não ler todo pedido já
 * recebido a cada tela (o número do menu roda em todas).
 */
async function idsComDivergencia(): Promise<number[]> {
  const linhas = await prisma.$queryRaw<{ id: number }[]>`
    SELECT DISTINCT pc.id
      FROM "pedidos_compra" pc
      JOIN "pedido_compra_itens" i ON i."pedidoCompraId" = pc.id
     WHERE pc."entregaConfirmada" = true
       AND pc.estatus <> 'CANCELADO'
       AND pc."divergenciaResolvidaEm" IS NULL
       AND (
         COALESCE(i."quantidadeRecebida", 0) <> i."quantidadeSolicitada"
         OR i."problemaRecebimento" IS NOT NULL
         OR (i."precoPago" IS NOT NULL AND i."precoUnitario" IS NOT NULL
             AND abs(i."precoPago" - i."precoUnitario") >= 0.005)
       )`;
  return linhas.map((l) => l.id);
}

/** Pedidos recebidos com diferença ainda sem desfecho, o mais recente primeiro. */
async function pedidosComDivergencia(): Promise<PedidoComDivergencia[]> {
  const ids = await idsComDivergencia();
  if (ids.length === 0) return [];
  const pedidos = await prisma.pedidoCompra.findMany({
    where: { id: { in: ids } },
    orderBy: { dataEntregaReal: "desc" },
    select: {
      id: true,
      dataEntregaReal: true,
      fornecedor: { select: { name: true, apelido: true } },
      itens: {
        select: {
          id: true,
          quantidadeSolicitada: true,
          quantidadeRecebida: true,
          precoUnitario: true,
          precoPago: true,
          problemaRecebimento: true,
          produto: { select: { name: true, unit: true } },
        },
      },
    },
  });
  const out: PedidoComDivergencia[] = [];
  for (const p of pedidos) {
    const itens = p.itens.flatMap((i) => {
      const item = {
        quantidadeSolicitada: i.quantidadeSolicitada.toNumber(),
        quantidadeRecebida: i.quantidadeRecebida?.toNumber() ?? null,
        precoUnitario: i.precoUnitario?.toNumber() ?? null,
        precoPago: i.precoPago?.toNumber() ?? null,
        problema: i.problemaRecebimento,
      };
      const divergencia = divergenciaDoItem(item);
      return divergencia
        ? [
            {
              id: i.id,
              nome: i.produto.name,
              unidade: i.produto.unit,
              ...item,
              quantidadeRecebida: item.quantidadeRecebida ?? 0,
              divergencia,
            },
          ]
        : [];
    });
    if (itens.length === 0) continue;
    out.push({
      id: p.id,
      fornecedor: p.fornecedor.apelido ?? p.fornecedor.name,
      recebidoEm: p.dataEntregaReal,
      itens,
      pagoAMais: itens.reduce((s, i) => s + i.divergencia.pagoAMais, 0),
      valorQueFaltou: itens.reduce((s, i) => s + i.divergencia.valorQueFaltou, 0),
    });
  }
  return out;
}

export type CreditoAReceber = {
  /** O pedido (divergência) ou a bonificação, conforme `origem`. */
  id: number;
  origem: "divergencia" | "bonificacao";
  /** O pedido de onde o crédito veio. */
  pedidoId: number | null;
  fornecedorId: number;
  fornecedor: string;
  combinadoEm: Date | null;
  nota: string | null;
  /** O que veio a menos (a preço combinado) mais o que se pagou a mais. */
  valor: number;
};

/**
 * Os créditos combinados em divergências e ainda não abatidos. O desfecho
 * "crédito" quer dizer "vai abatido no próximo pedido" — e até alguém marcar
 * que abateu, é dinheiro que o fornecedor deve à casa.
 *
 * Junto, os créditos de bonificação: combinados no pedido (ou a bonificação
 * que não veio e virou crédito), valendo depois que o pedido foi recebido.
 */
export async function creditosAReceber(): Promise<CreditoAReceber[]> {
  const [pedidos, bonificacoes] = await Promise.all([creditosDeDivergencia(), creditosDeBonificacao()]);
  return [...pedidos, ...bonificacoes];
}

async function creditosDeBonificacao(): Promise<CreditoAReceber[]> {
  const linhas = await prisma.bonificacao.findMany({
    where: {
      tipo: "CREDITO",
      estado: "COMBINADA",
      pedidoCompra: { is: { entregaConfirmada: true, estatus: { not: "CANCELADO" } } },
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      fornecedorId: true,
      pedidoCompraId: true,
      valor: true,
      nota: true,
      createdAt: true,
      resolvidaEm: true,
      fornecedor: { select: { name: true, apelido: true } },
    },
  });
  return linhas.map((b) => ({
    id: b.id,
    origem: "bonificacao" as const,
    pedidoId: b.pedidoCompraId,
    fornecedorId: b.fornecedorId,
    fornecedor: b.fornecedor.apelido ?? b.fornecedor.name,
    combinadoEm: b.resolvidaEm ?? b.createdAt,
    nota: b.nota,
    valor: b.valor?.toNumber() ?? 0,
  }));
}

async function creditosDeDivergencia(): Promise<CreditoAReceber[]> {
  const pedidos = await prisma.pedidoCompra.findMany({
    where: { divergenciaDesfecho: "CREDITO", creditoAbatidoEm: null, estatus: { not: "CANCELADO" } },
    orderBy: { divergenciaResolvidaEm: "asc" },
    select: {
      id: true,
      fornecedorId: true,
      divergenciaResolvidaEm: true,
      divergenciaNota: true,
      fornecedor: { select: { name: true, apelido: true } },
      itens: {
        select: {
          quantidadeSolicitada: true,
          quantidadeRecebida: true,
          precoUnitario: true,
          precoPago: true,
          problemaRecebimento: true,
        },
      },
    },
  });
  return pedidos.map((p) => {
    let valor = 0;
    for (const i of p.itens) {
      const d = divergenciaDoItem({
        quantidadeSolicitada: i.quantidadeSolicitada.toNumber(),
        quantidadeRecebida: i.quantidadeRecebida?.toNumber() ?? null,
        precoUnitario: i.precoUnitario?.toNumber() ?? null,
        precoPago: i.precoPago?.toNumber() ?? null,
        problema: i.problemaRecebimento,
      });
      if (d) valor += Math.max(d.pagoAMais, 0) + d.valorQueFaltou;
    }
    return {
      id: p.id,
      origem: "divergencia" as const,
      pedidoId: p.id,
      fornecedorId: p.fornecedorId,
      fornecedor: p.fornecedor.apelido ?? p.fornecedor.name,
      combinadoEm: p.divergenciaResolvidaEm,
      nota: p.divergenciaNota,
      valor: Math.round(valor * 100) / 100,
    };
  });
}

/** Tudo o que a tela de Pendências mostra. */
export async function pendenciasDeCompras() {
  const ativos = { isActive: true };
  const [
    produtosNovos,
    ofertas,
    correcoes,
    divergencias,
    semIdeal,
    semCodigo,
    comLoteEIdeal,
    exclusivoInativo,
    fornecedores,
    categorias,
    categoriasServidas,
    alcance,
  ] = await Promise.all([
    prisma.contagemProdutoNovo.findMany({
      where: { status: "PENDENTE" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nome: true,
        unit: true,
        categoryId: true,
        quantidade: true,
        createdAt: true,
        contagem: { select: { responsavel: { select: { name: true, username: true } } } },
      },
    }),
    prisma.cotacaoProdutoNovo.findMany({
      where: { status: "PENDENTE" },
      orderBy: { id: "asc" },
      select: {
        id: true,
        nome: true,
        unit: true,
        marca: true,
        precoEmbalagem: true,
        embalagem: true,
        cotacaoFornecedor: {
          select: {
            cotacaoId: true,
            cotacao: { select: { dataInicio: true } },
            fornecedor: { select: { name: true, apelido: true } },
          },
        },
      },
    }),
    prisma.contagemProdutoCorrecao.findMany({
      where: { status: "PENDENTE" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nome: true,
        unit: true,
        categoryId: true,
        observacoes: true,
        desativar: true,
        createdAt: true,
        produto: {
          select: {
            id: true,
            name: true,
            unit: true,
            categoryId: true,
            currentStock: true,
            idealStock: true,
            lotSize: true,
          },
        },
        contagem: { select: { responsavel: { select: { name: true, username: true } } } },
        cotacao: { select: { dataInicio: true } },
        idealStock: true,
        lotSize: true,
        sugeridoPor: { select: { name: true, username: true } },
      },
    }),
    pedidosComDivergencia(),
    prisma.product.findMany({
      // Produto de compra de rotina não precisa do ideal do cadastro: ela
      // tem o ideal de cada dia, obrigatório, e só ela pede o produto.
      where: {
        ...ativos,
        idealStock: null,
        NOT: { listasCompra: { some: { lista: { ativa: true } } } },
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, unit: true, category: { select: { name: true } } },
    }),
    prisma.product.findMany({
      where: { ...ativos, code: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { ...ativos, lotSize: { not: null }, idealStock: { not: null } },
      select: { id: true, name: true, unit: true, lotSize: true, idealStock: true },
    }),
    prisma.product.findMany({
      where: { ...ativos, exclusiveSupplier: { isActive: false } },
      select: { id: true, name: true, exclusiveSupplier: { select: { name: true } } },
    }),
    // Sem o atacado: a casa vai buscar, então categoria, prazo e telefone
    // não fazem falta a ele — cobrar isso seria pendência que nunca fecha.
    prisma.supplier.findMany({
      where: { ...ativos, compraNoAtacado: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        apelido: true,
        phone: true,
        deliveryDays: true,
        categories: { select: { categoryId: true } },
      },
    }),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.supplierCategory.findMany({ where: { supplier: ativos }, select: { categoryId: true } }),
    // Quem ninguém alcança: sem exclusivo, sem vínculo com fornecedor ativo,
    // e categoria que nenhum fornecedor ativo atende (a regra das cotações,
    // lib/cotacao-fornecedores.ts).
    prisma.product.findMany({
      where: { ...ativos, exclusiveSupplierId: null, suppliers: { none: { supplier: ativos } } },
      select: { id: true, name: true, categoryId: true },
    }),
  ]);

  const nomeDoFornecedor = (f: { name: string; apelido: string | null }) => f.apelido ?? f.name;
  const servidas = new Set(categoriasServidas.map((c) => c.categoryId));

  return {
    categorias,
    produtosNovos,
    ofertas: ofertas.map((o) => ({
      id: o.id,
      nome: o.nome,
      unit: o.unit,
      marca: o.marca,
      embalagem: o.embalagem,
      precoEmbalagem: o.precoEmbalagem?.toNumber() ?? null,
      cotacaoId: o.cotacaoFornecedor.cotacaoId,
      /** "02/10": o dia da cotação em que a oferta veio. */
      cotacaoData: dataDaCotacao(o.cotacaoFornecedor.cotacao.dataInicio),
      fornecedor: nomeDoFornecedor(o.cotacaoFornecedor.fornecedor),
    })),
    correcoes: correcoes.map((c) => ({
      id: c.id,
      nome: c.nome,
      unit: c.unit,
      categoryId: c.categoryId,
      observacoes: c.observacoes,
      desativar: c.desativar,
      // Quem sugeriu: a conta de quem estava na cotação, ou o responsável da
      // contagem (o estoquista entra pelo link, sem conta própria).
      responsavel:
        c.sugeridoPor?.name ??
        c.sugeridoPor?.username ??
        c.contagem?.responsavel?.name ??
        c.contagem?.responsavel?.username ??
        null,
      /** De onde veio: "na cotação de 02/10", ou "na contagem". */
      origem: c.cotacao ? `na cotação de ${dataDaCotacao(c.cotacao.dataInicio)}` : "na contagem",
      idealStock: c.idealStock?.toNumber() ?? null,
      lotSize: c.lotSize?.toNumber() ?? null,
      produto: {
        ...c.produto,
        currentStock: c.produto.currentStock.toNumber(),
        idealStock: c.produto.idealStock?.toNumber() ?? null,
        lotSize: c.produto.lotSize?.toNumber() ?? null,
      },
    })),
    divergencias,
    semIdeal: semIdeal.map((p) => ({ id: p.id, nome: p.name, unit: p.unit, categoria: p.category?.name ?? null })),
    semCodigo: semCodigo.map((p) => ({ id: p.id, nome: p.name })),
    // Lote maior que o dobro do ideal: faltando o ideal inteiro, ainda é
    // menos de meio lote, e a sugestão arredonda para zero — nunca pede.
    loteImpede: comLoteEIdeal
      .filter((p) => p.lotSize!.toNumber() > 2 * p.idealStock!.toNumber())
      .map((p) => ({ id: p.id, nome: p.name, unit: p.unit, lote: p.lotSize!.toNumber(), ideal: p.idealStock!.toNumber() })),
    semQuemCote: alcance
      .filter((p) => p.categoryId === null || !servidas.has(p.categoryId))
      .map((p) => ({ id: p.id, nome: p.name })),
    exclusivoInativo: exclusivoInativo.map((p) => ({ id: p.id, nome: p.name, fornecedor: p.exclusiveSupplier!.name })),
    fornSemCategoria: fornecedores.filter((f) => f.categories.length === 0).map((f) => ({ id: f.id, nome: nomeDoFornecedor(f) })),
    fornSemPrazo: fornecedores.filter((f) => f.deliveryDays === null).map((f) => ({ id: f.id, nome: nomeDoFornecedor(f) })),
    fornSemTelefone: fornecedores.filter((f) => f.phone === null).map((f) => ({ id: f.id, nome: nomeDoFornecedor(f) })),
  };
}

export type PendenciasDeCompras = Awaited<ReturnType<typeof pendenciasDeCompras>>;

export type IdealSugerido = {
  id: number;
  produto: string;
  unidade: ProductUnit;
  requisicao: string;
  /** O ideal que vale hoje na Requisição (o dela ou o do cadastro). */
  idealAtual: number | null;
  idealSugerido: number;
  motivo: string | null;
};

/**
 * Os pedidos da compra de rotina que o estoquista contou e ainda não foram
 * ao fornecedor: esperam quem compra revisar e mandar. O aviso no celular
 * pode se perder; a Pendências não.
 */
export async function pedidosDaRotinaParaEnviar() {
  const pedidos = await prisma.pedidoCompra.findMany({
    where: {
      estatus: { in: ["CRIADO", "AGUARDANDO_FORNECEDOR"] },
      OR: [{ listaCompraId: { not: null } }, { contagem: { listaCompraId: { not: null } } }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      fornecedor: { select: { name: true, apelido: true, compraNoAtacado: true } },
      listaCompra: { select: { nome: true } },
      contagem: { select: { listaCompra: { select: { nome: true } } } },
      _count: { select: { itens: true } },
    },
  });
  return pedidos.map((p) => ({
    id: p.id,
    criadoEm: p.createdAt,
    fornecedor: p.fornecedor.apelido ?? p.fornecedor.name,
    atacado: p.fornecedor.compraNoAtacado,
    lista: p.listaCompra?.nome ?? p.contagem?.listaCompra?.nome ?? null,
    itens: p._count.itens,
  }));
}

/** Os ideais de Requisição que o estoquista sugeriu, esperando decisão. */
export async function idealSugeridoPendente(): Promise<IdealSugerido[]> {
  const linhas = await prisma.sugestaoIdealRequisicao.findMany({
    where: { status: "PENDENTE" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      listaId: true,
      produtoId: true,
      idealSugerido: true,
      motivo: true,
      lista: { select: { nome: true, itens: { select: { produtoId: true, idealStock: true } } } },
      produto: { select: { name: true, unit: true, idealStock: true } },
    },
  });
  return linhas.map((s) => {
    const doDia = s.lista.itens.find((i) => i.produtoId === s.produtoId)?.idealStock ?? null;
    return {
      id: s.id,
      produto: s.produto.name,
      unidade: s.produto.unit,
      requisicao: s.lista.nome,
      idealAtual: (doDia ?? s.produto.idealStock)?.toNumber() ?? null,
      idealSugerido: s.idealSugerido.toNumber(),
      motivo: s.motivo,
    };
  });
}

/** Onde a bonificação que não veio espera: em pedido que não foi cancelado. */
const BONIFICACAO_QUE_NAO_VEIO = {
  estado: "NAO_VEIO",
  pedidoCompra: { is: { estatus: { not: "CANCELADO" } } },
} satisfies Prisma.BonificacaoWhereInput;

export type BonificacaoQueNaoVeio = {
  id: number;
  pedidoId: number;
  fornecedor: string;
  texto: string;
  nota: string | null;
  /** Desconto na nota: não "chega", é abatido. */
  dinheiro: boolean;
  /** Para "virou crédito": o valor combinado (dinheiro) ou quantidade × último custo. */
  valorSugerido: number | null;
};

/** As bonificações combinadas que não vieram no recebimento, esperando decisão. */
export async function bonificacoesQueNaoVieram(): Promise<BonificacaoQueNaoVeio[]> {
  const linhas = await prisma.bonificacao.findMany({
    where: BONIFICACAO_QUE_NAO_VEIO,
    orderBy: { id: "asc" },
    select: {
      id: true,
      tipo: true,
      pedidoCompraId: true,
      produtoId: true,
      quantidade: true,
      valor: true,
      nota: true,
      produto: { select: { name: true, unit: true } },
      fornecedor: { select: { name: true, apelido: true } },
    },
  });
  const custos = await ultimoCustoPorProduto(linhas.flatMap((b) => (b.produtoId === null ? [] : [b.produtoId])));
  return linhas.map((b) => {
    const mostrar = {
      tipo: b.tipo,
      produto: b.produto ? { nome: b.produto.name, unidade: b.produto.unit } : null,
      quantidade: b.quantidade?.toNumber() ?? null,
      valor: b.valor?.toNumber() ?? null,
      quantidadeRecebida: null,
    };
    const custo = b.produtoId === null ? null : (custos.get(b.produtoId)?.valor ?? null);
    const sugerido = eMercadoria(b.tipo) && custo === null ? null : valorDaBonificacao(mostrar, custo);
    return {
      id: b.id,
      pedidoId: b.pedidoCompraId!,
      fornecedor: b.fornecedor.apelido ?? b.fornecedor.name,
      texto: bonificacaoPorExtenso(mostrar),
      nota: b.nota,
      dinheiro: !eMercadoria(b.tipo),
      valorSugerido: sugerido,
    };
  });
}

/**
 * Quantas coisas pedem decisão — o número ao lado de "Pendências" no menu.
 *
 * Só o que é decisão (aprovar, recusar, resolver). Cadastro incompleto não
 * entra: são dezenas de itens que se completam aos poucos, e um número que
 * nunca baixa de 150 deixa de ser lido.
 *
 * `cache()`: uma leitura por requisição, por mais que o layout chame.
 */
export const contarDecisoes = cache(async (): Promise<number> => {
  const [novos, ofertas, correcoes, divergencias, faltas, bonificacoes, ideais] = await Promise.all([
    prisma.contagemProdutoNovo.count({ where: { status: "PENDENTE" } }),
    prisma.cotacaoProdutoNovo.count({ where: { status: "PENDENTE" } }),
    prisma.contagemProdutoCorrecao.count({ where: { status: "PENDENTE" } }),
    idsComDivergencia().then((l) => l.length),
    // Os avisos que pedem ação (hoje, item em falta) e ninguém resolveu.
    // "Tudo certo" e as respostas não contam: são para ler, não para fazer.
    prisma.avisoCompra.count({ where: { pedeAcao: true, resolvidoEm: null } }),
    prisma.bonificacao.count({ where: BONIFICACAO_QUE_NAO_VEIO }),
    prisma.sugestaoIdealRequisicao.count({ where: { status: "PENDENTE" } }),
  ]);
  return novos + ofertas + correcoes + divergencias + faltas + bonificacoes + ideais;
});

// ---------------------------------------------------------------------------
// Avisos dos fornecedores
// ---------------------------------------------------------------------------

export type Aviso = {
  id: number;
  tipo: TipoAviso;
  fornecedorId: number | null;
  fornecedor: string | null;
  pedidoId: number | null;
  cotacaoId: number | null;
  titulo: string;
  detalhe: string | null;
  itens: ItemDoAviso[];
  pedeAcao: boolean;
  resolvido: boolean;
  lido: boolean;
  /** ISO — a tela agrupa por dia e mostra a hora no fuso da casa. */
  em: string;
};

/** Quantos dias de avisos a linha do tempo mostra. */
export const DIAS_DE_AVISOS = 30;

function paraAviso(a: {
  id: number;
  tipo: TipoAviso;
  fornecedorId: number | null;
  fornecedor: { name: string; apelido: string | null } | null;
  pedidoId: number | null;
  cotacaoId: number | null;
  titulo: string;
  detalhe: string | null;
  itens: unknown;
  pedeAcao: boolean;
  resolvidoEm: Date | null;
  lidoEm: Date | null;
  createdAt: Date;
}): Aviso {
  return {
    id: a.id,
    tipo: a.tipo,
    fornecedorId: a.fornecedorId,
    fornecedor: a.fornecedor ? (a.fornecedor.apelido ?? a.fornecedor.name) : null,
    pedidoId: a.pedidoId,
    cotacaoId: a.cotacaoId,
    titulo: a.titulo,
    detalhe: a.detalhe,
    itens: Array.isArray(a.itens) ? (a.itens as ItemDoAviso[]) : [],
    pedeAcao: a.pedeAcao,
    resolvido: a.resolvidoEm !== null,
    lido: a.lidoEm !== null,
    em: a.createdAt.toISOString(),
  };
}

const CAMPOS_DO_AVISO = {
  id: true,
  tipo: true,
  fornecedorId: true,
  fornecedor: { select: { name: true, apelido: true } },
  pedidoId: true,
  cotacaoId: true,
  titulo: true,
  detalhe: true,
  itens: true,
  pedeAcao: true,
  resolvidoEm: true,
  lidoEm: true,
  createdAt: true,
} as const;

/** A linha do tempo: os avisos dos últimos dias, do mais novo ao mais velho. */
export async function avisosRecentes(): Promise<Aviso[]> {
  const desde = new Date(Date.now() - DIAS_DE_AVISOS * 86_400_000);
  const linhas = await prisma.avisoCompra.findMany({
    where: { createdAt: { gte: desde } },
    orderBy: { createdAt: "desc" },
    // Teto de 200: a tela mostra 40 de cada vez, e mais de 200 avisos em
    // trinta dias já é para o filtro, não para rolar.
    take: 200,
    select: CAMPOS_DO_AVISO,
  });
  return linhas.map(paraAviso);
}

/** Os que pedem ação e ninguém resolveu, de qualquer data — é a faixa "Agora". */
export async function avisosParaAgir(): Promise<Aviso[]> {
  const linhas = await prisma.avisoCompra.findMany({
    where: { pedeAcao: true, resolvidoEm: null },
    orderBy: { createdAt: "desc" },
    select: CAMPOS_DO_AVISO,
  });
  return linhas.map(paraAviso);
}

/** Quantos avisos ninguém leu ainda — o número da aba. */
export function avisosNaoLidos(): Promise<number> {
  return prisma.avisoCompra.count({ where: { lidoEm: null } });
}

/** Os não lidos de cada bloco (divergência, recebido, outros): o cartão da página inicial. */
export async function avisosNaoLidosPorBloco(): Promise<Record<BlocoDeAviso, number>> {
  const porTipo = await prisma.avisoCompra.groupBy({ by: ["tipo"], where: { lidoEm: null }, _count: { _all: true } });
  const conta: Record<BlocoDeAviso, number> = { divergencia: 0, recebido: 0, outros: 0 };
  for (const t of porTipo) conta[blocoDoAviso(t.tipo)] += t._count._all;
  return conta;
}
