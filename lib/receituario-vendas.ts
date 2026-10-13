import { prisma } from "@/lib/db";
import { receituarioComCustos } from "@/lib/receituario-dados";
import { cmvDaVenda, custosDasVendas, precosSugeridos, type CustoDaVenda } from "@/lib/receituario-regras";

/**
 * A lista de preços (encomenda e delivery) com o custo de hoje: cada item
 * sai da ficha, que sai da última compra dos insumos. Nada de custo
 * guardado: a compra recebida muda o custo do pote de maionese na hora.
 */
export async function vendasComCustos(where: { fichaId?: number } = {}) {
  const [{ custoDasFichas, custosDosInsumos, config }, vendas] = await Promise.all([
    receituarioComCustos(),
    prisma.vendaDaFicha.findMany({
      orderBy: [{ canal: "asc" }, { nome: "asc" }],
      select: {
        id: true,
        fichaId: true,
        canal: true,
        nome: true,
        unidadeVenda: true,
        quantidade: true,
        precoVenda: true,
        ativo: true,
        baseId: true,
        base: { select: { nome: true } },
        ficha: { select: { id: true, codigo: true, nome: true, unidadeRendimento: true, ativo: true } },
        extras: {
          orderBy: { ordem: "asc" },
          select: {
            insumoId: true,
            subFichaId: true,
            quantidade: true,
            insumo: { select: { nome: true, unidadeUso: true, embalagem: true } },
            subFicha: { select: { nome: true, unidadeRendimento: true } },
          },
        },
      },
    }),
  ]);

  // O custo de uma venda pode depender de outra (o delivery que parte da
  // encomenda), então a conta é sempre de todas; o filtro vem depois.
  const custos = custosDasVendas(
    vendas.map((v) => ({
      id: v.id,
      fichaId: v.fichaId,
      quantidade: Number(v.quantidade),
      baseId: v.baseId,
      extras: v.extras.map((e) => ({ insumoId: e.insumoId, subFichaId: e.subFichaId, quantidade: Number(e.quantidade) })),
    })),
    custoDasFichas,
    custosDosInsumos,
  );

  const itens = vendas
    .filter((v) => where.fichaId === undefined || v.fichaId === where.fichaId)
    .map((v) => {
      const custo: CustoDaVenda = custos.get(v.id) ?? { receita: null, extras: 0, total: null, semPreco: 0 };
      const preco = v.precoVenda === null ? null : Number(v.precoVenda);
      return {
        id: v.id,
        fichaId: v.fichaId,
        canal: v.canal,
        nome: v.nome,
        unidadeVenda: v.unidadeVenda,
        quantidade: Number(v.quantidade),
        precoVenda: preco,
        ativo: v.ativo,
        baseId: v.baseId,
        baseNome: v.base?.nome ?? null,
        ficha: v.ficha,
        extras: v.extras.map((e) => ({
          insumoId: e.insumoId,
          subFichaId: e.subFichaId,
          quantidade: Number(e.quantidade),
          nome: e.insumo?.nome ?? e.subFicha?.nome ?? "",
          unidade: e.insumo?.unidadeUso ?? e.subFicha?.unidadeRendimento ?? "un",
          embalagem: e.insumo?.embalagem ?? false,
        })),
        custo,
        cmv: cmvDaVenda(custo.total, preco),
        sugerido: precosSugeridos(custo.total, config.metaFoodCost, config.markup),
      };
    });
  return { itens, metaFoodCost: config.metaFoodCost, markup: config.markup };
}

export type ItemDeVenda = Awaited<ReturnType<typeof vendasComCustos>>["itens"][number];

/**
 * O que o formulário da venda oferece: as fichas ativas e os insumos
 * (embalagens primeiro), cada um com o custo por unidade de hoje, para a
 * gaveta mostrar o custo e o CMV enquanto se digita.
 */
export async function opcoesDaVenda() {
  const { fichas, insumos, custoDasFichas, custosDosInsumos } = await receituarioComCustos();
  return {
    fichas: fichas
      .filter((f) => f.ativo)
      .map((f) => ({
        id: f.id,
        codigo: f.codigo,
        nome: f.nome,
        unidade: f.unidadeRendimento,
        preparo: f.tipo === "PRE_PREPARO",
        porUnidade: custoDasFichas.get(f.id)?.porUnidade ?? null,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    insumos: insumos
      .filter((i) => i.ativo)
      .map((i) => ({ id: i.id, nome: i.nome, unidade: i.unidadeUso, embalagem: i.embalagem, porUnidade: custosDosInsumos.get(i.id)?.liquido ?? null }))
      .sort((a, b) => Number(b.embalagem) - Number(a.embalagem) || a.nome.localeCompare(b.nome)),
  };
}

export type OpcoesDaVenda = Awaited<ReturnType<typeof opcoesDaVenda>>;
