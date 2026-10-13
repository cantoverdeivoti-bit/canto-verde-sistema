import Link from "next/link";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { formatDayMonthTime, nomeDaCotacao, plural } from "@/lib/format";
import { orcamentoDaSemana } from "@/lib/orcamento";
import { chaveDaRodada, pedidosDiretosDe, rodadaDaCotacao } from "@/lib/rodada";
import { linhasDaCotacao, linhasParaRevisar } from "@/lib/sugestao";

import { FluxoCompra } from "../fluxo-compra";
import { Acrescentar } from "./acrescentar";
import { Pesquisa } from "./pesquisa";
import { RevisarLista } from "./revisar-lista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lista de itens para compra — Compras" };

/** O que veio no `?c=` — "20,22" vira [20, 22]. Lixo some em silêncio. */
function idsDaQuery(c: string | string[] | undefined): number[] {
  const bruto = Array.isArray(c) ? c.join(",") : (c ?? "");
  return [
    ...new Set(
      bruto
        .split(",")
        .map((p) => Number(p.trim()))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
}

/**
 * A passada de olho entre contar e cotar.
 *
 * A conta da sugestão é `estoque ideal − o que foi contado`, e depois o lote
 * de compra. O lote resolve o que vem em fardo: a água nunca pede 13. Mas ele
 * é opcional e a maioria dos produtos não tem — então o orégano que ficou cem
 * gramas abaixo do ideal continua entrando pedindo cem gramas, e ninguém
 * compra cem gramas de orégano. É por isso que esta tela existe: sem ela, o
 * fornecedor recebia uma linha que nunca viraria compra.
 *
 * Tela própria, e não mais uma gaveta no cartão da contagem: são dezenas de
 * linhas com uma decisão em cada, e o cartão já carrega prazo, contados,
 * categorias, responsável, produtos novos e os pedidos diretos.
 *
 * O endereço é `/conferir?c=20,22`, e não mais `/contagem/20/revisar`: a
 * seleção é de VÁRIAS contagens. Quem conta a despensa em duas voltas —
 * bebidas na segunda, secos na quarta — junta as duas numa rodada de compra
 * só. No sistema anterior isso obrigava a duas cotações ao mesmo fornecedor na
 * mesma semana, e foi a dor que o dono pediu para resolver.
 */
export default async function ConferirPage({
  searchParams,
}: PageProps<"/admin/compras/conferir">) {
  // Fora do link de atalhos: cotar pede login (decisão do dono).
  await guardModule("compras");
  const { c, cotacao } = await searchParams;

  /* `?cotacao=13` abre a MESMA tela para corrigir uma compra já montada.
     A conferência é de mão única — ela calcula `ideal − contado` na hora —,
     mas o que ela decide não precisa ser definitivo: quem montou com 216 de
     água e percebeu depois que queria 120 ficava sem saída, e a única à mão
     era apagar a cotação e recomeçar a semana.

     Duas telas fariam duas validações de lote, dois ✕ e dois painéis de
     corrigir cadastro, e a segunda envelheceria. O que muda entre os dois
     modos é de onde vêm as linhas e o que o botão faz. */
  const daCotacao = Number(Array.isArray(cotacao) ? cotacao[0] : cotacao);
  if (Number.isInteger(daCotacao) && daCotacao > 0) {
    return <Editar cotacaoId={daCotacao} />;
  }

  const ids = idsDaQuery(c);

  if (ids.length === 0) return <Recado texto="Nenhuma contagem escolhida." />;

  const contagens = await prisma.contagem.findMany({
    where: { id: { in: ids } },
    orderBy: { dataContagem: "desc" },
    select: {
      id: true,
      concluida: true,
      cotacaoId: true,
      pedidosCompraDiretos: { select: { id: true } },
      processadaEm: true,
    },
  });

  if (contagens.length !== ids.length) {
    return <Recado texto="Alguma das contagens escolhidas não existe mais." />;
  }

  // Ainda contando não é "não existe". Ele vai guardar este endereço, e um 404
  // para "cedo demais" seria mentira — a contagem está lá, só não terminou.
  if (contagens.some((c) => !c.concluida)) {
    return (
      <Recado texto="Alguma das contagens escolhidas ainda está aberta. A lista de compra só existe depois que o estoquista finalizar — antes disso, o que falta ainda pode mudar a cada prateleira que ele percorre." />
    );
  }

  /* Já processada: manda para o que existe, e não mostra esta tela em modo
     leitura. Recalcular a sugestão hoje daria os números de HOJE, com o
     estoque ideal que possa ter mudado desde então, e a tela pareceria o
     registro do que foi pedido sendo outra coisa. O registro é a cotação. */
  // Pedido direto já existente NÃO gasta a rodada: pode ser o de um
  // fornecedor confirmado um a um aqui mesmo, e o resto continua para conferir.
  const gasta = contagens.find((c) => c.processadaEm !== null || c.cotacaoId !== null);
  if (gasta) {
    return (
      <Recado
        texto="Alguma das contagens escolhidas já virou compra."
        /* Sem cotação, a rodada virou pedido direto — e ficava sem saída:
           o recado dizia "já virou compra" e não dizia onde ela está. */
        link={{
          href:
            gasta.cotacaoId !== null
              ? `/admin/compras/enviar?cotacao=${gasta.cotacaoId}`
              : `/admin/compras/enviar?c=${ids.join(",")}`,
          texto: "Abrir o envio desta rodada",
        }}
      />
    );
  }

  // As duas listas dos seletores do painel de correção. Pequenas ao lado das
  // linhas, e carregadas junto para não custar uma ida a mais.
  const [
    { linhas, semIdeal, menosDeMeioLote, repetidos, pelasRequisicoes },
    categorias,
    fornecedores,
    diretosDaRodada,
    confirmados,
    rascunho,
    { capacity, orcamento },
  ] = await Promise.all([
    linhasParaRevisar(ids),
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    pedidosDiretosDe(ids),
    // Os pedidos diretos já confirmados, fornecedor a fornecedor, nesta rodada.
    prisma.pedidoCompra.findMany({
      where: { contagemId: { in: ids }, cotacaoId: null, estatus: { not: "CANCELADO" } },
      select: { id: true, fornecedorId: true, fornecedor: { select: { compraNoAtacado: true } } },
    }),
    // O que foi salvo desta conferência (o "Salvar" de cada fornecedor).
    prisma.rascunhoConferencia.findUnique({
      where: { chave: chaveDaRodada(ids) },
      select: { quantidades: true, fora: true, updatedAt: true },
    }),
    // O orçamento da semana: pedido na primeira compra dela, só mostrado nas outras.
    getSettings().then(async ({ capacity }) => ({ capacity, orcamento: await orcamentoDaSemana(capacity.timezone) })),
  ]);

  return (
    <Pagina largura="larga">
      {/* Sem parágrafo de explicação aqui.
          Ele contava o que é a sugestão para quem via a tela pela primeira
          vez, e ocupava três linhas no alto de toda visita depois disso. Quem
          usa a tela toda semana já sabe. */}
      <CabecalhoDaPagina
        titulo="Lista de itens para compra"
        // Só quando são várias: com uma contagem só, dizer "1 contagem" é
        // ruído sobre uma coisa que ele acabou de escolher.
        subtitulo={
          ids.length > 1 ? (
            <>
              Juntando {plural(ids.length, "contagem", "contagens")} numa rodada
              de compra só.
            </>
          ) : undefined
        }
      />
      <FluxoCompra
        etapa="itens"
        contagemIds={ids}
        pedidosDiretos={diretosDaRodada}
      />

      <RevisarLista
        contagemIds={ids}
        orcamentoSemana={orcamento}
        linhas={linhas}
        semIdeal={semIdeal}
        menosDeMeioLote={menosDeMeioLote}
        repetidos={repetidos}
        pelasRequisicoes={pelasRequisicoes}
        categorias={categorias}
        fornecedores={fornecedores}
        confirmados={confirmados.map((c) => ({
          id: c.id,
          fornecedorId: c.fornecedorId,
          atacado: c.fornecedor.compraNoAtacado,
        }))}
        rascunho={
          rascunho
            ? {
                quantidades: (rascunho.quantidades ?? {}) as Record<string, string>,
                fora: rascunho.fora,
                salvoEmTexto: formatDayMonthTime(rascunho.updatedAt, capacity.timezone),
              }
            : undefined
        }
      />
    </Pagina>
  );
}

/**
 * A conferência de uma cotação que já existe.
 *
 * Mesma lista, mesmo ✕, mesmo painel de corrigir cadastro — o que muda é que
 * as linhas são LIDAS da cotação em vez de calculadas, e o botão salva em vez
 * de criar. Recalcular aqui seria o erro: os números daquele dia estão
 * guardados em `CotacaoItem`, e refazer a conta hoje daria os de hoje.
 *
 * Depois que vira pedido, não. Aí o fornecedor já viu aqueles números, e
 * corrigi-los por aqui seria mudar por baixo uma conta que já saiu de casa.
 */
async function Editar({ cotacaoId }: { cotacaoId: number }) {
  const [cotacao, { capacity }] = await Promise.all([
    prisma.cotacao.findUnique({
      where: { id: cotacaoId },
      select: {
        id: true,
        dataInicio: true,
        pedidosCompra: { select: { id: true } },
        _count: { select: { cotacaoFornecedores: true } },
      },
    }),
    getSettings(),
  ]);

  if (!cotacao) return <Recado texto="Cotação não encontrada." />;
  const nome = nomeDaCotacao(cotacao.dataInicio, capacity.timezone);

  /* Basta UM pedido para esta tela fechar, e não a cotação inteira ter sido
     confirmada. A compra agora fecha fornecedor por fornecedor, e mexer na
     lista de itens com metade dela já mandada mudaria o que sobrou por baixo
     de uma conta que já foi fechada. */
  if (cotacao.pedidosCompra.length > 0) {
    return (
      <Recado
        texto={
          cotacao.pedidosCompra.length === 1
            ? "Parte desta cotação já virou pedido. Os números que foram para o fornecedor não mudam mais — para mexer neles, cancele o pedido dele."
            : `${cotacao.pedidosCompra.length} compras desta cotação já viraram pedido. Os números que foram para os fornecedores não mudam mais — para mexer neles, cancele o pedido.`
        }
        link={{
          href: `/admin/compras/cotacao/${cotacaoId}`,
          texto: `Abrir a ${nome}`,
        }}
      />
    );
  }

  const [linhas, categorias, fornecedores, produtos, pesquisaBruta, rodada] = await Promise.all([
    linhasDaCotacao(cotacaoId),
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    /* Os candidatos a acrescentar: ativos e sem dono exclusivo.
       O exclusivo fica de fora porque pula a cotação por desenho — a sugestão
       dele vira pedido direto —, e oferecê-lo aqui seria oferecer uma linha
       que nenhum dos fornecedores chamados sabe responder. A ação recusa de
       novo, mas recusar é pior que não oferecer.

       Os que já estão na cotação saem no filtro logo abaixo, e não por um
       `notIn` na consulta: os ids já estão em `linhas`, e pedir ao banco para
       descontá-los custaria um segundo caminho para a mesma verdade. */
    prisma.product.findMany({
      where: { isActive: true, exclusiveSupplierId: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        unit: true,
        currentStock: true,
        lotSize: true,
        category: { select: { name: true } },
      },
    }),
    // As perguntas de curiosidade, com quantos já responderam cada uma.
    prisma.pesquisaPreco.findMany({
      where: { cotacaoId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        descricao: true,
        observacoes: true,
        _count: { select: { respostas: true } },
      },
    }),
    rodadaDaCotacao(cotacaoId),
  ]);

  const pesquisa = pesquisaBruta.map((p) => ({
    id: p.id,
    descricao: p.descricao,
    observacoes: p.observacoes,
    respostas: p._count.respostas,
  }));

  const jaNaCompra = new Set(linhas.map((l) => l.produtoId));
  const candidatos = produtos
    .filter((p) => !jaNaCompra.has(p.id))
    .map((p) => ({
      id: p.id,
      nome: p.name,
      unidade: p.unit,
      categoria: p.category?.name ?? null,
      estoque: p.currentStock.toNumber(),
      lote: p.lotSize === null ? null : p.lotSize.toNumber(),
    }));

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina titulo={<>Lista de itens da {nome}</>} />
      <FluxoCompra
        etapa="itens"
        cotacaoId={cotacaoId}
        contagemIds={rodada.contagemIds}
        pedidosDiretos={rodada.pedidosDiretos}
      />

      {/* Que o preço já dado vai junto, dito antes de ele mexer.
          Mudar a quantidade refaz o total de quem já respondeu, pelo preço
          unitário que ele deu — e isso muda quem é o mais barato. Descobrir
          depois seria pior. */}
      {cotacao._count.cotacaoFornecedores > 0 && (
        <p className="hint">
          {plural(
            cotacao._count.cotacaoFornecedores,
            "fornecedor já foi chamado",
            "fornecedores já foram chamados",
          )}
          . Mudar a quantidade refaz os totais deles pelo preço que cada um
          deu — o preço por unidade continua o mesmo.
        </p>
      )}

      {/* Acima da lista, e não no rodapé junto do salvar: acrescentar é uma
          decisão sobre o QUE comprar, como o ✕ de cada linha, e o rodapé é
          onde a tela termina. */}
      <Acrescentar cotacaoId={cotacaoId} candidatos={candidatos} />

      <RevisarLista
        cotacaoId={cotacaoId}
        contagemIds={[]}
        linhas={linhas}
        semIdeal={0}
        menosDeMeioLote={0}
        repetidos={[]}
        categorias={categorias}
        fornecedores={fornecedores}
      />

      <Pesquisa cotacaoId={cotacaoId} itens={pesquisa} />
    </Pagina>
  );
}

/**
 * Os quatro becos sem saída desta tela, com o caminho de volta.
 *
 * Todos dizem a mesma coisa de fundo — a seleção que veio no endereço não dá
 * uma lista de compra — e todos terminam no mesmo lugar, que é a tela de onde
 * ele escolheu. Repetir o `Voltar` quatro vezes só multiplicaria as chances de
 * um deles ficar para trás numa mudança.
 */
function Recado({
  texto,
  link,
}: {
  texto: string;
  link?: { href: string; texto: string };
}) {
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Lista de itens para compra" subtitulo={texto} />
      <p className="flex flex-wrap gap-x-4">
        {link && (
          <Link
            href={link.href}
            className="text-sm text-[var(--primary)] underline-offset-4 hover:underline"
          >
            {link.texto}
          </Link>
        )}
        <Link
          href="/admin/compras/contagem"
          className="text-sm text-[var(--primary)] underline-offset-4 hover:underline"
        >
          Voltar para Contar estoque
        </Link>
      </p>
    </Pagina>
  );
}
