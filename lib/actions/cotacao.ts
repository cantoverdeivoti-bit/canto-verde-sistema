"use server";

import { requireModule } from "@/lib/auth-guard";
import { registrarAviso } from "@/lib/avisos";
import { getSettings } from "@/lib/availability";
import { semanaTemOrcamento } from "@/lib/orcamento";
import { prisma } from "@/lib/db";
import { limparContadores } from "@/lib/contadores";
import {
  chaveDaEspecificacao,
  lerEspecificacoes,
  type RespostaEspecificacao,
} from "@/lib/especificacao";
import { dataDaCotacao, diaDaqui, formatAmount, plural } from "@/lib/format";
import { faltaParaOLote, serveNoLote } from "@/lib/lote";
import { novoToken } from "@/lib/token";
import { ultimoCustoPorProduto } from "@/lib/historico";
import { ofertasSuspeitas } from "@/lib/preco-suspeito";
import {
  custoEfetivo,
  escolherMelhoresOfertas,
  type ItemParaEscolher,
  type PerfilDoFornecedor,
} from "@/lib/escolha-automatica";
import { mediasPorFornecedor } from "@/lib/qualidade";
import { classesABC } from "@/lib/classe-abc";
import { LIMITE_DE_ALTA } from "@/lib/curva-abc";
import { desempenhoDosFornecedores } from "@/lib/relatorios-compras";
import { dadosDoPedidoDireto } from "@/lib/pedido-direto";
import { chaveDaRodada } from "@/lib/rodada";
import { FORA_DAS_REQUISICOES } from "@/lib/requisicao";
import { calcularSugestoes } from "@/lib/sugestao";
import {
  correcaoNaCotacaoSchema,
  ofertaNovaSchema,
  precoSchema,
  recusaSchema,
} from "@/lib/validations";
import type { CotacaoFornecedor, ProductUnit } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

/**
 * Montar a cotação a partir de uma contagem já fechada.
 *
 * Antes, contar e cotar nasciam juntos: quem comprava contava, logado no
 * painel, e a rodada começava com a contagem dentro dela. Contar passou a vir
 * antes e a ser trabalho de outra pessoa — o estoquista, pelo link. Aqui a
 * cotação nasce de uma contagem que já aconteceu.
 *
 * Só entra na lista o item que ficou ABAIXO do ideal. Item não contado (nulo)
 * fica de fora: sem saber o que tem na prateleira, qualquer sugestão de
 * quanto comprar seria chute.
 *
 * Produto exclusivo de um fornecedor pula a cotação: em vez de virar
 * `CotacaoItem`, a sugestão dele vira `PedidoCompra` direto — um por
 * fornecedor exclusivo presente nesta contagem, já com o link para ele
 * confirmar o preço. Não há comparação a fazer quando só um pode vender.
 *
 * A cotação (quando sobra item para ela) já nasce ABERTA. Não existe mais o
 * estado intermediário em que ela existia sem itens — era ele que produzia
 * rodadas presas em CONTANDO quando a segunda chamada do navegador não
 * acontecia. Pela mesma razão, uma contagem em que tudo virou pedido direto
 * não gera cotação nenhuma, vazia, só para existir.
 */
export async function montarCotacao(
  contagemIds: number[],
  excluidos: number[] = [],
  quantidades: { produtoId: number; quantidade: number }[] = [],
): Promise<
  Result<{
    id: number | null;
    criados: number;
    /** `token` nulo é compra no atacado: não há link para ninguém. */
    pedidosDiretos: { id: number; fornecedorId: number; token: string | null }[];
  }>
> {
  await requireModule("compras");

  // Ação de servidor é endpoint HTTP: a lista chega como palpite, mesmo com a
  // tela do lado de cá. Id que não estiver na conta é ignorado em silêncio —
  // recusar por causa de um id a mais faria a tela travar por um produto que
  // foi desativado no meio da conferência, e a resposta certa para ele é
  // simplesmente não estar na lista.
  const fora = new Set(
    excluidos.filter((n) => Number.isInteger(n) && n > 0).slice(0, 5000),
  );

  /**
   * A quantidade que ele digitou no lugar da que a conta sugeriu.
   *
   * A sugestão é `ideal − contado`, e para ele é sugestão mesmo. Para o
   * fornecedor ela chega como a quantidade que a casa quer comprar — e entre
   * uma coisa e a outra cabe o julgamento de quem compra. O campo
   * `CotacaoItem.quantidadeSolicitada` já nasceu para isso; o comentário dele
   * no schema diz "a quantidade que você vai cotar de verdade".
   *
   * Zero e negativo caem fora aqui: não comprar é o ✕ da tela, e uma linha
   * pedindo zero de alguma coisa é uma linha que o fornecedor não sabe ler.
   */
  const escolhida = new Map(
    quantidades
      .filter(
        (q) =>
          Number.isInteger(q.produtoId) &&
          q.produtoId > 0 &&
          Number.isFinite(q.quantidade) &&
          q.quantidade > 0,
      )
      .slice(0, 5000)
      .map((q) => [q.produtoId, q.quantidade]),
  );

  // A primeira compra da semana precisa do orçamento dela: a tela não deixa
  // montar sem ele, e a regra mora aqui também porque ação de servidor é endpoint.
  if (!(await semanaTemOrcamento((await getSettings()).capacity.timezone))) {
    return { ok: false, message: "Salve o faturamento da semana anterior e a meta de CMV." };
  }

  const ids = [...new Set(contagemIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) {
    return { ok: false, message: "Escolha ao menos uma contagem." };
  }

  const escolhidas = await prisma.contagem.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      concluida: true,
      cotacaoId: true,
      dataContagem: true,
      itens: { select: { produtoId: true, quantidadeContada: true } },
      // `processadaEm` é a marca de gasta: esta ação e a requisição (lista
      // fixa) sempre a gravam. Pedido direto já existente NÃO gasta a rodada —
      // pode ser o de um fornecedor confirmado antes, na própria conferência
      // (`confirmarPedidoDireto`), e esse é pulado mais abaixo.
      processadaEm: true,
    },
  });

  if (escolhidas.length !== ids.length) {
    return { ok: false, message: "Alguma das contagens não existe mais." };
  }
  if (escolhidas.some((c) => !c.concluida)) {
    return {
      ok: false,
      message: "Alguma das contagens ainda não foi finalizada.",
    };
  }
  if (escolhidas.some((c) => c.processadaEm !== null || c.cotacaoId !== null)) {
    return { ok: false, message: "Alguma das contagens já virou pedido." };
  }

  // Os fornecedores exclusivos já confirmados nesta rodada, um a um, na
  // conferência: os itens deles não viram pedido de novo aqui.
  const jaConfirmados = new Set(
    (
      await prisma.pedidoCompra.findMany({
        where: { contagemId: { in: ids }, cotacaoId: null, estatus: { not: "CANCELADO" } },
        select: { fornecedorId: true },
      })
    ).map((p) => p.fornecedorId),
  );

  /* Um produto contado em duas contagens vale pela mais nova — a mesma régua
     de `linhasParaRevisar`, e a tela já avisou quais foram. Somar seria o
     desastre: duas voltas pela mesma prateleira dobrariam o estoque, e a casa
     deixaria de comprar o que precisa.

     O `Map` guarda a primeira de cada produto, então ordenar da mais nova para
     a mais velha É a regra. Guarda também de qual contagem veio, porque o
     pedido direto precisa nascer amarrado a uma delas. */
  const porNovidade = [...escolhidas].sort(
    (a, b) => b.dataContagem.getTime() - a.dataContagem.getTime(),
  );
  const valendo = new Map<
    number,
    { contagemId: number; quantidadeContada: Prisma.Decimal }
  >();
  for (const c of porNovidade) {
    for (const i of c.itens) {
      if (i.quantidadeContada === null) continue;
      if (valendo.has(i.produtoId)) continue;
      valendo.set(i.produtoId, {
        contagemId: c.id,
        quantidadeContada: i.quantidadeContada,
      });
    }
  }

  const contados = [...valendo].map(([produtoId, v]) => ({
    produtoId,
    quantidadeContada: v.quantidadeContada,
  }));
  const produtos = await prisma.product.findMany({
    // Produto de Requisição fica fora: só a Requisição pede ele (o mesmo
    // filtro da tela de conferência, `linhasParaRevisar`).
    where: { id: { in: contados.map((i) => i.produtoId) }, isActive: true, ...FORA_DAS_REQUISICOES },
    select: {
      id: true,
      // O nome não é usado na conta: serve para a recusa por lote dizer de
      // qual produto está falando, em vez de devolver um id.
      name: true,
      idealStock: true,
      lotSize: true,
      categoryId: true,
      exclusiveSupplierId: true,
    },
  });

  /**
   * O lote, conferido de novo aqui.
   *
   * A tela já recusa 13 num fardo de 12 e trava o botão. Isto não é
   * desconfiança dela: ação de servidor é endpoint HTTP, e entre a tela
   * desenhar e ele clicar cabe alguém trocar o lote no cadastro noutra aba.
   * A mesma função nas duas pontas — `serveNoLote`, de `lib/lote.ts` — é o que
   * garante que a segunda conferência não contradiz a primeira por acaso.
   *
   * Recusa em vez de arredondar: o número foi digitado por ele, e consertar
   * calado seria mandar ao fornecedor uma quantidade que ninguém escolheu.
   *
   * Ignora em silêncio o item que ele tirou com o ✕ e o produto desativado no
   * meio da conferência — mesma política que `excluidos` já tem. Travar a
   * compra inteira por causa de um número digitado num item que ele depois
   * removeu seria recusar por nada.
   */
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const foraDoLote = [...escolhida].filter(([id, q]) => {
    const p = porId.get(id);
    if (p === undefined || fora.has(id)) return false;
    return !serveNoLote(q, p.lotSize === null ? null : p.lotSize.toNumber());
  });

  if (foraDoLote.length > 0) {
    const [id, q] = foraDoLote[0];
    const p = porId.get(id)!;
    const lote = p.lotSize!.toNumber();
    /* Os dois múltiplos que cercam o que ele digitou, pela mesma função que a
       tela usa para escrever "faltam 1 un para 216". Dizer "seriam 204 ou 216"
       é mais útil que "múltiplo de 12", e é a fala dele — e vindo do mesmo
       lugar, a recusa do servidor não pode contradizer o que a tela mostrou. */
    const f = faltaParaOLote(q, lote)!;
    return {
      ok: false,
      message:
        `${p.name}: ${formatAmount(q)} não fecha o lote de ${formatAmount(lote)} — ` +
        // Abaixo de um lote não existe compra menor: só o de cima é saída.
        (f.abaixo !== null
          ? `seriam ${formatAmount(f.abaixo)} ou ${formatAmount(f.acima)}.`
          : `seriam ${formatAmount(f.acima)}.`) +
        (foraDoLote.length > 1
          ? ` E mais ${plural(foraDoLote.length - 1, "item", "itens")}.`
          : "") +
        " Confira a tela e tente de novo.",
    };
  }

  // A conta mora em `lib/sugestao.ts`, e a tela de conferência chama a mesma.
  // É o que garante que o que ele viu antes de mandar é o que vai ser criado.
  const { sugestoes: todas, menosDeMeioLote } = calcularSugestoes(
    contados.map((i) => ({
      produtoId: i.produtoId,
      quantidadeContada: i.quantidadeContada!,
    })),
    produtos,
  );
  const sugestoes = todas
    .filter((s) => !fora.has(s.produtoId))
    // Já pedido um a um na conferência: fica de fora desta montagem.
    .filter((s) => s.exclusiveSupplierId === null || !jaConfirmados.has(s.exclusiveSupplierId))
    .map((s) => {
      const q = escolhida.get(s.produtoId);
      return q === undefined
        ? s
        : { ...s, quantidadeSolicitada: new Prisma.Decimal(q) };
    });

  if (todas.length === 0) {
    /* Com lote, uma contagem pode ter tudo abaixo do ideal e mesmo assim não
       gerar linha nenhuma. Dizer "nada abaixo do ideal" aí seria mentira, e
       ainda mandaria conferir um cadastro de estoque ideal que está certo. */
    return {
      ok: false,
      message:
        menosDeMeioLote > 0
          ? `Nada a comprar: ${plural(menosDeMeioLote, "item ficou", "itens ficaram")} abaixo do ideal, mas faltando menos de meio lote.`
          : "Nada abaixo do ideal nesta contagem — não há o que comprar. Confira se os produtos têm estoque ideal cadastrado.",
    };
  }

  // Recusa separada da de cima, e não a mesma mensagem: tirar tudo na
  // conferência é uma decisão dele, e dizer "nada abaixo do ideal" nesse caso
  // seria o sistema culpando o cadastro por uma escolha de quem clicou.
  if (sugestoes.length === 0 && jaConfirmados.size === 0) {
    return {
      ok: false,
      message: "Você tirou todos os itens — não há compra a montar.",
    };
  }
  // Sobrou nada porque tudo já foi confirmado fornecedor a fornecedor: aí é
  // só fechar a rodada — a transação abaixo marca as contagens e não cria
  // cotação nem pedido.

  const largas = sugestoes.filter((s) => s.exclusiveSupplierId === null);
  const diretas = sugestoes.filter((s) => s.exclusiveSupplierId !== null);

  /* Um pedido direto por fornecedor, mesmo juntando várias contagens.
     Antes era um por fornecedor E por contagem, e duas voltas pela despensa
     na mesma semana mandavam dois pedidos ao mesmo exclusivo — duas listas,
     dois links, e o fornecedor sem saber qual valia.

     O pedido guarda a contagem mais nova de onde vieram os itens dele: é
     por ela que a tela de Pedidos recorta a rodada (`?c=`). As outras não
     ficam soltas — `processadaEm`, marcado na transação abaixo, é o que as
     dá por gastas. */
  const novidade = new Map(porNovidade.map((c, i) => [c.id, i]));
  const porFornecedor = new Map<number, { fornecedorId: number; contagemId: number; itens: typeof diretas }>();
  for (const s of diretas) {
    const fornecedorId = s.exclusiveSupplierId!;
    const contagemId = valendo.get(s.produtoId)!.contagemId;
    const grupo = porFornecedor.get(fornecedorId);
    if (!grupo) porFornecedor.set(fornecedorId, { fornecedorId, contagemId, itens: [s] });
    else {
      grupo.itens.push(s);
      if (novidade.get(contagemId)! < novidade.get(grupo.contagemId)!) grupo.contagemId = contagemId;
    }
  }

  /* O prazo do cadastro, que aqui é o único que existe: o pedido direto não
     passa por cotação, então ninguém prometeu nada nesta rodada. Nulo quando
     o cadastro não sabe — a agenda mostra traço em vez de inventar um dia.
     Junto, se ele é atacado, e o último custo, que é o estimado do atacado. */
  const [cadastroDe, custoDiretas] = await Promise.all([
    prisma.supplier
      .findMany({
        where: {
          id: { in: [...new Set([...porFornecedor.values()].map((g) => g.fornecedorId))] },
        },
        select: { id: true, deliveryDays: true, compraNoAtacado: true },
      })
      .then((fs) => new Map(fs.map((f) => [f.id, f]))),
    ultimoCustoPorProduto(diretas.map((s) => s.produtoId)),
  ]);

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      // A trava é a própria escrita, e vem ANTES de criar qualquer coisa.
      //
      // A conferência lá em cima lê e depois escreve, então duas abas passam
      // as duas. No caminho da cotação isso já era pego de raspão pelo índice
      // único de `Contagem.cotacaoId`, que estoura na segunda transação. No
      // caminho do pedido direto não havia nada: `PedidoCompra` só é único por
      // (cotacaoId, fornecedorId), e pedido direto tem `cotacaoId` nulo — o
      // Postgres trata cada nulo como distinto, então dois cliques criavam
      // dois pedidos idênticos, com dois links vivos para o mesmo fornecedor.
      //
      // A tela de conferência torna isso mais provável, não menos: ela põe
      // minutos entre decidir e clicar, que é justamente quando a segunda aba
      // aparece.
      //
      // Com várias contagens, a trava é a mesma escrita, só que em todas: se
      // UMA delas já tiver virado compra, nenhuma linha sai daqui. `count`
      // tem que bater com o tamanho da seleção — bastar `> 0` deixaria passar
      // uma rodada montada com metade das contagens já gastas.
      //
      // E a escrita é a própria marca de gasta: `processadaEm` em todas as
      // escolhidas, inclusive a que não gerou cotação nem pedido.
      const trava = await tx.contagem.updateMany({
        where: {
          id: { in: ids },
          processadaEm: null,
          cotacaoId: null,
        },
        data: { processadaEm: new Date() },
      });
      if (trava.count !== ids.length) throw new Error("JA_PROCESSADA");

      // Confirmado um a um enquanto esta montagem corria? A trava acima e a de
      // `confirmarPedidoDireto` travam as mesmas linhas, então quem chegou
      // antes já está gravado aqui — e pedir de novo seria pedido em dobro.
      const confirmadosAgora = await tx.pedidoCompra.findMany({
        where: { contagemId: { in: ids }, cotacaoId: null, estatus: { not: "CANCELADO" } },
        select: { fornecedorId: true },
      });
      if (confirmadosAgora.some((p) => porFornecedor.has(p.fornecedorId))) throw new Error("JA_PROCESSADA");

      // A rodada virou compra: o rascunho da conferência não tem mais o que guardar.
      await tx.rascunhoConferencia.deleteMany({ where: { chave: chaveDaRodada(ids) } });

      let cotacaoId: number | null = null;

      if (largas.length > 0) {
        const cotacao = await tx.cotacao.create({
          data: { estatus: "ABERTA" },
          select: { id: true },
        });
        await tx.cotacaoItem.createMany({
          data: largas.map((s) => ({
            produtoId: s.produtoId,
            quantidadeSolicitada: s.quantidadeSolicitada,
            categoryId: s.categoryId,
            quantidadeContada: s.quantidadeContada,
            cotacaoId: cotacao.id,
          })),
        });
        cotacaoId = cotacao.id;

        // Amarra as contagens à cotação DENTRO da transação: é esta linha que
        // impede a mesma contagem de virar duas rodadas de compra. TODAS as
        // escolhidas, inclusive aquela cujos produtos foram todos substituídos
        // por uma contagem mais nova — ela foi gasta nesta rodada igual, e
        // deixá-la em branco a deixaria pronta para virar compra de novo.
        await tx.contagem.updateMany({
          where: { id: { in: ids } },
          data: { cotacaoId },
        });
      }

      const pedidosDiretos: { id: number; fornecedorId: number; token: string | null }[] = [];
      for (const { fornecedorId, contagemId, itens } of porFornecedor.values()) {
        const pedido = await tx.pedidoCompra.create({
          data: {
            fornecedorId,
            contagemId,
            /* Nasce feito, no mesmo estado do pedido que sai da cotação.
               Antes ele nascia AGUARDANDO_FORNECEDOR e só virava pedido de
               verdade quando o exclusivo preenchesse TODOS os preços pelo
               link. Na prática eles não preenchem — o dono disse, e o banco
               concorda: nenhum pedido direto saiu desse estado sozinho. O
               resultado era mercadoria chegando para um pedido que o sistema
               ainda tratava como consulta de preço.

               O link continua existindo e continua valendo: é a chance de ele
               adiantar o preço. Se não adiantar, quem recebe digita o da nota,
               que vem junto com a caixa. */
            ...dadosDoPedidoDireto(
              cadastroDe.get(fornecedorId) ?? { deliveryDays: null, compraNoAtacado: false },
              itens.map((s) => ({ produtoId: s.produtoId, quantidade: s.quantidadeSolicitada })),
              custoDiretas,
            ),
          },
          select: { id: true, fornecedorId: true, token: true },
        });
        pedidosDiretos.push(pedido);
      }

      return { cotacaoId, pedidosDiretos };
    });

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return {
      ok: true,
      data: {
        id: resultado.cotacaoId,
        criados: largas.length,
        pedidosDiretos: resultado.pedidosDiretos,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.message === "JA_PROCESSADA") {
      return { ok: false, message: "Alguma das contagens já virou pedido — recarregue a tela." };
    }
    console.error("[montarCotacao] falha:", err);
    return { ok: false, message: "Não foi possível montar a cotação." };
  }
}

