import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * O que a casa pagou da última vez, por produto.
 *
 * Sai de `HistoricoPrecosCompra`, que é escrito quando a entrega é conferida
 * (`receberPedido`, em lib/actions/cotacao.ts) — ou seja, é preço de
 * mercadoria que chegou, não de cotação que alguém respondeu. Preço prometido
 * e preço pago são coisas diferentes, e o que serve para decidir a próxima
 * compra é o segundo.
 *
 * Mora sozinho porque a mesma consulta e o mesmo tipo estavam escritos em dois
 * lugares, com comentários quase gêmeos, e a tela de cotação seria o terceiro.
 * Não vive em `lib/sugestao.ts` porque dois dos três chamadores não têm nada a
 * ver com sugestão de compra, e ler `import { ultimoCustoPorProduto } from
 * "@/lib/sugestao"` na tela de Produtos diria uma coisa que não é.
 */

/** Nulo em quem chama é "nunca comprou", e na tela vira traço, nunca zero. */
export type UltimoCusto = { valor: number; em: string };

/**
 * Uma consulta para a lista inteira, e não uma por linha.
 *
 * `distinct` com a ordem começando em `produtoId`: o banco guarda a PRIMEIRA
 * linha de cada produto, e a ordem por `dataCompra` decrescente faz dessa
 * primeira a mais recente.
 *
 * Sem `produtoIds` é o catálogo inteiro, que é o caso da tela de Produtos.
 * Com a lista vazia devolve um mapa vazio sem ir ao banco — `in: []` é uma ida
 * garantidamente sem resultado.
 */
export async function ultimoCustoPorProduto(
  produtoIds?: number[],
): Promise<Map<number, UltimoCusto>> {
  if (produtoIds?.length === 0) return new Map();

  // Uma busca curta por produto (`LATERAL ... LIMIT 1`), e não um
  // `DISTINCT ON` sobre o histórico: aquele ordenava o histórico INTEIRO
  // para guardar a primeira linha de cada produto, e o histórico ganha uma
  // linha por item recebido, para sempre. Aqui o banco desce o índice
  // (produtoId, dataCompra desc) e para na primeira linha de cada um: lê uma
  // linha por produto, quantas entregas houver.
  const linhas = await prisma.$queryRaw<{ produtoId: number; precoUnitario: Prisma.Decimal; dataCompra: Date }[]>`
    SELECT p.id AS "produtoId", h."precoUnitario", h."dataCompra"
    FROM "products" p
    CROSS JOIN LATERAL (
      SELECT "precoUnitario", "dataCompra"
      FROM "historico_precos_compra"
      WHERE "produtoId" = p.id
      ORDER BY "dataCompra" DESC
      LIMIT 1
    ) h
    ${produtoIds ? Prisma.sql`WHERE p.id IN (${Prisma.join(produtoIds)})` : Prisma.empty}`;

  return new Map(
    linhas.map((h) => [
      h.produtoId,
      { valor: Number(h.precoUnitario), em: h.dataCompra.toISOString() },
    ]),
  );
}

/** Uma compra conferida: quanto, de quem, quando. */
export type CompraDoHistorico = {
  valor: number;
  em: string;
  /** Nulo quando o fornecedor foi apagado do cadastro depois da compra. */
  fornecedor: string | null;
  /**
   * A marca que o fornecedor informou naquele pedido (`PedidoCompraItem.marca`).
   * É a combinada: o recebimento não confirma a marca que chegou. Nula quando
   * o produto não pede marca, ou quando ele não disse.
   */
  marca: string | null;
};

/**
 * As últimas N compras de cada produto.
 *
 * Irmã de `ultimoCustoPorProduto`, e não a mesma função com um parâmetro: uma
 * responde "qual é a âncora de preço deste item" e cabe numa linha da tela; a
 * outra responde "como este preço vem se comportando, e com quem" e é um
 * painel. Juntá-las obrigaria a tela de Produtos, que só quer a âncora, a
 * carregar três vezes mais linha por produto.
 *
 * SQL cru com `ROW_NUMBER()` porque "as três mais recentes DE CADA produto"
 * não existe em Prisma: `distinct` só sabe trazer a primeira, e `take` corta
 * o conjunto inteiro, não cada grupo. A alternativa seria buscar o histórico
 * todo e fatiar na memória — e ele cresce uma linha por entrega conferida,
 * para sempre, então a conta que hoje é barata fica cara sozinha.
 *
 * `id DESC` desempata: duas entregas conferidas no mesmo dia têm a mesma
 * `dataCompra`, e sem o desempate a ordem seria a que o banco quisesse.
 */
export async function ultimasComprasPorProduto(
  produtoIds: number[],
  quantas = 3,
): Promise<Map<number, CompraDoHistorico[]>> {
  if (produtoIds.length === 0) return new Map();

  const linhas = await prisma.$queryRaw<
    {
      produtoId: number;
      precoUnitario: Prisma.Decimal;
      dataCompra: Date;
      fornecedor: string | null;
      marca: string | null;
    }[]
  >`
    SELECT h."produtoId", h."precoUnitario", h."dataCompra",
           COALESCE(s."apelido", s."name") AS fornecedor, i."marca"
    FROM (
      SELECT *,
             ROW_NUMBER() OVER (
               PARTITION BY "produtoId"
               ORDER BY "dataCompra" DESC, "id" DESC
             ) AS n
      FROM "historico_precos_compra"
      WHERE "produtoId" IN (${Prisma.join(produtoIds)})
    ) h
    LEFT JOIN "suppliers" s ON s."id" = h."fornecedorId"
    LEFT JOIN "pedido_compra_itens" i ON i."id" = h."pedidoCompraItemId"
    WHERE h.n <= ${quantas}
    ORDER BY h."produtoId", h."dataCompra" DESC, h."id" DESC
  `;

  const porProduto = new Map<number, CompraDoHistorico[]>();
  for (const h of linhas) {
    const lista = porProduto.get(h.produtoId) ?? [];
    lista.push({
      // `$queryRaw` devolve o que o driver entrega, e não o que o Prisma
      // converteria: `Decimal` vem como Decimal, mas um número solto viria
      // como número. `Number` cobre os dois sem mentir sobre nenhum.
      valor: Number(h.precoUnitario),
      em: h.dataCompra.toISOString(),
      fornecedor: h.fornecedor,
      marca: h.marca,
    });
    porProduto.set(h.produtoId, lista);
  }
  return porProduto;
}
