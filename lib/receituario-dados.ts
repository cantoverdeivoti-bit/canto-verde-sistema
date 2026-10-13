import { cache } from "react";

import { prisma } from "@/lib/db";
import { ultimoCustoPorProduto } from "@/lib/historico";
import { chavesDasCores, coresDasCategorias, custoDoInsumo, custosDasFichas, ETIQUETAS_PADRAO, unidade, type CustoDoInsumo, type Unidade } from "@/lib/receituario-regras";

/**
 * O Receituário inteiro com os custos de hoje: cada insumo com o preço
 * (da última compra do produto ligado ou o digitado) e cada ficha com o
 * custo total, por porção e por kg, já contando os pré-preparos.
 *
 * Carrega tudo de uma vez (são centenas de fichas, não milhares): o custo de
 * uma ficha depende das fichas que ela chama, então calcular uma só exigiria
 * buscar as outras do mesmo jeito.
 */
export const receituarioComCustos = cache(async () => {
  const [insumos, fichas, config] = await Promise.all([
    prisma.insumoReceita.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        codigo: true,
        nome: true,
        categoria: true,
        unidadeUso: true,
        produtoId: true,
        unidadeCompra: true,
        precoCompra: true,
        qtdPorUnidade: true,
        rendimento: true,
        estimado: true,
        embalagem: true,
        observacao: true,
        ativo: true,
        produto: { select: { id: true, name: true, code: true, unit: true } },
        _count: { select: { ingredientes: true } },
      },
    }),
    prisma.fichaTecnica.findMany({
      orderBy: { codigo: "asc" },
      select: {
        id: true,
        codigo: true,
        nome: true,
        categoria: true,
        tipo: true,
        operacoes: true,
        etiquetas: true,
        porcoes: true,
        rendimentoTotal: true,
        unidadeRendimento: true,
        custoManualPorcao: true,
        conferida: true,
        ativo: true,
        ingredientes: { orderBy: { ordem: "asc" }, select: { quantidade: true, unidade: true, insumoId: true, subFichaId: true } },
      },
    }),
    configDoReceituario(),
  ]);

  const ultimos = await ultimoCustoPorProduto([...new Set(insumos.flatMap((i) => (i.produtoId ? [i.produtoId] : [])))]);
  const custos = new Map<number, CustoDoInsumo & { unidadeUso: Unidade }>();
  for (const i of insumos) {
    const uso = unidade(i.unidadeUso) ?? "g";
    custos.set(i.id, {
      ...custoDoInsumo({
        unidadeUso: uso,
        precoCompra: i.precoCompra === null ? null : Number(i.precoCompra),
        qtdPorUnidade: Number(i.qtdPorUnidade),
        rendimento: Number(i.rendimento),
        produto: i.produto ? { unidade: i.produto.unit, ultimoCusto: ultimos.get(i.produto.id) ?? null } : null,
      }),
      unidadeUso: uso,
    });
  }

  const custoDasFichas = custosDasFichas(
    fichas.map((f) => ({
      id: f.id,
      porcoes: f.porcoes,
      rendimentoTotal: f.rendimentoTotal === null ? null : Number(f.rendimentoTotal),
      custoManualPorcao: f.custoManualPorcao === null ? null : Number(f.custoManualPorcao),
      ingredientes: f.ingredientes.map((l) => ({ quantidade: Number(l.quantidade), unidade: unidade(l.unidade), insumoId: l.insumoId, subFichaId: l.subFichaId })),
    })),
    custos,
  );

  return { insumos, custosDosInsumos: custos, fichas, custoDasFichas, config };
});

/** A meta de food cost, o markup, as etiquetas e as cores das categorias (com o padrão de 30%, 3 e Assado, Cozido, Grelhado, Outros quando ninguém mexeu). */
export async function configDoReceituario() {
  const c = await prisma.configReceituario.findUnique({ where: { id: 1 } });
  return {
    metaFoodCost: c ? Number(c.metaFoodCost) : 0.3,
    markup: c ? Number(c.markup) : 3,
    etiquetas: c?.etiquetas ?? ETIQUETAS_PADRAO,
    /** A chave da paleta de cada categoria, para a tela de Configurações. */
    chavesDasCores: chavesDasCores(c?.coresDasCategorias),
    /** O hex de cada categoria, para `corDaCategoria`. */
    cores: coresDasCategorias(c?.coresDasCategorias),
  };
}
