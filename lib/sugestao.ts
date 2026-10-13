import { Prisma, type ProductUnit } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { arredondarAoLote } from "@/lib/lote";
import { ultimoCustoPorProduto, type UltimoCusto } from "@/lib/historico";
import { FORA_DAS_REQUISICOES } from "@/lib/requisicao";

/**
 * O que a casa precisa comprar, calculado num lugar só.
 *
 * A conta morava dentro de `montarCotacao`. A tela de conferência precisa da
 * MESMA conta — ela existe para mostrar, antes de mandar, exatamente o que
 * seria criado. Duas cópias divergiriam na primeira vez que alguém mexesse
 * numa, e o jeito de a divergência aparecer seria o pior possível: a tela
 * mostrando uma lista e o fornecedor recebendo outra.
 *
 * A conta é `estoque ideal − o que foi contado`, e depois o lote de compra.
 *
 * Sem lote — que é o caso da maioria — a conta é só a subtração, sem mínimo e
 * sem arredondar: é por isso que o orégano que ficou cem gramas abaixo do
 * ideal ainda pede cem gramas, e é por isso que a tela de conferência existe.
 *
 * Com lote, a falta é arredondada ao múltiplo mais perto, e não para cima: a
 * água que vem em fardo de 12 nunca pede 13. Falta menor que meio lote não
 * vira linha nenhuma — comprar um fardo inteiro para repor cinco garrafas é
 * encher a prateleira do que a casa não quer ter.
 */

/** Um item contado. Nulo já foi descartado por quem chama. */
type Contado = { produtoId: number; quantidadeContada: Prisma.Decimal };

/** O mínimo do produto que a conta precisa. */
type ParaConta = {
  id: number;
  idealStock: Prisma.Decimal | null;
  /** De quanto em quanto se compra. Nulo = qualquer número serve. */
  lotSize: Prisma.Decimal | null;
  categoryId: number | null;
  exclusiveSupplierId: number | null;
};

export type Sugestao = {
  produtoId: number;
  quantidadeSolicitada: Prisma.Decimal;
  categoryId: number | null;
  quantidadeContada: Prisma.Decimal;
  exclusiveSupplierId: number | null;
};

/**
 * A conta, pura.
 *
 * Cinco descartes, e cada um diz uma coisa diferente:
 * o produto some da lista se foi desativado (quem chama filtra), se não tem
 * estoque ideal cadastrado — não dá para saber quanto falta do que não tem
 * alvo — ou se já está no ideal ou acima. Item que o estoquista nunca olhou
 * também não entra: nulo não é zero, e "não passei por essa prateleira" não é
 * informação sobre ela.
 *
 * O quinto é o único que descarta item que ESTÁ abaixo do ideal: faltava menos
 * de meio lote. Por ser o único assim, ele é contado e devolvido — a tela
 * precisa dizer por que o item sumiu, senão ele some logo depois de o
 * estoquista ter passado por ele.
 */
export function calcularSugestoes(
  contados: Contado[],
  produtos: ParaConta[],
): { sugestoes: Sugestao[]; menosDeMeioLote: number } {
  const porProduto = new Map(contados.map((i) => [i.produtoId, i.quantidadeContada]));
  let menosDeMeioLote = 0;

  const sugestoes = produtos.flatMap((p) => {
    if (p.idealStock === null) return [];
    const contado = porProduto.get(p.id);
    if (contado === undefined) return [];
    const faltando = new Prisma.Decimal(p.idealStock).minus(contado);
    if (faltando.lessThanOrEqualTo(0)) return [];

    /* A fronteira entre Decimal e number, e a única do projeto.
       `lib/lote.ts` é puro de propósito — a tela de conferência precisa dele —
       então quem tem Decimal converte aqui. Volta por `toFixed(3)` e não pelo
       double cru: é a precisão que a coluna guarda, e deixa explícito qual
       arredondamento está acontecendo. */
    const pedir = arredondarAoLote(
      faltando.toNumber(),
      p.lotSize === null ? null : p.lotSize.toNumber(),
    );
    if (pedir <= 0) {
      menosDeMeioLote += 1;
      return [];
    }

    return [
      {
        produtoId: p.id,
        quantidadeSolicitada: new Prisma.Decimal(pedir.toFixed(3)),
        categoryId: p.categoryId,
        quantidadeContada: contado,
        exclusiveSupplierId: p.exclusiveSupplierId,
      },
    ];
  });

  return { sugestoes, menosDeMeioLote };
}