/**
 * Salva a conferência como está — quantidades digitadas e itens tirados —
 * sem criar pedido nem cotação. É o "Salvar" embaixo de cada fornecedor:
 * sair da tela e voltar (ou abrir noutro aparelho) traz tudo de volta.
 *
 * Guarda a rodada inteira de uma vez, e não só o fornecedor do botão: o que
 * foi mexido nos outros grupos também não pode se perder.
 */
export async function salvarRascunhoConferencia(
  contagemIds: number[],
  quantidades: Record<string, string>,
  fora: number[],
): Promise<Result<{ salvoEm: string }>> {
  await requireModule("compras");

  const ids = [...new Set(contagemIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return { ok: false, message: "Escolha ao menos uma contagem." };

  const abertas = await prisma.contagem.count({
    where: { id: { in: ids }, concluida: true, processadaEm: null, cotacaoId: null },
  });
  if (abertas !== ids.length) return { ok: false, message: "Esta rodada já virou compra — recarregue a tela." };

  // Só pares produto → texto curto: é o que o campo guarda, e nada além.
  const limpas: Record<string, string> = {};
  for (const [k, v] of Object.entries(quantidades).slice(0, 2000)) {
    if (/^\d+$/.test(k) && typeof v === "string") limpas[k] = v.slice(0, 20);
  }
  const tirados = [...new Set(fora.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 2000);

  const chave = chaveDaRodada(ids);
  const r = await prisma.rascunhoConferencia.upsert({
    where: { chave },
    create: { chave, quantidades: limpas, fora: tirados },
    update: { quantidades: limpas, fora: tirados },
    select: { updatedAt: true },
  });
  return { ok: true, data: { salvoEm: r.updatedAt.toISOString() } };
}

/**
 * O pedido de UM fornecedor exclusivo, confirmado na conferência, antes do
 * resto da rodada.
 *
 * O dono confere a lista fornecedor por fornecedor e quer mandar cada pedido
 * direto assim que termina aquele grupo — sem esperar decidir a cotação dos
 * outros itens. A contagem continua aberta (`processadaEm` nulo): o botão do
 * fim da conferência depois monta o resto e PULA quem já foi confirmado aqui.
 *
 * As quantidades vêm da tela (o que ele deixou em cada linha), e o servidor
 * confere de novo o que importa: contagem aberta, produto exclusivo DESTE
 * fornecedor, contado na rodada, quantidade que fecha o lote — e que não
 * existe outro pedido dele nesta rodada.
 */
export async function confirmarPedidoDireto(
  contagemIds: number[],
  fornecedorId: number,
  itens: { produtoId: number; quantidade: number }[],
): Promise<Result<{ id: number; token: string | null }>> {
  await requireModule("compras");

  if (!(await semanaTemOrcamento((await getSettings()).capacity.timezone))) {
    return { ok: false, message: "Salve o faturamento da semana anterior e a meta de CMV." };
  }

  const ids = [...new Set(contagemIds.filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return { ok: false, message: "Escolha ao menos uma contagem." };
  if (!Number.isInteger(fornecedorId)) return { ok: false, message: "Fornecedor inválido." };

  const porProduto = new Map<number, number>();
  for (const i of itens.slice(0, 500)) {
    if (!Number.isInteger(i.produtoId) || !Number.isFinite(i.quantidade) || i.quantidade <= 0) {
      return { ok: false, message: "Quantidade inválida." };
    }
    porProduto.set(i.produtoId, i.quantidade);
  }
  if (porProduto.size === 0) return { ok: false, message: "Nenhum item para pedir." };

  const [contagens, produtos, fornecedor, contados, custo] = await Promise.all([
    prisma.contagem.findMany({
      where: { id: { in: ids } },
      select: { id: true, concluida: true, processadaEm: true, cotacaoId: true, dataContagem: true },
    }),
    prisma.product.findMany({
      where: { id: { in: [...porProduto.keys()] } },
      select: { id: true, name: true, isActive: true, exclusiveSupplierId: true, lotSize: true },
    }),
    prisma.supplier.findUnique({
      where: { id: fornecedorId },
      select: { isActive: true, deliveryDays: true, compraNoAtacado: true },
    }),
    prisma.contagemItem.findMany({
      where: { contagemId: { in: ids }, produtoId: { in: [...porProduto.keys()] }, quantidadeContada: { not: null } },
      select: { produtoId: true, contagemId: true },
    }),
    // O estimado do atacado. Lido para todo exclusivo porque é uma consulta
    // de poucas linhas, e saber antes se é atacado custaria outra ida.
    ultimoCustoPorProduto([...porProduto.keys()]),
  ]);

  if (contagens.length !== ids.length) return { ok: false, message: "Alguma das contagens não existe mais." };
  if (contagens.some((c) => !c.concluida)) return { ok: false, message: "Alguma das contagens ainda não foi finalizada." };
  if (contagens.some((c) => c.processadaEm !== null || c.cotacaoId !== null)) {
    return { ok: false, message: "Esta rodada já virou compra — recarregue a tela." };
  }
  if (!fornecedor || !fornecedor.isActive) return { ok: false, message: "Fornecedor não encontrado ou desativado." };
  if (produtos.length !== porProduto.size) return { ok: false, message: "Algum produto não existe mais." };

  for (const p of produtos) {
    if (!p.isActive) return { ok: false, message: `${p.name} foi desativado.` };
    if (p.exclusiveSupplierId !== fornecedorId) {
      return { ok: false, message: `${p.name} não é mais exclusivo deste fornecedor — recarregue a tela.` };
    }
    const q = porProduto.get(p.id)!;
    const lote = p.lotSize === null ? null : p.lotSize.toNumber();
    if (!serveNoLote(q, lote)) {
      return { ok: false, message: `${p.name}: ${formatAmount(q)} não fecha o lote de ${formatAmount(lote!)}.` };
    }
  }
  const contadosNaRodada = new Set(contados.map((c) => c.produtoId));
  const naoContado = produtos.find((p) => !contadosNaRodada.has(p.id));
  if (naoContado) return { ok: false, message: `${naoContado.name} não foi contado nesta rodada.` };

  // O pedido fica amarrado à contagem mais nova de onde vieram os itens — a
  // mesma regra de `montarCotacao`, que é por onde a tela de Pedidos recorta.
  const dataDe = new Map(contagens.map((c) => [c.id, c.dataContagem.getTime()]));
  const contagemId = contados.reduce(
    (nova, c) => (dataDe.get(c.contagemId)! > dataDe.get(nova)! ? c.contagemId : nova),
    contados[0].contagemId,
  );

  try {
    const pedido = await prisma.$transaction(async (tx) => {
      // Trava as contagens da rodada: dois cliques (ou o botão do fim ao mesmo
      // tempo) esperam um ao outro aqui, e o segundo vê o que o primeiro fez.
      await tx.$queryRaw`SELECT id FROM "contagens" WHERE id IN (${Prisma.join(ids)}) FOR UPDATE`;
      const aberta = await tx.contagem.count({ where: { id: { in: ids }, processadaEm: null, cotacaoId: null } });
      if (aberta !== ids.length) throw new Error("JA_PROCESSADA");
      const ja = await tx.pedidoCompra.count({
        where: { contagemId: { in: ids }, cotacaoId: null, fornecedorId, estatus: { not: "CANCELADO" } },
      });
      if (ja > 0) throw new Error("JA_CONFIRMADO");

      return tx.pedidoCompra.create({
        data: {
          fornecedorId,
          contagemId,
          ...dadosDoPedidoDireto(
            fornecedor,
            [...porProduto].map(([produtoId, q]) => ({ produtoId, quantidade: new Prisma.Decimal(q) })),
            custo,
          ),
        },
        select: { id: true, token: true },
      });
    });
    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: pedido };
  } catch (err) {
    if (err instanceof Error && err.message === "JA_PROCESSADA") {
      return { ok: false, message: "Esta rodada já virou compra — recarregue a tela." };
    }
    if (err instanceof Error && err.message === "JA_CONFIRMADO") {
      return { ok: false, message: "O pedido deste fornecedor já foi confirmado nesta rodada." };
    }
    console.error("[confirmarPedidoDireto] falha:", err);
    return { ok: false, message: "Não foi possível confirmar o pedido." };
  }
}

/**
 * Corrigir uma cotação que já existe: mudar quantidade e tirar item.
 *
 * A conferência é de mão única por natureza — ela calcula `ideal − contado`
 * na hora, e recalcular semana que vem daria os números de semana que vem.
 * Mas o que ela DECIDE não tem por que ser definitivo: quem montou a compra
 * com 216 de água e percebeu depois que queria 120 estava sem saída, e a
 * única saída à mão era apagar a cotação e recomeçar a semana.
 *
 * Por isso esta ação existe ao lado de `montarCotacao` e não dentro dela: uma
 * cria a rodada a partir do que foi contado, a outra corrige a rodada criada.
 * A tela é a mesma, e é de propósito — a validação do lote, o ✕ e o painel de
 * corrigir cadastro já estavam escritos ali.
 *
 * O limite é o pedido. Enquanto ninguém gerou pedido, mudar a quantidade é
 * mudar o que se vai perguntar ao fornecedor. Depois, o pedido é um
 * compromisso — o fornecedor viu aquele número, e corrigi-lo por aqui seria
 * mudar por baixo uma conta que já saiu de casa.
 *
 * Preço já dado NÃO trava, mas é recalculado: `Preco.subtotal` é
 * `precoUnitario × quantidadeSolicitada`, gravado. Mexer na quantidade e
 * deixar o subtotal velho faria o comparativo mentir, e escolher o mais
 * barato pela mentira. O preço unitário que o fornecedor digitou continua
 * intocado — o que muda é quanto disso a casa quer.
 */
/** Sai da transação de `atualizarCotacao` quando um pedido nasceu no meio. */
class CotacaoJaVirouPedido extends Error {}

export async function atualizarCotacao(
  cotacaoId: number,
  excluidos: number[] = [],
  quantidades: { produtoId: number; quantidade: number }[] = [],
): Promise<Result<{ id: number; removidos: number; alterados: number }>> {
  await requireModule("compras");

  if (!Number.isInteger(cotacaoId) || cotacaoId <= 0) {
    return { ok: false, message: "Cotação inválida." };
  }

  const cotacao = await prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    select: {
      id: true,
      pedidosCompra: { select: { id: true } },
      cotacaoItens: {
        select: {
          id: true,
          produtoId: true,
          quantidadeSolicitada: true,
          produto: { select: { name: true, lotSize: true } },
          precos: { select: { id: true, precoUnitario: true, quantidadeAprovada: true } },
        },
      },
    },
  });

  if (!cotacao) return { ok: false, message: "Cotação não encontrada." };
  if (cotacao.pedidosCompra.length > 0) {
    return {
      ok: false,
      message:
        "Esta cotação já virou pedido. O fornecedor viu estes números — para mudar a compra, fale com ele.",
    };
  }

  // Mesma política de `montarCotacao`: id que não está na cotação some em
  // silêncio, porque recusar por um id a mais travaria a tela por causa de um
  // item que outra aba removeu no meio.
  const fora = new Set(
    excluidos.filter((n) => Number.isInteger(n) && n > 0).slice(0, 5000),
  );
  const escolhida = new Map(
    quantidades
      .filter(
        (q) =>
          Number.isInteger(q.produtoId) &&
          q.produtoId > 0 &&
          Number.isFinite(q.quantidade) &&
          q.quantidade > 0,
      )
      .slice(0, 5000)
      .map((q) => [q.produtoId, q.quantidade]),
  );

  const restantes = cotacao.cotacaoItens.filter((i) => !fora.has(i.produtoId));
  if (restantes.length === 0) {
    return {
      ok: false,
      message:
        "Você tirou todos os itens. Uma cotação sem item nenhum não tem o que perguntar — apague a cotação se é isso que quer.",
    };
  }

  // O lote conferido de novo aqui, pela mesma função da tela — entre desenhar
  // e clicar cabe alguém trocar o lote no cadastro noutra aba.
  for (const i of restantes) {
    const q = escolhida.get(i.produtoId);
    if (q === undefined) continue;
    const lote = i.produto.lotSize === null ? null : i.produto.lotSize.toNumber();
    if (serveNoLote(q, lote)) continue;

    const f = faltaParaOLote(q, lote!)!;
    return {
      ok: false,
      message:
        `${i.produto.name}: ${formatAmount(q)} não fecha o lote de ${formatAmount(lote!)} — ` +
        (f.abaixo !== null
          ? `seriam ${formatAmount(f.abaixo)} ou ${formatAmount(f.acima)}.`
          : `seriam ${formatAmount(f.acima)}.`),
    };
  }

  const aRemover = cotacao.cotacaoItens.filter((i) => fora.has(i.produtoId));
  const aMudar = restantes.flatMap((i) => {
    const q = escolhida.get(i.produtoId);
    if (q === undefined) return [];
    const nova = new Prisma.Decimal(q.toFixed(3));
    // Salvar o que não mudou custaria uma escrita e um recálculo de preço por
    // item, toda vez que ele abrisse a tela e clicasse sem mexer em nada.
    return nova.equals(i.quantidadeSolicitada) ? [] : [{ item: i, nova }];
  });

  if (aRemover.length === 0 && aMudar.length === 0) {
    return { ok: true, data: { id: cotacaoId, removidos: 0, alterados: 0 } };
  }

  // A mesma recusa de `mudarQuantidadeDoItem`: as fatias da compra dividida
  // somam a quantidade de hoje, e o pedido sai delas, não do item. Mudar só o
  // item fazia 120 dividido em 60+60, editado para 96, ainda pedir 120.
  const dividido = aMudar.find(({ item }) => item.precos.some((p) => p.quantidadeAprovada !== null));
  if (dividido) {
    return {
      ok: false,
      message: `${dividido.item.produto.name}: a compra está dividida entre fornecedores. Desfaça a divisão para mudar a quantidade.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // De novo aqui dentro: entre a leitura lá de cima e este ponto cabe
      // alguém confirmar um fornecedor, e o pedido já teria saído com os
      // números antigos.
      const pedidos = await tx.pedidoCompra.count({ where: { cotacaoId } });
      if (pedidos > 0) throw new CotacaoJaVirouPedido();

      if (aRemover.length > 0) {
        // Os preços dos itens removidos vão junto por `onDelete: Cascade` no
        // schema — o preço de um item que não existe mais não é histórico de
        // nada, é lixo que apareceria no comparativo.
        await tx.cotacaoItem.deleteMany({
          where: { id: { in: aRemover.map((i) => i.id) } },
        });
      }

      for (const { item, nova } of aMudar) {
        await tx.cotacaoItem.update({
          where: { id: item.id },
          data: { quantidadeSolicitada: nova },
        });

        // O subtotal é derivado e gravado. Sem esta volta, o comparativo
        // compararia os totais de uma quantidade que não existe mais.
        // Um comando por item, e não um por preço: com 30 fornecedores
        // respondendo eram centenas de idas ao banco dentro da transação, e
        // ela estourava o tempo — o "apagar da cotação" falhava inteiro.
        if (item.precos.length > 0) {
          await tx.$executeRaw`
            UPDATE "precos"
            SET "quantidadeSolicitada" = ${nova.toString()}::numeric,
                "subtotal" = ROUND("precoUnitario" * ${nova.toString()}::numeric, 2),
                "updatedAt" = NOW()
            WHERE "cotacaoItemId" = ${item.id}`;
        }
      }
      // Folga para a cotação inteira mudada de uma vez (dezenas de itens).
    }, { timeout: 20_000 });

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return {
      ok: true,
      data: { id: cotacaoId, removidos: aRemover.length, alterados: aMudar.length },
    };
  } catch (err) {
    if (err instanceof CotacaoJaVirouPedido) {
      return {
        ok: false,
        message:
          "Esta cotação acabou de virar pedido. O fornecedor viu estes números — para mudar a compra, fale com ele.",
      };
    }
    console.error("[atualizarCotacao] falha:", err);
    return { ok: false, message: "Não foi possível salvar as mudanças." };
  }
}

/**
 * Acrescentar um produto a uma cotação que já existe.
 *
 * A compra nasce do que foi contado, e o que não foi contado não entra: é a
 * regra, e é boa. Mas ela deixava de fora o caso comum de quem sabe algo que a
 * prateleira não diz — vai ter festa no sábado, o fornecedor está com preço
 * bom no arroz, o estoquista pulou uma gaveta. A saída era contar de novo.
 *
 * `quantidadeContada` recebe o estoque do cadastro, e não zero. Zero diria que
 * a prateleira está vazia, o que é uma afirmação sobre o mundo que ninguém
 * fez. O cadastro é o que o sistema sabe — pode estar velho, mas é honesto, e
 * é o mesmo número que a coluna "Tem hoje" mostra em todo lugar.
 *
 * Mesmo limite de `atualizarCotacao`: enquanto não virou pedido.
 */
export async function adicionarItemNaCotacao(
  cotacaoId: number,
  produtoId: number,
  quantidade: number,
): Promise<Result<{ id: number }>> {
  await requireModule("compras");

  if (!Number.isInteger(cotacaoId) || cotacaoId <= 0) {
    return { ok: false, message: "Cotação inválida." };
  }
  if (!Number.isInteger(produtoId) || produtoId <= 0) {
    return { ok: false, message: "Escolha um produto." };
  }
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    return { ok: false, message: "A quantidade precisa ser maior que zero." };
  }

  const [cotacao, produto] = await Promise.all([
    prisma.cotacao.findUnique({
      where: { id: cotacaoId },
      select: {
        id: true,
        pedidosCompra: { select: { id: true } },
        cotacaoItens: { select: { produtoId: true } },
      },
    }),
    prisma.product.findUnique({
      where: { id: produtoId },
      select: {
        id: true,
        name: true,
        isActive: true,
        categoryId: true,
        currentStock: true,
        lotSize: true,
        exclusiveSupplierId: true,
      },
    }),
  ]);

  if (!cotacao) return { ok: false, message: "Cotação não encontrada." };
  if (!produto || !produto.isActive) {
    return { ok: false, message: "Produto não encontrado ou desativado." };
  }
  if (cotacao.pedidosCompra.length > 0) {
    return {
      ok: false,
      message: "Esta cotação já virou pedido — não dá para acrescentar item.",
    };
  }
  if (cotacao.cotacaoItens.some((i) => i.produtoId === produtoId)) {
    return { ok: false, message: `${produto.name} já está nesta cotação.` };
  }

  /* O exclusivo não entra, e a mensagem diz por quê.
     Produto de fornecedor exclusivo pula a cotação por desenho — não há o que
     comparar quando só um pode vender —, e a sugestão dele vira pedido direto
     em `montarCotacao`. Deixá-lo entrar aqui criaria uma linha que nenhum dos
     fornecedores chamados sabe responder. */
  if (produto.exclusiveSupplierId !== null) {
    return {
      ok: false,
      message: `${produto.name} é de fornecedor exclusivo — ele não passa por cotação.`,
    };
  }

  const lote = produto.lotSize === null ? null : produto.lotSize.toNumber();
  if (!serveNoLote(quantidade, lote)) {
    const f = faltaParaOLote(quantidade, lote!)!;
    return {
      ok: false,
      message:
        `${produto.name}: ${formatAmount(quantidade)} não fecha o lote de ${formatAmount(lote!)} — ` +
        (f.abaixo !== null
          ? `seriam ${formatAmount(f.abaixo)} ou ${formatAmount(f.acima)}.`
          : `seriam ${formatAmount(f.acima)}.`),
    };
  }

  try {
    const item = await prisma.cotacaoItem.create({
      data: {
        cotacaoId,
        produtoId,
        categoryId: produto.categoryId,
        quantidadeContada: produto.currentStock,
        quantidadeSolicitada: new Prisma.Decimal(quantidade.toFixed(3)),
      },
      select: { id: true },
    });

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: item };
  } catch (err) {
    console.error("[adicionarItemNaCotacao] falha:", err);
    return { ok: false, message: "Não foi possível acrescentar o item." };
  }
}

/** As opções de prazo, em horas a partir de agora: de "hoje à tarde" a três dias. */
const HORAS_DE_PRAZO = [6, 12, 24, 48, 72] as const;
type HorasDePrazo = (typeof HORAS_DE_PRAZO)[number];
const horasValidas = (h: unknown): h is HorasDePrazo => HORAS_DE_PRAZO.includes(h as HorasDePrazo);

/**
 * Até quando os fornecedores desta cotação podem responder: de 6 horas a 3
 * dias a partir de agora — a pedido do dono, botões em vez de data e hora
 * para digitar. Conta a partir do clique; o link mostra o resultado no fuso
 * da casa ("até quinta às 18:00"). Nulo tira o prazo. Prorrogar é escolher
 * de novo: a conta recomeça.
 */
export async function definirPrazoResposta(
  cotacaoId: number,
  horas: HorasDePrazo | null,
): Promise<Result<null>> {
  await requireModule("compras");

  // A ação é endpoint: o tipo não chega até aqui, a checagem sim.
  if (horas !== null && !horasValidas(horas)) {
    return { ok: false, message: "Escolha um dos prazos." };
  }
  const instante = horas === null ? null : new Date(Date.now() + horas * 60 * 60 * 1000);

  try {
    const r = await prisma.cotacao.updateMany({
      where: { id: cotacaoId, estatus: { not: "APROVADA" } },
      data: { prazoResposta: instante },
    });
    if (r.count === 0) {
      return { ok: false, message: "Esta cotação já foi fechada; o prazo não muda mais nada." };
    }
    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: null };
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Não foi possível salvar o prazo." };
  }
}

/**
 * Gerar link único pro fornecedor responder com preços.
 *
 * Sistema gera token, cria a CotacaoFornecedor, e você manda o link no
 * WhatsApp pelo botão da tela.
 */
export async function gerarLinkCotacao(
  cotacaoId: number,
  fornecedorId: number,
): Promise<Result<{ token: string; url: string }>> {
  await requireModule("compras");

  try {
    const cotacao = await prisma.cotacao.findUnique({
      where: { id: cotacaoId },
      select: { estatus: true },
    });

    if (!cotacao) {
      return { ok: false, message: "Cotação não encontrada" };
    }
    if (cotacao.estatus === "APROVADA") {
      return {
        ok: false,
        message: "Esta cotação já gerou pedidos; não dá para chamar mais ninguém",
      };
    }
    if (cotacao.estatus === "DESCARTADA") {
      return { ok: false, message: "Esta cotação foi descartada." };
    }

    const token = novoToken();

    await prisma.cotacaoFornecedor.create({
      data: { cotacaoId, fornecedorId, token, estatus: "ENVIADA" },
    });

    // Chamar alguém é voltar a esperar preço — inclusive quando a cotação
    // já estava em comparação e a pessoa lembrou de mais um fornecedor. O
    // rótulo na lista tem que dizer onde o trabalho está parado de verdade.
    await prisma.cotacao.update({
      where: { id: cotacaoId },
      data: { estatus: "RESPONDENDO" },
    });

    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: { token, url: `/comprador/cotacao/${token}` } };
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "P2002") {
      return { ok: false, message: "Este fornecedor já foi convidado nesta cotação" };
    }
    console.error(err);
    return { ok: false, message: "Erro ao gerar link" };
  }
}

/**
 * Fornecedor preencheu os preços. Salvar a resposta.
 *
 * Chamada de `/comprador/cotacao/<token>` quando o fornecedor submete. SEM
 * LOGIN — a porta é o token. Por isso a guarda de estado mora aqui, não só
 * na página: quem deixou o formulário aberto e envia depois dos pedidos
 * gerados chega direto nesta função, e a página já não está entre os dois.
 *
 * Tudo ou nada. Os preços são validados antes de qualquer escrita e gravados
 * numa transação só, porque um preço recusado no meio deixava os anteriores
 * gravados e o convite parado em ENVIADA — o fornecedor via um erro e
 * acreditava que nada tinha ido, enquanto a casa via uma resposta pela
 * metade de alguém que continuava marcado como esperando.
 *
 * `novos` são os itens que ele quis oferecer e a casa nunca pediu. Vêm pelo
 * mesmo envio porque são o mesmo botão: separar em duas ações faria metade da
 * resposta gravar e a outra não, que é exatamente o que o parágrafo acima
 * conta ter custado caro. Nada deles vira cadastro aqui — ficam esperando o
 * dono dizer que sim.
 */
/**
 * Tirar da rodada um fornecedor chamado por engano.
 *
 * Companheiro obrigatório de `gerarLinkCotacao`: sem ele, um clique errado
 * prende o fornecedor na cotação para sempre. Não é só feio — ele passa a
 * contar em "0 de 2 responderam", e a rodada nunca chega a "todos
 * responderam" por causa de alguém que ninguém pretendia chamar.
 *
 * SÓ quem não respondeu. Preço dado é trabalho de outra pessoa e é o que a
 * comparação usa; apagá-lo por aqui seria jogar fora a resposta de quem
 * atendeu. Quem já respondeu e não deve mais ser considerado se resolve na
 * comparação, recusando os preços dele.
 *
 * O link morre junto, porque o token era da linha que deixou de existir. É o
 * que se quer: ele foi chamado por engano.
 */
export async function desvincularFornecedor(
  cotacaoId: number,
  cotacaoFornecedorId: number,
): Promise<Result<null>> {
  await requireModule("compras");

  const chamado = await prisma.cotacaoFornecedor.findUnique({
    where: { id: cotacaoFornecedorId },
    select: {
      cotacaoId: true,
      estatus: true,
      _count: { select: { precos: true, produtosNovos: true } },
    },
  });

  if (!chamado || chamado.cotacaoId !== cotacaoId) {
    return { ok: false, message: "Este convite não é desta cotação." };
  }
  if (chamado.estatus === "RESPONDIDA" || chamado._count.precos > 0) {
    return {
      ok: false,
      message:
        "Este fornecedor já respondeu. Tirar o convite apagaria os preços dele — recuse os preços na comparação.",
    };
  }
  // Oferta é decisão de cadastro que ainda espera o dono, e não preço desta
  // rodada. Sumir com ela junto do convite apagaria uma pendência sem que
  // ninguém a tivesse visto.
  if (chamado._count.produtosNovos > 0) {
    return {
      ok: false,
      message:
        "Este fornecedor ofereceu produtos que ainda esperam sua decisão. Decida as ofertas antes de tirá-lo.",
    };
  }

  try {
    await prisma.cotacaoFornecedor.delete({ where: { id: cotacaoFornecedorId } });
    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: null };
  } catch (err) {
    console.error("[desvincularFornecedor] falha:", err);
    return { ok: false, message: "Não foi possível tirar o convite." };
  }
}

export async function salvarResposta(
  token: string,
  precos: Record<string, unknown>,
  novos: unknown[] = [],
): Promise<Result<CotacaoFornecedor>> {
  try {
    const chamado = await prisma.cotacaoFornecedor.findUnique({
      where: { token },
      include: {
        cotacao: {
          include: {
            // As especificações do produto: é contra elas que o "sim" do
            // fornecedor é conferido, e delas que sai o texto gravado.
            cotacaoItens: { include: { produto: { select: { name: true, especificacoes: true } } } },
          },
        },
      },
    });

    if (!chamado) {
      return { ok: false, message: "Link expirado ou inválido" };
    }
    if (chamado.cotacao.estatus === "APROVADA") {
      return {
        ok: false,
        message: "Esta cotação já foi fechada e os pedidos gerados. Obrigado pela resposta!",
      };
    }
    if (chamado.cotacao.estatus === "DESCARTADA") {
      return { ok: false, message: "Esta cotação foi cancelada. Obrigado!" };
    }
    // O prazo vale aqui, e não só na página: quem abriu o link antes da hora
    // e toca em Enviar depois dela chega direto nesta função.
    if (chamado.cotacao.prazoResposta && chamado.cotacao.prazoResposta.getTime() < Date.now()) {
      return {
        ok: false,
        message: "O prazo para responder esta cotação terminou. Fale com a gente se ainda quiser mandar preço.",
      };
    }

    const itens = new Map(chamado.cotacao.cotacaoItens.map((i) => [i.id, i]));
    const entradas: Array<{
      cotacaoItemId: number;
      valores: {
        precoUnitario: Prisma.Decimal;
        embalagem: string;
        conteudo: Prisma.Decimal;
        precoEmbalagem: Prisma.Decimal;
        estatus: "OFERTADO";
        quantidadeSolicitada: Prisma.Decimal;
        subtotal: Prisma.Decimal;
        prazoEntregaDias: number | null;
        marca: string;
        observacoes: string | null;
        descontoAcimaDe: Prisma.Decimal | null;
        descontoPrecoEmbalagem: Prisma.Decimal | null;
        especificacoes: RespostaEspecificacao[] | typeof Prisma.DbNull;
      };
    }> = [];

    const recusas: Array<{
      cotacaoItemId: number;
      produtoId: number;
      estatus: "SEM_ESTOQUE" | "NAO_TRABALHA";
      observacoes: string | null;
    }> = [];

    for (const [chave, precoData] of Object.entries(precos)) {
      const cotacaoItemId = Number(chave);
      const item = itens.get(cotacaoItemId);
      if (!item) {
        return { ok: false, message: "Um dos itens não pertence a esta cotação" };
      }

      /* Recusa e oferta chegam pela mesma porta, e se distinguem por ter ou
         não `estatus`. Uma ação só porque o fornecedor manda tudo num botão
         só: separar em duas faria metade da resposta gravar e a outra não. */
      const recusa = recusaSchema.safeParse(precoData);
      if (recusa.success) {
        recusas.push({
          cotacaoItemId,
          produtoId: item.produtoId,
          estatus: recusa.data.estatus,
          observacoes: recusa.data.observacoes,
        });
        continue;
      }

      const parsed = precoSchema.safeParse(precoData);
      if (!parsed.success) {
        return {
          ok: false,
          message: `${parsed.error.issues[0]?.message ?? "Preço inválido"} (nenhum preço foi gravado)`,
        };
      }

      /**
       * A conversão, num lugar só.
       *
       * Ele diz "fardo com 12 un por R$ 30"; a casa precisa de R$ 2,50 por un,
       * que é o número que torna ele comparável com quem vende caixa com 24.
       * A divisão fica aqui, no servidor, e não na cabeça de quem responde —
       * era ali que ela se perdia.
       *
       * Quatro casas decimais porque `precoUnitario` é `Decimal(12,4)`: um
       * fardo de 7 por R$ 10 dá 1,4285…, e o banco arredonda de qualquer
       * jeito. Eram duas, e um pacote de 1000 por R$ 15 virava R$ 0,02 a
       * unidade, 33% acima do que custa.
       */
      const precoEmbalagem = new Prisma.Decimal(parsed.data.precoEmbalagem);
      const conteudo = new Prisma.Decimal(parsed.data.conteudo);
      // O link de hoje manda o da unidade, como ele digitou; a página antiga, só o da embalagem.
      const precoUnitario =
        parsed.data.precoUnitario !== null
          ? new Prisma.Decimal(parsed.data.precoUnitario).toDecimalPlaces(4)
          : precoEmbalagem.dividedBy(conteudo).toDecimalPlaces(4);

      /* As especificações, conferidas contra o CADASTRO e não contra o que
         a tela mandou: o texto gravado sai daqui, e uma obrigatória sem "sim"
         recusa. A tela já não deixa salvar assim; isto é a porta dos fundos
         de quem mexeu na página. Sem "sim" numa obrigatória, o que ele tinha
         a dizer era "não trabalho com isso". */
      const exigidas = lerEspecificacoes(item.produto.especificacoes);
      const disse = new Map(
        parsed.data.especificacoes.map((r) => [chaveDaEspecificacao(r.texto), r.atende]),
      );
      const respostasEspec: RespostaEspecificacao[] = [];
      for (const e of exigidas) {
        const atende = disse.get(chaveDaEspecificacao(e.texto));
        if (e.obrigatoria && atende !== true) {
          return {
            ok: false,
            message: `${item.produto.name} precisa ser "${e.texto}". Confirme, ou marque que não trabalha com ele (nenhum preço foi gravado)`,
          };
        }
        if (atende !== undefined) respostasEspec.push({ ...e, atende });
      }

      entradas.push({
        cotacaoItemId,
        valores: {
          precoUnitario,
          embalagem: parsed.data.embalagem,
          conteudo,
          precoEmbalagem,
          estatus: "OFERTADO" as const,
          quantidadeSolicitada: item.quantidadeSolicitada,
          subtotal: precoUnitario.times(item.quantidadeSolicitada),
          prazoEntregaDias: parsed.data.prazoEntregaDias,
          marca: parsed.data.marca,
          observacoes: parsed.data.observacoes,
          // Nulos quando não ofereceu: o reenvio sem desconto apaga o de antes.
          descontoAcimaDe:
            parsed.data.descontoAcimaDe === null
              ? null
              : new Prisma.Decimal(parsed.data.descontoAcimaDe),
          descontoPrecoEmbalagem:
            parsed.data.descontoPrecoEmbalagem === null
              ? null
              : new Prisma.Decimal(parsed.data.descontoPrecoEmbalagem),
          // Nulo de banco, e não lista vazia, quando o produto não tem
          // especificação: "não perguntamos" é diferente de "respondeu nada".
          especificacoes: respostasEspec.length > 0 ? respostasEspec : Prisma.DbNull,
        },
      });
    }

    /* Teto porque esta porta não tem senha. Vinte é folgado para quem tem
       novidade de verdade e curto para quem resolveu despejar o catálogo
       inteiro numa tabela que alguém daqui vai ter que ler linha a linha. */
    if (novos.length > 20) {
      return { ok: false, message: "Ofereça no máximo 20 produtos novos por vez" };
    }

    const ofertas: Array<{
      nome: string;
      unit: ProductUnit;
      embalagem: string;
      conteudo: Prisma.Decimal;
      precoEmbalagem: Prisma.Decimal;
      marca: string;
      observacoes: string | null;
    }> = [];

    for (const novo of novos) {
      const parsed = ofertaNovaSchema.safeParse(novo);
      if (!parsed.success) {
        return {
          ok: false,
          message: `${parsed.error.issues[0]?.message ?? "Produto novo inválido"} (nada foi gravado)`,
        };
      }
      ofertas.push({
        nome: parsed.data.nome,
        unit: parsed.data.unit,
        embalagem: parsed.data.embalagem,
        conteudo: new Prisma.Decimal(parsed.data.conteudo),
        precoEmbalagem: new Prisma.Decimal(parsed.data.precoEmbalagem),
        marca: parsed.data.marca,
        observacoes: parsed.data.observacoes,
      });
    }

    /* Recusa conta como resposta. Antes, quem não tinha NADA da lista não
       tinha como dizer isso — o botão barrava o envio vazio, e o único jeito
       de sair era fechar a aba, deixando a cotação esperando para sempre por
       alguém que já havia decidido. */
    if (entradas.length === 0 && recusas.length === 0 && ofertas.length === 0) {
      return { ok: false, message: "Responda ao menos um item" };
    }

    /* Quantos itens que pesam no bolso (curva A ou B) vieram mais de 10%
       acima da última compra: vai no aviso, que chega no celular. A marca em
       cada preço fica no comparativo; aqui é o "vale a pena olhar agora". */
    const ofertados = entradas.map((e) => itens.get(e.cotacaoItemId)!.produtoId);
    const [custos, classes] =
      ofertados.length > 0
        ? await Promise.all([ultimoCustoPorProduto(ofertados), classesABC()])
        : [new Map<number, { valor: number }>(), new Map<number, string>()];
    const acimaDoUltimo = entradas.filter((e) => {
      const produtoId = itens.get(e.cotacaoItemId)!.produtoId;
      const custo = custos.get(produtoId);
      const classe = classes.get(produtoId);
      return (
        custo !== undefined &&
        (classe === "A" || classe === "B") &&
        e.valores.precoUnitario.toNumber() > custo.valor * (1 + LIMITE_DE_ALTA)
      );
    }).length;

    const atualizado = await prisma.$transaction(async (tx) => {
      for (const e of entradas) {
        // Upsert, não create: o fornecedor que errou um dígito e reenvia está
        // corrigindo, não duplicando.
        await tx.preco.upsert({
          where: {
            cotacaoItemId_cotacaoFornecedorId: {
              cotacaoItemId: e.cotacaoItemId,
              cotacaoFornecedorId: chamado.id,
            },
          },
          create: {
            cotacaoItemId: e.cotacaoItemId,
            cotacaoFornecedorId: chamado.id,
            ...e.valores,
          },
          update: e.valores,
        });
      }

      for (const r of recusas) {
        const valores = {
          estatus: r.estatus,
          observacoes: r.observacoes,
          // Zero aqui não é preço: é o lugar vazio de colunas que o banco
          // exige. Quem diz se a linha é oferta é `estatus`, e é por ele que
          // toda comparação filtra antes de procurar o menor.
          precoUnitario: new Prisma.Decimal(0),
          subtotal: new Prisma.Decimal(0),
          quantidadeSolicitada: new Prisma.Decimal(0),
          embalagem: null,
          conteudo: null,
          precoEmbalagem: null,
          descontoAcimaDe: null,
          descontoPrecoEmbalagem: null,
          especificacoes: Prisma.DbNull,
          marca: null,
          // Recusa nunca fica escolhida. Se ele tinha dado preço antes e agora
          // diz que não tem, a escolha do dono cai junto — comprar de quem
          // acabou de dizer que não tem seria o pior desfecho possível.
          aprovado: false,
        };
        await tx.preco.upsert({
          where: {
            cotacaoItemId_cotacaoFornecedorId: {
              cotacaoItemId: r.cotacaoItemId,
              cotacaoFornecedorId: chamado.id,
            },
          },
          create: {
            cotacaoItemId: r.cotacaoItemId,
            cotacaoFornecedorId: chamado.id,
            ...valores,
          },
          update: valores,
        });

      }

      /* "Não trabalho com isso" desfaz o vínculo, e é o fornecedor limpando
         a própria lista. "Não tenho estoque" não desfaz nada: vale esta
         rodada, e na semana que vem ele é perguntado de novo. Um comando só
         para todos, e não um por recusa. */
      const naoTrabalha = recusas.filter((r) => r.estatus === "NAO_TRABALHA").map((r) => r.produtoId);
      if (naoTrabalha.length > 0) {
        await tx.productSupplier.deleteMany({
          where: { productId: { in: naoTrabalha }, supplierId: chamado.fornecedorId },
        });
      }

      /* Reenviar substitui as ofertas, não empilha: o que está na tela dele é
         a resposta dele. Só as PENDENTES saem — a que o dono já decidiu virou
         história, e história não se apaga porque alguém mandou o formulário
         de novo. */
      await tx.cotacaoProdutoNovo.deleteMany({
        where: { cotacaoFornecedorId: chamado.id, status: "PENDENTE" },
      });
      if (ofertas.length > 0) {
        await tx.cotacaoProdutoNovo.createMany({
          data: ofertas.map((o) => ({ ...o, cotacaoFornecedorId: chamado.id })),
        });
      }

      // O aviso para a casa, junto com a resposta. Reenviar é "atualizou".
      await registrarAviso(tx, {
        tipo: "COTACAO_RESPONDIDA",
        fornecedorId: chamado.fornecedorId,
        cotacaoId: chamado.cotacaoId,
        titulo:
          chamado.estatus === "RESPONDIDA"
            ? `atualizou a resposta da cotação de ${dataDaCotacao(chamado.cotacao.dataInicio)}`
            : `respondeu a cotação de ${dataDaCotacao(chamado.cotacao.dataInicio)}`,
        detalhe: [
          plural(entradas.length, "item com preço", "itens com preço"),
          recusas.length > 0 && `${recusas.length} sem estoque ou não trabalha`,
          ofertas.length > 0 && plural(ofertas.length, "produto novo oferecido", "produtos novos oferecidos"),
          acimaDoUltimo > 0 &&
            plural(acimaDoUltimo, "item importante acima da última compra", "itens importantes acima da última compra"),
        ]
          .filter(Boolean)
          .join(" · "),
      });

      const resposta = await tx.cotacaoFornecedor.update({
        where: { id: chamado.id },
        data: { estatus: "RESPONDIDA", dataRespostaRecebida: new Date() },
      });

      // Quando o último convidado responde, a cotação deixa de esperar e passa
      // a ser comparação. Só a partir de RESPONDENDO: uma resposta que chegue
      // depois da aprovação não pode desfazer a aprovação — a guarda lá em
      // cima cobre o caso comum, e a condição aqui cobre a corrida entre ela
      // e esta escrita.
      await fecharSeNinguemFalta(tx, chamado.cotacaoId);

      return resposta;
      // Um `upsert` por item respondido. Numa cotação de cem itens os cinco
      // segundos padrão estouravam, e o fornecedor perdia a resposta inteira
      // no único botão que ele aperta.
    }, { timeout: 30_000 });

    revalidatePath(`/admin/compras/cotacao/${chamado.cotacaoId}`, "page");
    return { ok: true, data: atualizado };
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Erro ao salvar resposta" };
  }
}

/**
 * Marcar de quem você vai comprar este item.
 *
 * Um vencedor por item: aprovar um preço desaprova os outros do mesmo item
 * na mesma transação, para nunca existir dois "sim" por acidente.
 *
 * Dois "sim" DE PROPÓSITO existem, e têm porta própria — `dividirCompra`.
 * Clicar numa célula continua sendo escolher um só, e por isso limpa
 * `quantidadeAprovada` junto: uma divisão antiga deixaria o novo escolhido
 * levando a fatia que era do outro.
 */
export async function aprovarPreco(
  precoId: number,
  aprovado: boolean,
  /** Falso quando a tela já marcou sozinha e recarrega depois, uma vez só. */
  atualizarTela = true,
): Promise<Result<null>> {
  await requireModule("compras");

  try {
    const preco = await prisma.preco.findUnique({
      where: { id: precoId },
      select: {
        cotacaoItemId: true,
        estatus: true,
        cotacaoItem: {
          select: {
            cotacao: { select: { id: true, estatus: true } },
            precos: {
              where: { aprovado: true },
              select: { cotacaoFornecedor: { select: { fornecedorId: true } } },
            },
          },
        },
      },
    });
    if (!preco) return { ok: false, message: "Preço não encontrado" };
    if (preco.cotacaoItem.cotacao.estatus === "APROVADA") {
      return { ok: false, message: "Os pedidos já foram gerados; a escolha está fechada" };
    }
    /* Trocar o vencedor desaprova os outros da linha — inclusive um que já
       esteja dentro de um pedido confirmado. O item sairia da cotação e
       continuaria no pedido, e as duas telas passariam a discordar sobre a
       mesma compra. */
    const comprados = await fornecedoresJaComprados(preco.cotacaoItem.cotacao.id);
    if (
      preco.cotacaoItem.precos.some((p) => comprados.has(p.cotacaoFornecedor.fornecedorId))
    ) {
      return { ok: false, message: COMPRA_FEITA };
    }
    // Recusa não se escolhe. A linha existe com preço zero só para preencher
    // colunas que o banco exige, e comprar de quem disse que não tem seria o
    // pior desfecho que esta tela pode produzir.
    if (aprovado && preco.estatus !== "OFERTADO") {
      return { ok: false, message: "Este fornecedor não ofereceu este item." };
    }

    await prisma.$transaction([
      prisma.preco.updateMany({
        where: { cotacaoItemId: preco.cotacaoItemId },
        data: { aprovado: false, quantidadeAprovada: null },
      }),
      prisma.preco.update({ where: { id: precoId }, data: { aprovado } }),
    ]);

    if (atualizarTela) revalidatePath(`/admin/compras/cotacao/${preco.cotacaoItem.cotacao.id}`, "page");
    return { ok: true, data: null };
  } catch (err) {
    console.error(err);
    return { ok: false, message: "Erro ao aprovar preço" };
  }
}

export type ResumoDaEscolha = {
  itens: number;
  total: number;
  porFornecedor: {
    fornecedorId: number;
    nome: string;
    itens: number;
    total: number;
    /** Preenchido quando o total (com o que já foi escolhido à mão) fica abaixo do mínimo dele. */
    minimoNaoAlcancado: number | null;
  }[];
};

/**
 * "Escolher os melhores": pré-marca o vencedor de cada item ainda sem
 * escolha, pela conta de `lib/escolha-automatica.ts` (preço com desconto por
 * volume, pedido mínimo, desempate por prazo e estrelas).
 *
 * Em dois tempos, de propósito. Sem `confirmar` ela só devolve o resumo —
 * quantos itens, para quem, quanto — e não grava nada; o dono lê e decide.
 * Com `confirmar`, grava a mesma conta refeita agora, e não a do resumo: entre
 * os dois toques pode ter chegado preço novo.
 *
 * Não mexe no que já foi escolhido à mão, nem em compra dividida, nem em
 * fornecedor que já virou pedido.
 */
export async function escolherMelhores(
  cotacaoId: number,
  confirmar: boolean,
): Promise<Result<ResumoDaEscolha>> {
  await requireModule("compras");

  const cotacao = await prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    select: {
      estatus: true,
      cotacaoItens: {
        select: {
          id: true,
          produtoId: true,
          quantidadeSolicitada: true,
          precos: {
            select: {
              id: true,
              estatus: true,
              aprovado: true,
              quantidadeAprovada: true,
              precoUnitario: true,
              subtotal: true,
              conteudo: true,
              descontoAcimaDe: true,
              descontoPrecoEmbalagem: true,
              cotacaoFornecedor: { select: { fornecedorId: true } },
            },
          },
        },
      },
    },
  });
  if (!cotacao) return { ok: false, message: "Cotação não encontrada." };
  if (cotacao.estatus === "APROVADA") {
    return { ok: false, message: "Os pedidos já foram gerados; a escolha está fechada." };
  }

  const [comprados, ultimosCustos] = await Promise.all([
    fornecedoresJaComprados(cotacaoId),
    ultimoCustoPorProduto(cotacao.cotacaoItens.map((i) => i.produtoId)),
  ]);
  const jaEscolhido = new Map<number, number>();
  const itens: ItemParaEscolher[] = [];
  for (const i of cotacao.cotacaoItens) {
    const aprovados = i.precos.filter((p) => p.aprovado);
    if (aprovados.length > 0) {
      for (const p of aprovados) {
        const f = p.cotacaoFornecedor.fornecedorId;
        jaEscolhido.set(f, (jaEscolhido.get(f) ?? 0) + p.subtotal.toNumber());
      }
      continue;
    }
    const suspeitas = ofertasSuspeitas(
      i.precos
        .filter((p) => p.estatus === "OFERTADO")
        .map((p) => ({ id: p.id, precoUnitario: p.precoUnitario.toNumber(), conteudo: p.conteudo?.toNumber() ?? null })),
      ultimosCustos.get(i.produtoId)?.valor ?? null,
    );
    itens.push({
      itemId: i.id,
      quantidade: i.quantidadeSolicitada.toNumber(),
      ofertas: i.precos
        .filter(
          (p) =>
            p.estatus === "OFERTADO" &&
            !comprados.has(p.cotacaoFornecedor.fornecedorId) &&
            // A suspeita (preço do kg no campo da caixa) fica para a escolha na mão.
            !suspeitas.has(p.id),
        )
        .map((p) => ({
          precoId: p.id,
          fornecedorId: p.cotacaoFornecedor.fornecedorId,
          precoUnitario: p.precoUnitario.toNumber(),
          conteudo: p.conteudo?.toNumber() ?? null,
          descontoAcimaDe: p.descontoAcimaDe?.toNumber() ?? null,
          descontoPrecoEmbalagem: p.descontoPrecoEmbalagem?.toNumber() ?? null,
        })),
    });
  }

  const fornecedorIds = [...new Set(itens.flatMap((i) => i.ofertas.map((o) => o.fornecedorId)))];
  if (fornecedorIds.length === 0) {
    return { ok: false, message: "Não há item sem escolha com preço para escolher." };
  }

  // O histórico de prazo é dos últimos 90 dias: o fornecedor que melhorou não
  // carrega para sempre o atraso de um ano atrás.
  const { capacity } = await getSettings();
  const fim = new Date();
  const inicio = new Date(fim.getTime() - 90 * 86_400_000);
  const [fornecedores, desempenho, estrelas] = await Promise.all([
    prisma.supplier.findMany({
      where: { id: { in: fornecedorIds } },
      select: { id: true, name: true, apelido: true, minOrder: true },
    }),
    desempenhoDosFornecedores(inicio, fim, capacity.timezone),
    mediasPorFornecedor(fornecedorIds),
  ]);
  const prazo = new Map(desempenho.map((d) => [d.fornecedorId, d.comPrevisao > 0 ? d.noPrazo / d.comPrevisao : null]));
  const perfis = new Map<number, PerfilDoFornecedor>(
    fornecedores.map((f) => [
      f.id,
      {
        minimo: f.minOrder?.toNumber() ?? null,
        pontualidade: prazo.get(f.id) ?? null,
        estrelas: estrelas.get(f.id)?.media ?? null,
      },
    ]),
  );

  const escolha = escolherMelhoresOfertas(itens, perfis, jaEscolhido);
  const quantidade = new Map(itens.map((i) => [i.itemId, i.quantidade]));
  const nomes = new Map(fornecedores.map((f) => [f.id, f.apelido ?? f.name]));
  const porFornecedor = new Map<number, ResumoDaEscolha["porFornecedor"][number]>();
  for (const [itemId, o] of escolha) {
    const linha = porFornecedor.get(o.fornecedorId) ?? {
      fornecedorId: o.fornecedorId,
      nome: nomes.get(o.fornecedorId) ?? "Fornecedor",
      itens: 0,
      total: 0,
      minimoNaoAlcancado: null,
    };
    linha.itens += 1;
    linha.total = Math.round((linha.total + custoEfetivo(o, quantidade.get(itemId)!)) * 100) / 100;
    porFornecedor.set(o.fornecedorId, linha);
  }
  // Fica abaixo do mínimo só quem não tinha alternativa em nenhum item: a
  // conta já tirou dele o que dava. O dono precisa saber antes de confirmar.
  for (const linha of porFornecedor.values()) {
    const minimo = perfis.get(linha.fornecedorId)?.minimo ?? null;
    const total = linha.total + (jaEscolhido.get(linha.fornecedorId) ?? 0);
    if (minimo !== null && total < minimo) linha.minimoNaoAlcancado = minimo;
  }
  const resumo: ResumoDaEscolha = {
    itens: escolha.size,
    total: Math.round([...porFornecedor.values()].reduce((s, f) => s + f.total, 0) * 100) / 100,
    porFornecedor: [...porFornecedor.values()].sort((a, b) => b.total - a.total),
  };
  if (!confirmar || escolha.size === 0) return { ok: true, data: resumo };

  try {
    const ids = [...escolha.values()].map((o) => o.precoId);
    // Um comando só, e com a trava na própria condição: item que ganhou um
    // escolhido entre o resumo e o toque (outra aba, outra pessoa) fica como
    // a pessoa deixou.
    await prisma.$executeRaw`
      UPDATE "precos" AS p
         SET "aprovado" = true, "quantidadeAprovada" = NULL, "updatedAt" = NOW()
       WHERE p.id IN (${Prisma.join(ids)})
         AND p."estatus" = 'OFERTADO'
         AND NOT EXISTS (
           SELECT 1 FROM "precos" AS q
            WHERE q."cotacaoItemId" = p."cotacaoItemId" AND q."aprovado" = true
         )`;
  } catch (err) {
    console.error("[escolherMelhores] falha:", err);
    return { ok: false, message: "Não foi possível gravar a escolha." };
  }

  revalidatePath(`/admin/compras/cotacao/${cotacaoId}`, "page");
  return { ok: true, data: resumo };
}

/**
 * "Quem mais vende ISTO?" — respondido na linha do item.
 *
 * Duas coisas num gesto só, e é de propósito. Vincula o fornecedor ao
 * PRODUTO, que é o vínculo que dura — na semana que vem ele aparece sozinho,
 * sem ninguém precisar lembrar — e o chama para ESTA cotação, que é o que
 * resolve o problema de agora.
 *
 * Substitui o botão de vincular que ficava na barra, e a diferença é onde a
 * pergunta nasce: ela nasce olhando uma linha com dois preços só, e não no
 * alto da tela em abstrato. O botão da barra chamava para a rodada e não
 * mexia no cadastro, então na semana seguinte o mesmo item voltava com os
 * mesmos dois preços e o mesmo trabalho.
 *
 * Idempotente nos dois lados: vínculo que já existe não vira erro
 * (`createMany` com `skipDuplicates`), e fornecedor já chamado mantém o
 * convite que tem em vez de ganhar um segundo. Clicar duas vezes não é
 * acidente de quem se enganou — é a pessoa confirmando que era isso mesmo.
 *
 * NÃO mexe nas categorias dele. Marcar uma gaveta que ele talvez não atenda
 * era justamente a gambiarra que esta ação veio substituir.
 */
export async function vincularFornecedorAoItem(
  cotacaoItemId: number,
  fornecedorId: number,
): Promise<Result<{ vinculoNovo: boolean; convidado: boolean }>> {
  await requireModule("compras");

  const item = await prisma.cotacaoItem.findUnique({
    where: { id: cotacaoItemId },
    select: {
      produtoId: true,
      cotacaoId: true,
      cotacao: { select: { estatus: true } },
      produto: { select: { name: true } },
    },
  });
  if (!item) return { ok: false, message: "Item não encontrado." };
  if (item.cotacao.estatus === "APROVADA") {
    return {
      ok: false,
      message: "Esta cotação já gerou pedidos — não dá para chamar mais ninguém.",
    };
  }

  const fornecedor = await prisma.supplier.findUnique({
    where: { id: fornecedorId },
    select: { id: true, isActive: true, name: true },
  });
  if (!fornecedor) return { ok: false, message: "Fornecedor não encontrado." };
  if (!fornecedor.isActive) {
    return {
      ok: false,
      message: `${fornecedor.name} está desativado no cadastro. Reative-o antes de chamá-lo.`,
    };
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const vinculo = await tx.productSupplier.createMany({
        data: [{ productId: item.produtoId, supplierId: fornecedorId }],
        skipDuplicates: true,
      });

      const jaChamado = await tx.cotacaoFornecedor.findFirst({
        where: { cotacaoId: item.cotacaoId, fornecedorId },
        select: { id: true },
      });

      if (jaChamado === null) {
        await tx.cotacaoFornecedor.create({
          data: {
            cotacaoId: item.cotacaoId,
            fornecedorId,
            token: novoToken(),
            estatus: "ENVIADA",
          },
        });
        /* Chamar alguém é voltar a esperar preço — inclusive com a cotação
           já em comparação, que é exatamente o caso desta tela. O rótulo da
           lista tem de dizer onde o trabalho está parado de verdade. */
        await tx.cotacao.updateMany({
          where: { id: item.cotacaoId, estatus: { not: "APROVADA" } },
          data: { estatus: "RESPONDENDO" },
        });
      }

      return { vinculoNovo: vinculo.count > 0, convidado: jaChamado === null };
    });

    revalidatePath("/admin/compras/cotacao", "layout");
    revalidatePath("/admin/compras", "page");
    return { ok: true, data: resultado };
  } catch (err) {
    console.error("[vincularFornecedorAoItem] falha:", err);
    return { ok: false, message: "Não foi possível vincular este fornecedor." };
  }
}

/**
 * Comprar o mesmo item de mais de um fornecedor.
 *
 * O caso que a escolha única não cobre: o melhor preço não tem a quantidade
 * toda, ou entrega metade hoje e metade na quinta. Sem isto a saída era
 * mentir numa das pontas — pedir 204 a quem só tem 120, ou pedir a um só e
 * completar por fora, sem o sistema saber.
 *
 * A soma das partes tem de FECHAR a quantidade do item, e a recusa diz o que
 * falta ou o que sobra. Aceitar soma diferente seria deixar a tela decidir em
 * silêncio se o resto é para comprar ou para esquecer — e as duas respostas
 * custam dinheiro.
 *
 * Cada parte fecha o lote sozinha, pela mesma função da lista de itens: o
 * fardo de 12 não se divide em dois de 102, e quem recebe o pedido é o
 * fornecedor, não a soma.
 *
 * Grava a lista inteira, nunca um delta: chega o retrato final da divisão e
 * ele substitui o anterior. Lista vazia desfaz tudo e devolve o item para
 * "ninguém escolhido", que é o que o botão de desfazer manda.
 *
 * NÃO mexe em `subtotal`. Ver o comentário de `quantidadeAprovada` no schema:
 * subtotal é "quanto custaria tudo deste fornecedor", e é ele quem torna as
 * colunas comparáveis.
 */
export async function dividirCompra(
  cotacaoItemId: number,
  partes: { precoId: number; quantidade: number }[],
): Promise<Result<null>> {
  await requireModule("compras");

  const item = await prisma.cotacaoItem.findUnique({
    where: { id: cotacaoItemId },
    select: {
      id: true,
      cotacaoId: true,
      quantidadeSolicitada: true,
      produto: { select: { name: true, lotSize: true } },
      cotacao: { select: { estatus: true } },
      precos: {
        select: {
          id: true,
          estatus: true,
          aprovado: true,
          cotacaoFornecedor: { select: { fornecedorId: true } },
        },
      },
    },
  });

  if (!item) return { ok: false, message: "Item não encontrado." };
  if (item.cotacao.estatus === "APROVADA") {
    return {
      ok: false,
      message: "Os pedidos já foram gerados — a divisão virou compra e não se mexe mais.",
    };
  }
  // Repartir de novo mexeria na fatia de quem já levou a dele no pedido.
  const comprados = await fornecedoresJaComprados(item.cotacaoId);
  if (
    item.precos.some((p) => p.aprovado && comprados.has(p.cotacaoFornecedor.fornecedorId))
  ) {
    return { ok: false, message: COMPRA_FEITA };
  }

  // Desfazer é caso legítimo e sai antes de toda a conferência: não há soma
  // para fechar quando não se compra de ninguém.
  if (partes.length === 0) {
    await prisma.preco.updateMany({
      where: { cotacaoItemId },
      data: { aprovado: false, quantidadeAprovada: null },
    });
    revalidatePath(`/admin/compras/cotacao/${item.cotacaoId}`, "page");
    return { ok: true, data: null };
  }

  if (new Set(partes.map((p) => p.precoId)).size !== partes.length) {
    return { ok: false, message: "O mesmo fornecedor aparece duas vezes na divisão." };
  }

  const ofertas = new Map(item.precos.map((p) => [p.id, p.estatus]));
  for (const parte of partes) {
    const estatus = ofertas.get(parte.precoId);
    if (estatus === undefined) {
      return { ok: false, message: "Um dos fornecedores da divisão não é deste item." };
    }
    // Recusa não se escolhe, nem dividida: a linha existe com preço zero só
    // para preencher colunas que o banco exige.
    if (estatus !== "OFERTADO") {
      return { ok: false, message: "Um dos fornecedores da divisão não ofereceu este item." };
    }
    if (!Number.isFinite(parte.quantidade) || parte.quantidade <= 0) {
      return {
        ok: false,
        message: "Cada fornecedor precisa de uma quantidade maior que zero. Para tirar um, deixe-o de fora.",
      };
    }
  }

  const lote = item.produto.lotSize === null ? null : item.produto.lotSize.toNumber();
  for (const parte of partes) {
    if (serveNoLote(parte.quantidade, lote)) continue;
    const f = faltaParaOLote(parte.quantidade, lote!)!;
    return {
      ok: false,
      message:
        `${item.produto.name}: ${formatAmount(parte.quantidade)} não fecha o lote de ${formatAmount(lote!)} — ` +
        (f.abaixo !== null
          ? `cada parte teria de ser ${formatAmount(f.abaixo)} ou ${formatAmount(f.acima)}.`
          : `cada parte teria de ser ${formatAmount(f.acima)}.`),
    };
  }

  const quantidades = partes.map((p) => new Prisma.Decimal(p.quantidade.toFixed(3)));
  const soma = quantidades.reduce((acc, q) => acc.plus(q), new Prisma.Decimal(0));
  if (!soma.equals(item.quantidadeSolicitada)) {
    const diferenca = soma.minus(item.quantidadeSolicitada);
    return {
      ok: false,
      message: diferenca.isNegative()
        ? `Faltam ${formatAmount(diferenca.abs().toNumber())} para fechar os ${formatAmount(item.quantidadeSolicitada.toNumber())} do item.`
        : `Sobram ${formatAmount(diferenca.toNumber())} além dos ${formatAmount(item.quantidadeSolicitada.toNumber())} do item.`,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.preco.updateMany({
        where: { cotacaoItemId },
        data: { aprovado: false, quantidadeAprovada: null },
      });
      for (const [i, parte] of partes.entries()) {
        await tx.preco.update({
          where: { id: parte.precoId },
          data: {
            aprovado: true,
            /* Um fornecedor só não é divisão: é a escolha de sempre, e
               guardar a fatia aqui seria um número a mais dizendo o que
               `CotacaoItem.quantidadeSolicitada` já diz — e que sairia do
               lugar no dia em que a quantidade do item mudasse. */
            quantidadeAprovada: partes.length === 1 ? null : quantidades[i],
          },
        });
      }
    });

    revalidatePath(`/admin/compras/cotacao/${item.cotacaoId}`, "page");
    return { ok: true, data: null };
  } catch (err) {
    console.error("[dividirCompra] falha:", err);
    return { ok: false, message: "Não foi possível dividir a compra." };
  }
}

/**
 * O preço que saiu da conversa, digitado à mão.
 *
 * A cotação termina com o que cada fornecedor digitou no link, e até aqui era
 * intocável. Mas o preço de verdade sai de depois disso: o dono manda
 * mensagem, pede melhora, e fecha noutro número. Esse número não tinha onde
 * morar — e a alternativa era comprar por um preço que a tela nunca soube.
 *
 * `precoUnitario` passa a ser o ACERTADO, e `precoNegociadoDe` guarda o que
 * ele tinha cotado. Sobrescrever calado apagaria a única prova de que a
 * conversa valeu: "R$ 1,09 → R$ 0,95" é o que diz se negociar com este
 * fornecedor rende.
 *
 * O primeiro preço, e não o anterior: negociar duas vezes na mesma linha
 * continua mostrando o que ele pediu no começo, que é a âncora real.
 *
 * `precoEmbalagem` vai junto, recalculado. Ele é como ele VENDE — caixa de 12
 * por R$ 13,08 —, e deixar o valor velho ali ao lado de um unitário novo
 * seria a tela contando duas histórias sobre o mesmo acordo.
 *
 * Só em linha OFERTADA: negociar preço com quem disse "não tenho estoque" é
 * acordo sobre coisa que não existe.
 */
export async function negociarPreco(
  precoId: number,
  novoUnitario: number,
): Promise<Result<{ precoUnitario: number; subtotal: number }>> {
  await requireModule("compras");

  if (!Number.isFinite(novoUnitario) || novoUnitario <= 0) {
    return { ok: false, message: "O preço precisa ser maior que zero." };
  }
  if (novoUnitario > 9_999_999) {
    return { ok: false, message: "Esse preço é grande demais — confira as casas." };
  }

  const preco = await prisma.preco.findUnique({
    where: { id: precoId },
    select: {
      id: true,
      estatus: true,
      precoUnitario: true,
      precoNegociadoDe: true,
      conteudo: true,
      quantidadeSolicitada: true,
      cotacaoFornecedor: { select: { fornecedorId: true } },
      cotacaoItem: { select: { cotacaoId: true, cotacao: { select: { estatus: true } } } },
    },
  });

  if (!preco) return { ok: false, message: "Preço não encontrado." };
  if (preco.cotacaoItem.cotacao.estatus === "APROVADA") {
    return {
      ok: false,
      message: "Os pedidos já foram gerados — este preço virou compra e não se mexe mais.",
    };
  }
  /* Compra confirmada no rodapé fecha a coluna dele, e não só a cotação
     inteira: o preço já foi copiado para dentro do pedido, e mudá-lo aqui
     faria a cotação dizer um número e o pedido outro. */
  if (
    (await fornecedoresJaComprados(preco.cotacaoItem.cotacaoId)).has(
      preco.cotacaoFornecedor.fornecedorId,
    )
  ) {
    return { ok: false, message: COMPRA_FEITA };
  }
  if (preco.estatus !== "OFERTADO") {
    return {
      ok: false,
      message: "Este fornecedor não ofereceu este item — não há preço a negociar.",
    };
  }

  const novo = new Prisma.Decimal(novoUnitario.toFixed(2));
  if (novo.equals(preco.precoUnitario)) {
    return {
      ok: true,
      data: {
        precoUnitario: novo.toNumber(),
        subtotal: novo.times(preco.quantidadeSolicitada).toNumber(),
      },
    };
  }

  try {
    const salvo = await prisma.preco.update({
      where: { id: precoId },
      data: {
        precoUnitario: novo,
        // Só na primeira negociação. Depois disso ele já guarda o original.
        precoNegociadoDe: preco.precoNegociadoDe ?? preco.precoUnitario,
        subtotal: novo.times(preco.quantidadeSolicitada),
        precoEmbalagem:
          preco.conteudo === null ? null : novo.times(preco.conteudo).toDecimalPlaces(2),
      },
      select: { precoUnitario: true, subtotal: true },
    });

    revalidatePath(`/admin/compras/cotacao/${preco.cotacaoItem.cotacaoId}`, "page");
    return {
      ok: true,
      data: {
        precoUnitario: salvo.precoUnitario.toNumber(),
        subtotal: salvo.subtotal.toNumber(),
      },
    };
  } catch (err) {
    console.error("[negociarPreco] falha:", err);
    return { ok: false, message: "Não foi possível gravar o preço negociado." };
  }
}

/**
 * Sugerir, a partir da cotação, uma correção no cadastro do produto — nome,
 * unidade, categoria —, que vai para Pendências esperar a autorização do dono.
 *
 * Quem compara preço é quem vê primeiro que o coco seco está em KG e se
 * compra em pacote. Não muda o cadastro na hora, de propósito: trocar a
 * unidade mexe no estoque e na comparação inteira, e isso é decisão de quem
 * manda no cadastro. É a mesma fila das correções do estoquista.
 *
 * Uma sugestão pendente por produto e cotação: mandar de novo corrige a
 * anterior em vez de empilhar.
 */
export async function sugerirCorrecaoNaCotacao(cotacaoId: number, raw: unknown): Promise<Result<null>> {
  const autor = await requireModule("compras");

  const parsed = correcaoNaCotacaoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { produtoId, nome, unit, categoryId, observacoes, idealStock, lotSize } = parsed.data;

  const item = await prisma.cotacaoItem.findFirst({
    where: { cotacaoId, produtoId },
    select: {
      produto: { select: { name: true, unit: true, categoryId: true, idealStock: true, lotSize: true } },
    },
  });
  if (!item) return { ok: false, message: "Este produto não está nesta cotação." };

  const gaveta =
    categoryId === null
      ? null
      : ((await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } }))?.id ?? null);
  const atual = item.produto;
  // Estoque ideal e lote só contam como mudança quando vieram e são outros.
  const idealNovo = idealStock !== null && idealStock !== (atual.idealStock?.toNumber() ?? null) ? idealStock : null;
  const loteNovo = lotSize !== null && lotSize !== (atual.lotSize?.toNumber() ?? null) ? lotSize : null;
  const mexeu =
    nome.trim().toLowerCase() !== atual.name.trim().toLowerCase() ||
    unit !== atual.unit ||
    gaveta !== atual.categoryId ||
    idealNovo !== null ||
    loteNovo !== null ||
    observacoes !== null;
  if (!mexeu) return { ok: false, message: "Nada mudou. Ajuste um campo ou escreva o que está errado." };

  const valores = {
    nome,
    unit,
    categoryId: gaveta,
    observacoes,
    idealStock: idealNovo === null ? null : new Prisma.Decimal(idealNovo),
    lotSize: loteNovo === null ? null : new Prisma.Decimal(loteNovo),
    // Pelo link de atalhos a pessoa não tem conta: fica sem autor.
    sugeridoPorId: autor.atalho ? null : autor.id,
  };
  try {
    const ja = await prisma.contagemProdutoCorrecao.findFirst({
      where: { cotacaoId, produtoId, status: "PENDENTE" },
      select: { id: true },
    });
    if (ja) await prisma.contagemProdutoCorrecao.update({ where: { id: ja.id }, data: valores });
    else await prisma.contagemProdutoCorrecao.create({ data: { cotacaoId, produtoId, ...valores } });
  } catch (err) {
    console.error("[sugerirCorrecaoNaCotacao] falha:", err);
    return { ok: false, message: "Não foi possível enviar a correção." };
  }

  revalidatePath("/admin/compras", "layout");
  limparContadores();
  return { ok: true, data: null };
}

/**
 * Corrigir o que o fornecedor escreveu na oferta: a embalagem, quanto vem
 * nela, o preço dela e a marca.
 *
 * Existe porque o fornecedor erra a gramagem — escreve "Leke 500 gr" na marca
 * e marca a embalagem como 1 kg, e o preço por kg sai pela metade, ganhando a
 * comparação sem merecer. A casa confere com ele e corrige aqui, digitando o
 * preço da unidade da casa como o link pede; o da embalagem sai multiplicado
 * pelo que vem nela.
 *
 * Mesmas travas de `negociarPreco`: cotação fechada, compra já confirmada
 * com este fornecedor, ou item que ele não ofereceu. Corrigir apaga o rastro
 * de negociação — o preço negociado era sobre a embalagem errada — e o preço
 * por volume, que era da embalagem antiga.
 */
export async function corrigirOferta(
  precoId: number,
  /** `precoUnitario`: o da unidade da casa (o kg, a un), como o link pede agora. */
  dados: { embalagem: string; conteudo: number; precoUnitario: number; marca: string },
): Promise<Result<null>> {
  await requireModule("compras");

  const embalagem = dados.embalagem.trim().slice(0, 60);
  const marca = dados.marca.trim().slice(0, 120);
  if (embalagem === "") return { ok: false, message: "Diga como ele vende." };
  if (!Number.isFinite(dados.conteudo) || dados.conteudo <= 0 || dados.conteudo > 999999) {
    return { ok: false, message: "Quanto vem na embalagem precisa ser maior que zero." };
  }
  if (!Number.isFinite(dados.precoUnitario) || dados.precoUnitario <= 0 || dados.precoUnitario > 9_999_999) {
    return { ok: false, message: "O preço precisa ser maior que zero." };
  }

  const preco = await prisma.preco.findUnique({
    where: { id: precoId },
    select: {
      estatus: true,
      embalagem: true,
      quantidadeSolicitada: true,
      cotacaoFornecedor: { select: { fornecedorId: true } },
      cotacaoItem: { select: { cotacaoId: true, cotacao: { select: { estatus: true } } } },
    },
  });
  if (!preco) return { ok: false, message: "Oferta não encontrada." };
  if (preco.cotacaoItem.cotacao.estatus === "APROVADA") {
    return { ok: false, message: "Os pedidos já foram gerados — esta oferta virou compra e não se mexe mais." };
  }
  if ((await fornecedoresJaComprados(preco.cotacaoItem.cotacaoId)).has(preco.cotacaoFornecedor.fornecedorId)) {
    return { ok: false, message: COMPRA_FEITA };
  }
  if (preco.estatus !== "OFERTADO") {
    return { ok: false, message: "Este fornecedor não ofereceu este item — não há oferta a corrigir." };
  }

  const conteudo = new Prisma.Decimal(dados.conteudo.toFixed(3));
  const precoUnitario = new Prisma.Decimal(dados.precoUnitario.toFixed(4));
  const precoEmbalagem = precoUnitario.times(conteudo).toDecimalPlaces(2);
  const mudouEmbalagem = (preco.embalagem ?? "") !== embalagem;

  try {
    await prisma.preco.update({
      where: { id: precoId },
      data: {
        embalagem,
        conteudo,
        precoEmbalagem,
        precoUnitario,
        subtotal: precoUnitario.times(preco.quantidadeSolicitada),
        marca: marca === "" ? null : marca,
        precoNegociadoDe: null,
        ...(mudouEmbalagem ? { descontoAcimaDe: null, descontoPrecoEmbalagem: null } : {}),
      },
    });
  } catch (err) {
    console.error("[corrigirOferta] falha:", err);
    return { ok: false, message: "Não foi possível corrigir a oferta." };
  }

  revalidatePath(`/admin/compras/cotacao/${preco.cotacaoItem.cotacaoId}`, "page");
  return { ok: true, data: null };
}

/**
 * Mudar quanto a casa quer comprar de um item, no meio da comparação.
 *
 * Irmã de `negociarPreco`, e o outro lado da mesma conversa: o fornecedor
 * melhora o preço se levar mais, ou só entrega a caixa fechada. Sem poder
 * mexer na quantidade aqui, a saída era sair da comparação, ir à lista de
 * itens, corrigir e voltar — perdendo de vista os preços que estavam sendo
 * comparados.
 *
 * Mexe em TODOS os preços do item, e é por isso que ela existe em vez de um
 * `update` solto: a quantidade é a mesma pergunta feita a todo mundo, e cada
 * `Preco` guarda uma cópia dela mais o subtotal que saiu dela. Mudar só a do
 * `CotacaoItem` deixaria nove linhas de comparação apontando para um número
 * que já não é o pedido.
 */
export async function mudarQuantidadeDoItem(
  cotacaoItemId: number,
  quantidade: number,
): Promise<Result<null>> {
  await requireModule("compras");

  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    return {
      ok: false,
      message: "A quantidade precisa ser maior que zero. Para não comprar, não escolha ninguém.",
    };
  }

  const item = await prisma.cotacaoItem.findUnique({
    where: { id: cotacaoItemId },
    select: {
      id: true,
      cotacaoId: true,
      quantidadeSolicitada: true,
      produto: { select: { name: true, lotSize: true } },
      cotacao: { select: { estatus: true } },
      precos: {
        select: {
          id: true,
          precoUnitario: true,
          quantidadeAprovada: true,
          aprovado: true,
          cotacaoFornecedor: { select: { fornecedorId: true } },
        },
      },
    },
  });

  if (!item) return { ok: false, message: "Item não encontrado." };
  if (item.cotacao.estatus === "APROVADA") {
    return {
      ok: false,
      message: "Os pedidos já foram gerados — a quantidade virou compra e não se mexe mais.",
    };
  }
  // A quantidade deste item já foi para dentro do pedido de alguém.
  const comprados = await fornecedoresJaComprados(item.cotacaoId);
  if (
    item.precos.some((p) => p.aprovado && comprados.has(p.cotacaoFornecedor.fornecedorId))
  ) {
    return { ok: false, message: COMPRA_FEITA };
  }

  /* Linha dividida recusa, em vez de se ajustar sozinha.
     As fatias somam a quantidade de hoje, e nenhum ajuste automático teria
     resposta honesta: dobrar as duas metades seria inventar uma negociação
     que não houve, e zerar a divisão jogaria fora o acerto com dois
     fornecedores sem avisar. Desfazer é um clique, e é decisão de quem
     comprou. */
  if (item.precos.some((p) => p.quantidadeAprovada !== null)) {
    return {
      ok: false,
      message:
        "Esta compra está dividida entre fornecedores. Desfaça a divisão para mudar a quantidade do item.",
    };
  }

  // O lote conferido pela mesma função da lista de itens: a comparação não
  // pode ser a porta por onde 13 entra num fardo de 12.
  const lote = item.produto.lotSize === null ? null : item.produto.lotSize.toNumber();
  if (!serveNoLote(quantidade, lote)) {
    const f = faltaParaOLote(quantidade, lote!)!;
    return {
      ok: false,
      message:
        `${item.produto.name}: ${formatAmount(quantidade)} não fecha o lote de ${formatAmount(lote!)} — ` +
        (f.abaixo !== null
          ? `seriam ${formatAmount(f.abaixo)} ou ${formatAmount(f.acima)}.`
          : `seriam ${formatAmount(f.acima)}.`),
    };
  }

  const nova = new Prisma.Decimal(quantidade.toFixed(3));
  if (nova.equals(item.quantidadeSolicitada)) return { ok: true, data: null };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.cotacaoItem.update({
        where: { id: cotacaoItemId },
        data: { quantidadeSolicitada: nova },
      });
      // Um comando para todos os preços do item, e não um por fornecedor:
      // com muitos respondendo, as idas ao banco estouravam o tempo da
      // transação (o mesmo tropeço que `atualizarCotacao` já teve).
      await tx.$executeRaw`
        UPDATE "precos"
        SET "quantidadeSolicitada" = ${nova.toString()}::numeric,
            "subtotal" = ROUND("precoUnitario" * ${nova.toString()}::numeric, 2),
            "updatedAt" = NOW()
        WHERE "cotacaoItemId" = ${cotacaoItemId}`;
    });

    revalidatePath(`/admin/compras/cotacao/${item.cotacaoId}`, "page");
    return { ok: true, data: null };
  } catch (err) {
    console.error("[mudarQuantidadeDoItem] falha:", err);
    return { ok: false, message: "Não foi possível mudar a quantidade." };
  }
}

/**
 * Os fornecedores desta cotação cuja compra já foi confirmada.
 *
 * Confirmada quer dizer "já virou `PedidoCompra`", e é isso que trava as
 * edições: o preço daquele fornecedor foi copiado para dentro do pedido, e
 * mexer nele depois faria a cotação e o pedido contarem histórias diferentes
 * sobre a mesma compra.
 *
 * Não precisa de coluna nova para responder: `PedidoCompra` já tem
 * `@@unique([cotacaoId, fornecedorId])`, então a existência da linha É a
 * resposta — e uma coluna a mais seria um segundo lugar onde a mesma verdade
 * poderia ficar desatualizada.
 *
 * Devolve `fornecedorId`, e não `cotacaoFornecedorId`: é o que o pedido
 * guarda. Quem tem um preço na mão chega aqui por
 * `preco.cotacaoFornecedor.fornecedorId`.
 */
async function fornecedoresJaComprados(cotacaoId: number): Promise<Set<number>> {
  const pedidos = await prisma.pedidoCompra.findMany({
    /* Cancelado NÃO conta como comprado.
       A linha continua lá — cancelar parqueia, não apaga — mas o que ela
       representa deixou de existir. Sem este filtro, cancelar o pedido
       deixava a cotação travada para sempre: as colunas do fornecedor
       continuavam fechadas, o rodapé continuava dizendo "pedido #22", e não
       havia como voltar atrás de nada. */
    where: { cotacaoId, estatus: { not: "CANCELADO" } },
    select: { fornecedorId: true },
  });
  return new Set(pedidos.map((p) => p.fornecedorId));
}

/**
 * Criar o pedido de um fornecedor nesta cotação — ou ressuscitar o que foi
 * cancelado.
 *
 * `PedidoCompra` tem `@@unique([cotacaoId, fornecedorId])`: uma cotação tem
 * no máximo UM pedido por fornecedor, e a linha cancelada continua ocupando
 * esse lugar. Um `create` puro esbarraria nela, e o dono ficava sem saída —
 * cancelou por engano, e aquele fornecedor não podia mais ser confirmado
 * naquela rodada.
 *
 * Ressuscitar e não criar outro, porque a chave única diz o que o desenho
 * quer: "a compra desta cotação com este fornecedor" é uma coisa só. Ela
 * volta com os números de AGORA — itens, total e prazo são substituídos —,
 * e não com os de quando foi cancelada, que podem ter mudado no meio.
 *
 * O registro em "Encerrados" some junto, e é honesto que suma: aquele pedido
 * voltou a existir, e deixá-lo nas duas listas seria a mesma compra contada
 * como cancelada e como ativa ao mesmo tempo.
 */
async function gravarPedidoDaCotacao(
  tx: Prisma.TransactionClient,
  dados: {
    cotacaoId: number;
    fornecedorId: number;
    precoTotal: Prisma.Decimal;
    prazo: number | null;
    itens: {
      produtoId: number;
      quantidadeSolicitada: Prisma.Decimal;
      precoUnitario: Prisma.Decimal;
      marca: string | null;
    }[];
  },
): Promise<number> {
  const { cotacaoId, fornecedorId, precoTotal, prazo, itens } = dados;

  const cancelado = await tx.pedidoCompra.findFirst({
    where: { cotacaoId, fornecedorId, estatus: "CANCELADO" },
    select: { id: true },
  });

  const criarItens = itens.map((i) => ({
    produtoId: i.produtoId,
    quantidadeSolicitada: i.quantidadeSolicitada,
    quantidadeRecebida: null,
    precoUnitario: i.precoUnitario,
    marca: i.marca,
  }));

  if (cancelado !== null) {
    // Os itens antigos saem inteiros: o que volta é a compra de agora, e
    // comparar item a item para decidir o que fica seria trabalho a mais
    // para chegar no mesmo lugar.
    await tx.pedidoCompraItem.deleteMany({ where: { pedidoCompraId: cancelado.id } });
    await tx.pedidoCompra.update({
      where: { id: cancelado.id },
      data: {
        estatus: "CRIADO",
        dataEntregaPrevista: prazo === null ? null : diaDaqui(prazo),
        precoTotal,
        // O que a vida anterior deixou: envio, recebimento e a divergência
        // decidida. Cancelar um pedido recebido estorna o estoque mas não
        // desmarca a entrega; sem zerar aqui, ele voltava "já recebido" e
        // Recebimentos recusava conferir — travado para sempre.
        dataEnvio: null,
        dataEntregaReal: null,
        entregaConfirmada: false,
        observacoes: null,
        divergenciaResolvidaEm: null,
        divergenciaDesfecho: null,
        divergenciaNota: null,
        divergenciaResolvidaPorId: null,
        itens: { createMany: { data: criarItens } },
      },
    });
    await levarBonificacoesAoPedido(tx, cotacaoId, fornecedorId, cancelado.id);
    return cancelado.id;
  }

  const pedido = await tx.pedidoCompra.create({
    data: {
      cotacaoId,
      fornecedorId,
      dataEntregaPrevista: prazo === null ? null : diaDaqui(prazo),
      precoTotal,
      itens: { createMany: { data: criarItens } },
    },
    select: { id: true },
  });
  await levarBonificacoesAoPedido(tx, cotacaoId, fornecedorId, pedido.id);
  return pedido.id;
}

/**
 * A bonificação combinada na cotação vai junto quando a compra vira pedido:
 * é no pedido que a mensagem ao fornecedor e o recebimento a procuram.
 */
async function levarBonificacoesAoPedido(
  tx: Prisma.TransactionClient,
  cotacaoId: number,
  fornecedorId: number,
  pedidoId: number,
) {
  await tx.bonificacao.updateMany({
    where: { cotacaoId, fornecedorId, pedidoCompraId: null },
    data: { pedidoCompraId: pedidoId },
  });
}

/** A recusa que toda edição de preço ou quantidade dá depois da compra feita. */
const COMPRA_FEITA =
  "A compra deste fornecedor já foi confirmada e virou pedido. Para mudar, cancele o pedido dele.";

/**
 * Fechar a compra de UM fornecedor, sem esperar os outros.
 *
 * É como a semana acontece: o da bebida respondeu e o preço está bom, manda
 * hoje; o do hortifrúti ainda está pensando e a conversa continua amanhã.
 * Antes disto só havia o botão que fechava tudo de uma vez, e esperar o
 * último para poder mandar o primeiro é atraso que a cotação inventou.
 *
 * O que ele leva são os preços APROVADOS dele — a fatia, quando a linha foi
 * dividida, e o item inteiro quando não foi. Os itens dos outros fornecedores
 * continuam como estavam, e a cotação segue aberta para eles.
 *
 * Fecha a cotação sozinha quando não sobra escolha sem pedido. Ninguém
 * precisa voltar para apertar "fechar": a última compra confirmada É o
 * fechamento, e uma cotação que ficasse aberta com tudo comprado apareceria
 * para sempre na lista de trabalho por fazer.
 *
 * A trava contra o clique duplo é a chave única do banco, e não uma leitura
 * antes: duas abas passariam as duas pela leitura, e a segunda esbarra na
 * `@@unique([cotacaoId, fornecedorId])` em vez de criar o pedido de novo.
 */
export async function confirmarCompraDoFornecedor(
  cotacaoId: number,
  fornecedorId: number,
): Promise<Result<{ pedidoId: number; total: number; cotacaoFechou: boolean }>> {
  await requireModule("compras");

  const cotacao = await prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    select: { id: true, estatus: true },
  });
  if (!cotacao) return { ok: false, message: "Cotação não encontrada." };
  if (cotacao.estatus === "APROVADA") {
    return { ok: false, message: "Esta cotação já foi fechada." };
  }

  const precos = await prisma.preco.findMany({
    where: {
      aprovado: true,
      estatus: "OFERTADO",
      cotacaoItem: { cotacaoId },
      cotacaoFornecedor: { fornecedorId },
    },
    include: {
      cotacaoItem: { select: { produtoId: true, quantidadeSolicitada: true } },
    },
  });

  if (precos.length === 0) {
    return {
      ok: false,
      message: "Não há nada escolhido deste fornecedor para virar pedido.",
    };
  }

  const itens = precos.map((p) => {
    // A fatia dele, ou o item inteiro. Mesma leitura de `gerarPedidosAprovados`.
    const quantidade = p.quantidadeAprovada ?? p.cotacaoItem.quantidadeSolicitada;
    return {
      produtoId: p.cotacaoItem.produtoId,
      quantidadeSolicitada: quantidade,
      precoUnitario: p.precoUnitario,
      subtotal: p.precoUnitario.times(quantidade),
      // A marca vai junto: o preço aprovado era o daquela marca, e a
      // conferência precisa saber qual foi para cobrar certo.
      marca: p.marca,
    };
  });

  const precoTotal = itens.reduce((acc, i) => acc.plus(i.subtotal), new Prisma.Decimal(0));
  /* O prazo é por resposta, não por linha: quem escreve "entrega em 2 dias"
     está falando do pedido inteiro, então o primeiro informado vale para
     todos. Sem isso a agenda de recebimentos nasceria sem previsão. */
  const prazo = precos.find((p) => p.prazoEntregaDias !== null)?.prazoEntregaDias ?? null;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const pedidoId = await gravarPedidoDaCotacao(tx, {
        cotacaoId,
        fornecedorId,
        precoTotal,
        prazo,
        itens,
      });

      /* Sobrou escolha de alguém que ainda não virou pedido?
         Contado DENTRO da transação e depois de gravar, para que a compra
         que acabou de nascer já conte como feita — lida antes, a última
         confirmação nunca fecharia a cotação.

         Cancelado fica de fora aqui também: um fornecedor cujo pedido foi
         cancelado voltou a ser escolha pendente, e a cotação não deve fechar
         por cima dele. */
      const comprados = await tx.pedidoCompra.findMany({
        where: { cotacaoId, estatus: { not: "CANCELADO" } },
        select: { fornecedorId: true },
      });
      const pendentes = await tx.preco.count({
        where: {
          aprovado: true,
          estatus: "OFERTADO",
          cotacaoItem: { cotacaoId },
          cotacaoFornecedor: {
            fornecedorId: { notIn: comprados.map((c) => c.fornecedorId) },
          },
        },
      });

      let fechou = false;
      if (pendentes === 0) {
        const trava = await tx.cotacao.updateMany({
          where: { id: cotacaoId, estatus: { not: "APROVADA" } },
          data: { estatus: "APROVADA", dataFechamento: new Date() },
        });
        fechou = trava.count > 0;
      }

      return { pedidoId, fechou };
    });

    revalidatePath("/admin/compras/cotacao", "layout");
    revalidatePath("/admin/compras/pedidos", "page");
    return {
      ok: true,
      data: {
        pedidoId: resultado.pedidoId,
        total: precoTotal.toNumber(),
        cotacaoFechou: resultado.fechou,
      },
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, message: "A compra deste fornecedor já tinha sido confirmada." };
    }
    console.error("[confirmarCompraDoFornecedor] falha:", err);
    return { ok: false, message: "Não foi possível confirmar a compra." };
  }
}

/**
 * Você escolheu quem vence — gerar os pedidos de compra.
 *
 * O atalho de quem não quer confirmar fornecedor por fornecedor: faz o que
 * `confirmarCompraDoFornecedor` faz, para todos os que faltam de uma vez.
 * Quem já foi confirmado fica de fora — passar por cima dele esbarraria na
 * chave única e derrubaria a rodada inteira por causa de um pedido que já
 * existe e está certo.
 *
 * Baseado em `Preco.aprovado`, agrupa por fornecedor e cria um PedidoCompra
 * pra cada um. Numa transação só, com a passagem para APROVADA condicionada
 * ao estado anterior: se o segundo pedido falhasse depois do primeiro ter
 * sido criado, a cotação ficava sem sair do lugar — a nova tentativa batia
 * na chave única do primeiro e caía em erro para sempre.
 */
export async function gerarPedidosAprovados(
  cotacaoId: number,
// Devolve só os ids: quem chama olha o `ok` e recarrega a tela. Mandar o
// pedido inteiro de volta era carregar dez colunas de banco para o
// navegador jogar fora.
): Promise<Result<number[]>> {
  await requireModule("compras");

  try {
    const cotacao = await prisma.cotacao.findUnique({
      where: { id: cotacaoId },
      include: {
        cotacaoItens: {
          include: {
            precos: {
              where: { aprovado: true, estatus: "OFERTADO" },
              include: { cotacaoFornecedor: true },
            },
          },
        },
      },
    });

    if (!cotacao) {
      return { ok: false, message: "Cotação não encontrada" };
    }
    if (cotacao.estatus === "APROVADA") {
      return { ok: false, message: "Os pedidos desta cotação já foram gerados" };
    }

    const porFornecedor = new Map<
      number,
      Array<{
        produtoId: number;
        precoUnitario: Prisma.Decimal;
        quantidadeSolicitada: Prisma.Decimal;
        subtotal: Prisma.Decimal;
        marca: string | null;
      }>
    >();
    /* O prazo que ele prometeu ao dar o preço, guardado por fornecedor.
       É por linha no banco e por resposta na vida: quem escreve "entrega em 2
       dias" está falando do pedido inteiro, então o primeiro informado vale
       para todos. Sem isso a agenda de recebimentos não teria de onde tirar
       uma previsão, e toda entrega nasceria sem data. */
    const prazoDe = new Map<number, number>();

    /* Quem já foi confirmado no rodapé não entra de novo.
       Sem esta peneira, o `create` dele esbarraria na
       `@@unique([cotacaoId, fornecedorId])` e a transação inteira cairia —
       derrubando junto os pedidos dos outros, que estavam certos. */
    const jaComprados = await fornecedoresJaComprados(cotacaoId);

    for (const item of cotacao.cotacaoItens) {
      for (const preco of item.precos) {
        const fornecedorId = preco.cotacaoFornecedor.fornecedorId;
        if (jaComprados.has(fornecedorId)) continue;
        if (!porFornecedor.has(fornecedorId)) porFornecedor.set(fornecedorId, []);
        if (preco.prazoEntregaDias !== null && !prazoDe.has(fornecedorId)) {
          prazoDe.set(fornecedorId, preco.prazoEntregaDias);
        }
        /* A fatia dele, ou o item inteiro.
           `quantidadeAprovada` só é diferente de nulo quando a compra foi
           dividida — e aí o subtotal guardado no `Preco` não serve: aquele é
           "quanto custaria tudo deste fornecedor", e usá-lo faria os dois
           pedidos da linha cobrarem a compra inteira cada um. */
        const quantidade = preco.quantidadeAprovada ?? item.quantidadeSolicitada;
        porFornecedor.get(fornecedorId)!.push({
          produtoId: item.produtoId,
          precoUnitario: preco.precoUnitario,
          quantidadeSolicitada: quantidade,
          subtotal: preco.precoUnitario.times(quantidade),
          // A marca vai junto: o preço aprovado era o daquela marca, e o
          // pedido precisa dizer qual foi para a conferência cobrar certo.
          marca: preco.marca,
        });
      }
    }

    if (porFornecedor.size === 0) {
      return {
        ok: false,
        message:
          jaComprados.size > 0
            ? "Todas as compras escolhidas já foram confirmadas."
            : "Escolha de quem comprar ao menos um item",
      };
    }

    const pedidos = await prisma.$transaction(async (tx) => {
      const criados: number[] = [];
      for (const [fornecedorId, itens] of porFornecedor) {
        const precoTotal = itens.reduce((acc, i) => acc.plus(i.subtotal), new Prisma.Decimal(0));
        const prazo = prazoDe.get(fornecedorId);
        criados.push(
          /* Pelo mesmo caminho da confirmação por fornecedor, e não por um
             `create` próprio: quem já teve o pedido cancelado precisa dele
             ressuscitado, senão a chave única derruba a transação inteira e
             leva junto os pedidos dos outros, que estavam certos.

             O prazo é previsão, não promessa: é o que ele mesmo deu ao
             cotar, contado da geração. Nulo quando não informou — traço na
             agenda, nunca uma data inventada. */
          await gravarPedidoDaCotacao(tx, {
            cotacaoId,
            fornecedorId,
            precoTotal,
            prazo: prazo ?? null,
            itens,
          }),
        );
      }

      // O banco decide quem gerou primeiro: dois cliques ao mesmo tempo
      // passariam os dois pela leitura lá em cima, e o segundo desfaz tudo
      // aqui em vez de duplicar pedido.
      const trava = await tx.cotacao.updateMany({
        where: { id: cotacaoId, estatus: { not: "APROVADA" } },
        data: { estatus: "APROVADA", dataFechamento: new Date() },
      });
      if (trava.count === 0) throw new Error("JA_APROVADA");

      return criados;
    });

    revalidatePath("/admin/compras/cotacao", "layout");
    return { ok: true, data: pedidos };
  } catch (err) {
    if (err instanceof Error && err.message === "JA_APROVADA") {
      return { ok: false, message: "Os pedidos desta cotação já foram gerados" };
    }
    console.error(err);
    return { ok: false, message: "Erro ao gerar pedidos" };
  }
}

// ---------------------------------------------------------------------------
// Cotação sem pontas soltas: descartar, "não vou cotar", prazo vencido
// ---------------------------------------------------------------------------

/**
 * Quando ninguém mais está com o convite em aberto (`ENVIADA`), a cotação
 * deixa de esperar e passa a ser comparação. Só a partir de RESPONDENDO: uma
 * resposta que chegue depois da aprovação não pode desfazer a aprovação.
 */
async function fecharSeNinguemFalta(tx: Prisma.TransactionClient, cotacaoId: number) {
  const faltam = await tx.cotacaoFornecedor.count({
    where: { cotacaoId, estatus: "ENVIADA" },
  });
  if (faltam === 0) {
    await tx.cotacao.updateMany({
      where: { id: cotacaoId, estatus: "RESPONDENDO" },
      data: { estatus: "FECHADA" },
    });
  }
}

/**
 * Descartar uma cotação que não vai virar compra. Só antes de gerar pedidos
 * (decisão do dono): com pedido, cancela-se o pedido pela tela de Pedidos.
 * As contagens da rodada continuam gastas — para comprar de novo, conta-se
 * de novo.
 */
export async function descartarCotacao(cotacaoId: number): Promise<Result<null>> {
  await requireModule("compras");
  try {
    const feito = await prisma.cotacao.updateMany({
      where: {
        id: cotacaoId,
        estatus: { notIn: ["APROVADA", "DESCARTADA"] },
        pedidosCompra: { none: {} },
      },
      data: { estatus: "DESCARTADA" },
    });
    if (feito.count === 0) {
      return {
        ok: false,
        message: "Esta cotação já gerou pedidos ou já estava descartada. Cancele os pedidos em Pedidos.",
      };
    }
    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: null };
  } catch (err) {
    console.error("[descartarCotacao] falha:", err);
    return { ok: false, message: "Não foi possível descartar a cotação." };
  }
}

/**
 * O fornecedor avisa pelo link que não vai cotar desta vez. Sem login: a
 * porta é o token, com as mesmas guardas de `salvarResposta`. Só convite em
 * aberto — quem já respondeu corrige a resposta, não recusa.
 */
export async function recusarCotacao(token: string): Promise<Result<null>> {
  try {
    const chamado = await prisma.cotacaoFornecedor.findUnique({
      where: { token },
      select: {
        id: true,
        estatus: true,
        cotacaoId: true,
        fornecedorId: true,
        cotacao: { select: { estatus: true, prazoResposta: true, dataInicio: true } },
      },
    });
    if (!chamado) return { ok: false, message: "Link expirado ou inválido" };
    if (chamado.cotacao.estatus === "APROVADA" || chamado.cotacao.estatus === "DESCARTADA") {
      return { ok: false, message: "Esta cotação já foi encerrada. Obrigado!" };
    }
    if (chamado.cotacao.prazoResposta && chamado.cotacao.prazoResposta.getTime() < Date.now()) {
      return { ok: false, message: "O prazo desta cotação já terminou." };
    }
    if (chamado.estatus !== "ENVIADA") {
      return { ok: false, message: "Você já respondeu esta cotação." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.cotacaoFornecedor.update({
        where: { id: chamado.id },
        data: { estatus: "RECUSADA", dataRespostaRecebida: new Date() },
      });
      await registrarAviso(tx, {
        tipo: "COTACAO_RECUSADA",
        fornecedorId: chamado.fornecedorId,
        cotacaoId: chamado.cotacaoId,
        titulo: `recusou a cotação de ${dataDaCotacao(chamado.cotacao.dataInicio)}`,
      });
      await fecharSeNinguemFalta(tx, chamado.cotacaoId);
    });

    revalidatePath(`/admin/compras/cotacao/${chamado.cotacaoId}`, "layout");
    return { ok: true, data: null };
  } catch (err) {
    console.error("[recusarCotacao] falha:", err);
    return { ok: false, message: "Não foi possível registrar. Tente de novo." };
  }
}

/**
 * Parar de esperar quem não respondeu: os convites em aberto viram
 * EXPIRADA, e a cotação passa a comparação com o que chegou.
 */
export async function encerrarRespostas(cotacaoId: number): Promise<Result<null>> {
  await requireModule("compras");
  try {
    await prisma.$transaction(async (tx) => {
      await tx.cotacaoFornecedor.updateMany({
        where: { cotacaoId, estatus: "ENVIADA" },
        data: { estatus: "EXPIRADA" },
      });
      await fecharSeNinguemFalta(tx, cotacaoId);
    });
    revalidatePath(`/admin/compras/cotacao/${cotacaoId}`, "layout");
    return { ok: true, data: null };
  } catch (err) {
    console.error("[encerrarRespostas] falha:", err);
    return { ok: false, message: "Não foi possível encerrar as respostas." };
  }
}

/**
 * Reabrir o prazo: quem não respondeu (o convite expirou, pelo prazo ou por
 * "Encerrar respostas") volta a poder responder pelo mesmo link, até daqui a
 * `horas`. Quem já respondeu ou recusou fica como está. A cotação que tinha
 * ido para a comparação volta a esperar preço.
 *
 * Não vale para cotação com pedidos gerados nem descartada: ali o link já
 * explica que acabou, e reabrir mandaria fornecedor responder para nada.
 */
export async function reabrirCotacao(cotacaoId: number, horas: HorasDePrazo): Promise<Result<{ reabertos: number }>> {
  await requireModule("compras");
  if (!horasValidas(horas)) return { ok: false, message: "Escolha um dos prazos." };
  const instante = new Date(Date.now() + horas * 60 * 60 * 1000);

  try {
    const r = await prisma.$transaction(async (tx) => {
      // A trava é a linha da cotação: gerar pedidos ao mesmo tempo não passa.
      await tx.$queryRaw`SELECT id FROM "cotacoes" WHERE id = ${cotacaoId} FOR UPDATE`;
      const cot = await tx.cotacao.findUnique({
        where: { id: cotacaoId },
        select: { estatus: true, _count: { select: { pedidosCompra: true } } },
      });
      if (!cot) throw new Error("NAO_ACHOU");
      if (cot.estatus === "APROVADA" || cot.estatus === "DESCARTADA" || cot._count.pedidosCompra > 0) {
        throw new Error("FECHADA");
      }
      const reabertos = await tx.cotacaoFornecedor.updateMany({
        where: { cotacaoId, estatus: "EXPIRADA" },
        data: { estatus: "ENVIADA" },
      });
      await tx.cotacao.update({
        where: { id: cotacaoId },
        data: {
          prazoResposta: instante,
          // Voltou a esperar quem não respondeu: sai da comparação.
          ...(reabertos.count > 0 && cot.estatus === "FECHADA" ? { estatus: "RESPONDENDO" as const } : {}),
        },
      });
      return { reabertos: reabertos.count };
    });
    revalidatePath(`/admin/compras/cotacao/${cotacaoId}`, "layout");
    revalidatePath("/admin/compras", "layout");
    limparContadores();
    return { ok: true, data: r };
  } catch (err) {
    if (err instanceof Error && err.message === "FECHADA") {
      return { ok: false, message: "Esta cotação já virou pedido ou foi descartada: não dá para reabrir." };
    }
    if (err instanceof Error && err.message === "NAO_ACHOU") return { ok: false, message: "Cotação não encontrada." };
    console.error("[reabrirCotacao] falha:", err);
    return { ok: false, message: "Não foi possível reabrir. Tente de novo." };
  }
}

/**
 * Prazo vencido: quem não respondeu não vai mais responder (`salvarResposta`
 * já recusa). Os convites em aberto viram EXPIRADA e a cotação passa a
 * comparação. Chamada ao abrir as telas da cotação — sem cron, o momento em
 * que alguém olha é o momento em que o estado precisa estar certo.
 *
 * Não é ação de servidor exportada para o navegador: quem chama é a página,
 * no servidor, e ela já passou pela guarda do módulo.
 */
export async function expirarConvitesVencidos(cotacaoId: number): Promise<void> {
  await requireModule("compras");
  // Um comando só na visita comum: o prazo vai na própria condição, e sem
  // convite vencido nada mais roda (antes era uma leitura da cotação a cada
  // abertura da tela).
  const vencidos = await prisma.cotacaoFornecedor.updateMany({
    where: { cotacaoId, estatus: "ENVIADA", cotacao: { prazoResposta: { lt: new Date() } } },
    data: { estatus: "EXPIRADA" },
  });
  if (vencidos.count > 0) await prisma.$transaction((tx) => fecharSeNinguemFalta(tx, cotacaoId));
}