/** Uma linha da tela de conferência. */
export type LinhaParaRevisar = {
  produtoId: number;
  /** De qual contagem este número veio. A correção do contado precisa dela. */
  contagemId: number;
  nome: string;
  unidade: ProductUnit;
  categoria: string | null;
  sortOrder: number;
  contado: number;
  sugestao: number;
  /** De quanto em quanto se compra. Nulo = qualquer número serve. */
  lote: number | null;
  /** Nome do fornecedor exclusivo. Preenchido, a linha vira pedido direto. */
  exclusivoDe: string | null;
  /** O id dele. O nome é para ler; o id é para a tela montar filtro e link
      sem casar por nome — dois fornecedores homônimos são questão de tempo. */
  exclusivoId: number | null;
  /** O exclusivo é um atacado: a casa vai buscar, e a linha vira "Compra no
      atacado" — lista com valor estimado, sem link de preço. */
  exclusivoAtacado: boolean;
  /** O que a casa pagou na última entrega conferida. Nulo = nunca comprou. */
  ultimoCusto: UltimoCusto | null;
};

/**
 * A mesma lista, mas lida de uma cotação que já existe.
 *
 * Irmã de `linhasParaRevisar`, e o contrário dela: aquela CALCULA o que
 * comprar a partir do que foi contado; esta LÊ o que já foi decidido. É o que
 * permite abrir a conferência de novo para corrigir uma compra montada, sem
 * que a tela recalcule nada.
 *
 * Recalcular seria o erro. A sugestão é `ideal − contado` no momento em que
 * roda, e voltar semana que vem daria os números de semana que vem — com o
 * estoque ideal que alguém possa ter mudado no meio. `CotacaoItem` guarda os
 * dois números daquele dia, o contado e o solicitado, e são eles que a tela
 * mostra.
 *
 * Nada de `semIdeal` nem de `menosDeMeioLote`: quem ficou de fora ficou na
 * hora de montar, e repetir a contagem daquele dia seria contar de novo uma
 * decisão que já foi tomada. `repetidos` pelo mesmo motivo — a cotação já é o
 * resultado do desempate.
 */
export async function linhasDaCotacao(cotacaoId: number): Promise<LinhaParaRevisar[]> {
  const itens = await prisma.cotacaoItem.findMany({
    where: { cotacaoId },
    select: {
      produtoId: true,
      quantidadeContada: true,
      quantidadeSolicitada: true,
      produto: {
        select: {
          name: true,
          unit: true,
          lotSize: true,
          category: { select: { name: true, sortOrder: true } },
          exclusiveSupplierId: true,
          exclusiveSupplier: { select: { name: true, compraNoAtacado: true } },
        },
      },
    },
  });

  const custoPorProduto = await ultimoCustoPorProduto(itens.map((i) => i.produtoId));

  const linhas = itens.map((i) => ({
    produtoId: i.produtoId,
    /* A cotação não sabe de qual contagem cada item veio — e não precisa
       saber. O campo existe para o painel de correção mandar o contado de
       volta para a contagem certa, e aqui não há contagem para corrigir: o
       número já foi copiado para dentro da cotação. Zero é o "nenhuma". */
    contagemId: 0,
    nome: i.produto.name,
    unidade: i.produto.unit,
    categoria: i.produto.category?.name ?? null,
    sortOrder: i.produto.category?.sortOrder ?? 9999,
    contado: i.quantidadeContada.toNumber(),
    sugestao: i.quantidadeSolicitada.toNumber(),
    lote: i.produto.lotSize === null ? null : i.produto.lotSize.toNumber(),
    exclusivoDe: i.produto.exclusiveSupplier?.name ?? null,
    exclusivoId: i.produto.exclusiveSupplierId,
    exclusivoAtacado: i.produto.exclusiveSupplier?.compraNoAtacado ?? false,
    ultimoCusto: custoPorProduto.get(i.produtoId) ?? null,
  }));

  ordenarComoADespensa(linhas);
  return linhas;
}

/** Na ordem em que a despensa é percorrida: a gaveta manda, o nome desempata. */
function ordenarComoADespensa(linhas: LinhaParaRevisar[]): void {
  linhas.sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    const ca = a.categoria ?? "";
    const cb = b.categoria ?? "";
    if (ca !== cb) return ca.localeCompare(cb, "pt-BR");
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/**
 * A mesma lista, vestida para a tela.
 *
 * Separada de `calcularSugestoes` de propósito: `montarCotacao` não precisa de
 * nome, de unidade nem do histórico de preço, e fazê-la pagar por um `distinct`
 * no histórico e por um join de fornecedor para jogar tudo fora seria cobrar
 * da ação o preço da tela.
 *
 * Aceita várias contagens de uma vez: quem contou a despensa em duas voltas
 * junta as duas numa rodada de compra só. Produto contado nas duas vale pela
 * mais nova, e a lista de `repetidos` é o que a tela usa para dizer isso.
 *
 * Devolve também dois números de quem ficou de fora, e por motivos diferentes:
 * quem não tem estoque ideal cadastrado, e quem estava abaixo do ideal mas
 * faltando menos de meio lote. Sem eles a tela só sabe informar que não há
 * nada a comprar, o que soa como defeito quando a causa é cadastro em branco
 * ou uma regra que o dono escolheu.
 */
export async function linhasParaRevisar(contagemIds: number[]): Promise<{
  linhas: LinhaParaRevisar[];
  semIdeal: number;
  menosDeMeioLote: number;
  /** Produtos que apareceram em mais de uma contagem. Venceu a mais nova. */
  repetidos: string[];
  /** Contados que ficam de fora porque são pedidos pelas Requisições. */
  pelasRequisicoes: number;
}> {
  const itens = await prisma.contagemItem.findMany({
    where: { contagemId: { in: contagemIds }, quantidadeContada: { not: null } },
    select: {
      produtoId: true,
      quantidadeContada: true,
      contagemId: true,
      contagem: { select: { dataContagem: true } },
    },
    // Mais nova primeiro: com o `Map` abaixo guardando só a primeira de cada
    // produto, esta ordem É a regra de desempate.
    orderBy: { contagem: { dataContagem: "desc" } },
  });

  /* Um produto contado duas vezes vale pela contagem mais nova.
     Acontece quando duas voltas dividem uma categoria — recontou as bebidas na
     quarta depois de ter contado na segunda. Somar seria o desastre: se as
     duas passaram pela prateleira inteira, o estoque dobra e a casa deixa de
     comprar o que precisa. A mais nova é a que viu a prateleira por último. */
  const valendo = new Map<
    number,
    { contagemId: number; quantidadeContada: Prisma.Decimal }
  >();
  const repetidos = new Set<number>();
  for (const i of itens) {
    if (valendo.has(i.produtoId)) repetidos.add(i.produtoId);
    else
      valendo.set(i.produtoId, {
        contagemId: i.contagemId,
        quantidadeContada: i.quantidadeContada!,
      });
  }

  const contados = [...valendo].map(([produtoId, v]) => ({
    produtoId,
    quantidadeContada: v.quantidadeContada,
  }));

  /* Produto de Requisição não vai para a cotação: ele só é pedido pela
     Requisição, no dia dela, com o ideal daquele dia. A contagem dele vale
     como estoque do mesmo jeito. `montarCotacao` usa o mesmo filtro. */
  const [produtos, pelasRequisicoes] = await Promise.all([
    prisma.product.findMany({
    where: { id: { in: contados.map((i) => i.produtoId) }, isActive: true, ...FORA_DAS_REQUISICOES },
    select: {
      id: true,
      name: true,
      unit: true,
      idealStock: true,
      lotSize: true,
      categoryId: true,
      exclusiveSupplierId: true,
      category: { select: { name: true, sortOrder: true } },
      exclusiveSupplier: { select: { name: true, compraNoAtacado: true } },
    },
    }),
    prisma.product.count({
      where: { id: { in: contados.map((i) => i.produtoId) }, isActive: true, NOT: FORA_DAS_REQUISICOES },
    }),
  ]);

  const { sugestoes, menosDeMeioLote } = calcularSugestoes(contados, produtos);
  const dosSugeridos = new Set(sugestoes.map((s) => s.produtoId));

  const custoPorProduto = await ultimoCustoPorProduto([...dosSugeridos]);

  const porId = new Map(produtos.map((p) => [p.id, p]));

  const linhas = sugestoes.map((s) => {
    const p = porId.get(s.produtoId)!;
    return {
      produtoId: s.produtoId,
      contagemId: valendo.get(s.produtoId)!.contagemId,
      nome: p.name,
      unidade: p.unit,
      categoria: p.category?.name ?? null,
      // Sem gaveta cai no fim, que é onde ele pede arrumação.
      sortOrder: p.category?.sortOrder ?? 9999,
      contado: s.quantidadeContada.toNumber(),
      sugestao: s.quantidadeSolicitada.toNumber(),
      lote: p.lotSize === null ? null : p.lotSize.toNumber(),
      exclusivoDe: p.exclusiveSupplier?.name ?? null,
      exclusivoId: p.exclusiveSupplierId,
      exclusivoAtacado: p.exclusiveSupplier?.compraNoAtacado ?? false,
      ultimoCusto: custoPorProduto.get(s.produtoId) ?? null,
    };
  });

  ordenarComoADespensa(linhas);

  // Produto sem estoque ideal nunca é sugerido, então não precisa cruzar com
  // a lista: quem não tem alvo já está fora por definição.
  const semIdeal = produtos.filter((p) => p.idealStock === null).length;

  return {
    linhas,
    semIdeal,
    menosDeMeioLote,
    pelasRequisicoes,
    // Por nome, e não por id: quem lê a tela precisa reconhecer o produto, e
    // o aviso existe justamente para ele conferir se o número está certo.
    repetidos: [...repetidos]
      .map((id) => porId.get(id)?.name)
      .filter((n): n is string => n !== undefined)
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
  };
}
