import { MolduraDeLink } from "@/components/pagina/moldura-de-link";
import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { lerEmbalagemAnterior } from "@/lib/embalagem";
import { chaveDaEspecificacao, lerEspecificacoes, lerRespostas } from "@/lib/especificacao";
import { SEM_CATEGORIA, formatDayMonthTime, jaPassou } from "@/lib/format";

import { PesquisaForm } from "./pesquisa-form";
import { PrecoForm } from "./preco-form";
import { PrazoDoLink } from "./prazo-do-link";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Cotação de preços",
  robots: { index: false, follow: false },
};

/**
 * O fornecedor digitando o preço, sem login. A porta é o token no endereço.
 *
 * Página pública: mostra só o que ele precisa para responder — os itens e as
 * quantidades. Nunca o preço de outro fornecedor, nem o estoque da casa.
 */
export default async function CotacaoFornecedorPage({
  params,
}: PageProps<"/comprador/cotacao/[token]">) {
  const { token } = await params;

  const [chamado, { capacity }, config] = await Promise.all([
    prisma.cotacaoFornecedor.findUnique({
      where: { token },
      include: {
        fornecedor: {
          select: {
            name: true,
            // As duas redes que dizem o que ele vende: a larga, por categoria,
            // e a fina, item a item. É o que separa a primeira gaveta da
            // segunda.
            products: { select: { productId: true } },
            categories: { select: { categoryId: true } },
          },
        },
        precos: true,
        // Só as pendentes voltam para a tela dele. A que o dono já respondeu
        // não é mais rascunho — reabri-la para edição faria uma decisão
        // tomada parecer aberta, e reenviar a apagaria.
        produtosNovos: { where: { status: "PENDENTE" }, orderBy: { id: "asc" } },
        cotacao: {
          include: {
            /* As perguntas da casa, com só a resposta DESTE fornecedor.
               O `where` não é economia: é o mesmo sigilo que vale para o
               preço. O que os outros responderam não passa por esta página. */
            pesquisaItens: {
              orderBy: { createdAt: "asc" },
              include: { respostas: { where: { cotacaoFornecedor: { token } } } },
            },
            cotacaoItens: {
              include: {
                produto: {
                  select: {
                    name: true,
                    unit: true,
                    // O que a casa escreveu sobre o item — "resfriado",
                    // "calibre 60". Quem dá o preço precisa saber disso, e
                    // até agora este texto não saía do painel.
                    description: true,
                    categoryId: true,
                    preferredBrands: true,
                    acceptsSimilarBrand: true,
                    especificacoes: true,
                    category: { select: { name: true, sortOrder: true } },
                  },
                },
              },
              orderBy: [{ produto: { category: { sortOrder: "asc" } } }, { produto: { name: "asc" } }],
            },
          },
        },
      },
    }),
    getSettings(),
    prisma.cotacaoSettings.findUnique({ where: { id: 1 } }),
  ]);

  // O que ele respondeu da última vez para cada produto, em outra cotação.
  // Enche o que se repete de uma semana para outra — embalagem, marca, prazo
  // — para ele só conferir e digitar o preço.
  const ultimas = chamado
    ? await ultimasRespostas(
        chamado.fornecedorId,
        chamado.cotacaoId,
        chamado.cotacao.cotacaoItens.map((i) => i.produtoId),
      )
    : new Map<number, UltimaResposta>();

  const vinculadosDireto = new Set(
    chamado?.fornecedor.products.map((p) => p.productId) ?? [],
  );
  const categoriasDele = new Set(
    chamado?.fornecedor.categories.map((c) => c.categoryId) ?? [],
  );

  // O prazo no relógio da casa. Passado, o link fecha — a página diz até
  // quando era, e `salvarResposta` recusa o envio de quem ficou com ela aberta.
  const prazo = chamado?.cotacao.prazoResposta ?? null;
  const prazoTexto = prazo ? formatDayMonthTime(prazo, capacity.timezone) : null;
  const prazoPassou = prazo !== null && jaPassou(prazo);

  // O link que não serve mais: o que houve no título, e a frase embaixo.
  const invalido: { titulo: string; frase?: string } | null = !chamado
    ? { titulo: "Este link não existe" }
    : chamado.cotacao.estatus === "APROVADA"
      ? { titulo: "Esta cotação já foi fechada", frase: "Obrigado pela resposta!" }
      : chamado.cotacao.estatus === "DESCARTADA"
        ? { titulo: "Esta cotação foi cancelada", frase: "Obrigado!" }
      : prazoPassou
        ? { titulo: `O prazo terminou ${prazoTexto}`, frase: "Se ainda quiser mandar preço, fale com a gente." }
        : null;

  const casa = `${capacity.name} · Ivoti`;

  if (invalido || !chamado) {
    return <MolduraDeLink largura="form" rotulo={casa} titulo={invalido?.titulo} subtitulo={invalido?.frase} />;
  }

  const nome = chamado.fornecedor.name;
  return (
    <MolduraDeLink
      largura="form"
      rotulo={casa}
      // Sem o "Quanto fica?": o nome já abre a página, e a pergunta
      // empurrava a lista para baixo no celular. O ponto só quando o nome
      // não termina com um ("Ltda." virava "Ltda..").
      titulo={`Olá, ${nome}${nome.trim().endsWith(".") ? "" : "."}`}
    >
      {/* O prazo fica na folha, e não no verde do alto: o quadro amarelo
          de aviso não se lê sobre o verde-escuro. */}
      {prazo && prazoTexto && (
        <PrazoDoLink prazoIso={prazo.toISOString()} texto={prazoTexto} />
      )}
      {/* Só a mensagem que a casa escreveu em Configurações. O texto
          padrão que ficava aqui explicava a tela em vez de deixar a tela
          se explicar, e empurrava a lista para baixo da primeira dobra do
          celular — o dono pediu para tirar.

          `whitespace-pre-line` porque o campo aceita e grava quebras de
          linha: sem isto o dono digita três linhas e vê um parágrafo. */}
      {config?.mensagemFornecedor?.trim() && (
        <p className="max-w-md whitespace-pre-line text-[var(--muted-foreground)]">
          {config.mensagemFornecedor}
        </p>
      )}

      {/* Recusou pelo link: a página diz, e ainda deixa responder se ele
          mudou de ideia dentro do prazo. */}
      {chamado.estatus === "RECUSADA" && (
        <p className="msg-warn">
          Você avisou que não vai cotar desta vez. Se mudou de ideia, ainda
          dá para responder abaixo.
        </p>
      )}

      <PrecoForm
        token={token}
        podeRecusar={chamado.estatus === "ENVIADA"}
        jaRespondeu={chamado.estatus === "RESPONDIDA"}
        ofertasAnteriores={chamado.produtosNovos.map((o) => ({
          nome: o.nome,
          unit: o.unit,
          emb: lerEmbalagemAnterior(o.embalagem, o.conteudo.toNumber(), o.unit),
          // O link pede o preço da unidade da casa: a embalagem ÷ o que vem nela.
          preco: emReais(o.precoEmbalagem.dividedBy(o.conteudo).toNumber()),
          marca: o.marca,
          obs: o.observacoes ?? "",
        }))}
        itens={chamado.cotacao.cotacaoItens.map((i) => {
          const anterior = chamado.precos.find((p) => p.cotacaoItemId === i.id);
          // Da semana passada, só quando ainda não respondeu esta.
          const ultima = anterior ? undefined : ultimas.get(i.produtoId);
          const especificacoes = lerEspecificacoes(i.produto.especificacoes);
          const marcas = i.produto.preferredBrands;
          // A marca de antes só se ainda serve: a lista do produto pode
          // ter mudado desde então.
          const marcaDeAntes =
            ultima?.marca &&
            (marcas.length === 0 ||
              marcas.includes(ultima.marca) ||
              i.produto.acceptsSimilarBrand)
              ? ultima.marca
              : null;
          return {
            id: i.id,
            nome: i.produto.name,
            unidade: i.produto.unit,
            detalhe: i.produto.description,
            categoria: i.produto.category?.name ?? SEM_CATEGORIA,
            quantidade: i.quantidadeSolicitada.toNumber(),
            marcas,
            aceitaSimilar: i.produto.acceptsSimilarBrand,
            especificacoes,
            /* As obrigatórias da semana passada NÃO vêm respondidas: ele
               confirma toda vez que o produto é resfriado — é para isso
               que elas existem. As de preferência, sim. */
            especificacoesAnteriores: anterior
              ? lerRespostas(anterior.especificacoes)
              : lerRespostas(ultima?.especificacoes).filter((r) =>
                  especificacoes.some(
                    (e) =>
                      !e.obrigatoria &&
                      chaveDaEspecificacao(e.texto) === chaveDaEspecificacao(r.texto),
                  ),
                ),
            // Vinculado pela rede fina ou pela larga. Decide em que
            // gaveta o item cai, e nada mais — ele pode ofertar nas duas.
            vinculado:
              vinculadosDireto.has(i.produtoId) ||
              (i.produto.categoryId !== null &&
                categoriasDele.has(i.produto.categoryId)),
            embalagemAnterior: anterior?.embalagem ?? ultima?.embalagem ?? null,
            conteudoAnterior:
              anterior?.conteudo?.toNumber() ?? ultima?.conteudo?.toNumber() ?? null,
            // O preço, só desta cotação. Um valor velho viria marcado
            // como respondido e iria no Enviar sem ele ver; o da semana
            // passada aparece como "Última vez", com um toque para usar.
            // Pela unidade da casa (o kg, a un): é o que o link pede agora.
            precoAnterior: anterior ? anterior.precoUnitario.toNumber() : null,
            prazoAnterior: anterior?.prazoEntregaDias ?? ultima?.prazoEntregaDias ?? null,
            marcaAnterior: anterior?.marca ?? marcaDeAntes,
            ultimaVez:
              ultima?.precoEmbalagem && ultima.embalagem
                ? {
                    preco: ultima.precoUnitario.toNumber(),
                    embalagem: ultima.embalagem,
                    marca: marcaDeAntes,
                  }
                : null,
            observacaoAnterior: anterior?.observacoes ?? null,
            descontoAcimaDeAnterior: anterior?.descontoAcimaDe?.toNumber() ?? null,
            descontoPrecoAnterior:
              anterior?.descontoPrecoEmbalagem && anterior.conteudo
                ? Math.round(anterior.descontoPrecoEmbalagem.dividedBy(anterior.conteudo).toNumber() * 10000) / 10000
                : null,
            recusaAnterior:
              anterior && anterior.estatus !== "OFERTADO"
                ? anterior.estatus
                : null,
          };
        })}
      />

      {/* A pesquisa depois do preço, e num formulário separado.
          O preço é o que paga a rodada: uma falha ao gravar uma
          curiosidade não pode derrubar os trinta preços que ele acabou de
          digitar. Some inteira quando a casa não perguntou nada — a
          maioria das rodadas não pergunta. */}
      {chamado.cotacao.pesquisaItens.length > 0 && (
        <PesquisaForm
          token={token}
          perguntas={chamado.cotacao.pesquisaItens.map((p) => {
            // As respostas já vêm filtradas pelo `where` da consulta: só
            // as DESTE fornecedor. O que os outros disseram não passa por
            // esta página, como nenhum preço dos outros passa.
            const minha = p.respostas[0];
            return {
              id: p.id,
              descricao: p.descricao,
              observacoes: p.observacoes,
              temAnterior: minha?.temProduto ?? null,
              precoAnterior:
                minha?.precoUnitario == null
                  ? ""
                  : String(minha.precoUnitario).replace(".", ","),
              embalagemAnterior: minha?.embalagem ?? "",
              marcaAnterior: minha?.marca ?? "",
              observacaoAnterior: minha?.observacoes ?? "",
            };
          })}
        />
      )}
    </MolduraDeLink>
  );
}

type UltimaResposta = Awaited<ReturnType<typeof ultimasRespostas>> extends Map<number, infer R>
  ? R
  : never;

/**
 * A resposta mais recente deste fornecedor para cada produto, fora desta
 * cotação. Uma consulta para a lista inteira; fica a primeira de cada produto.
 *
 * Só ofertas: "sem estoque" da semana passada não diz nada sobre esta.
 */
/** "36,50": o preço da unidade, como o campo do link mostra. */
function emReais(n: number): string {
  return String(Math.round(n * 10000) / 10000).replace(".", ",");
}

async function ultimasRespostas(fornecedorId: number, cotacaoId: number, produtoIds: number[]) {
  const precos = await prisma.preco.findMany({
    where: {
      estatus: "OFERTADO",
      cotacaoFornecedor: { fornecedorId },
      cotacaoItem: { produtoId: { in: produtoIds }, cotacaoId: { not: cotacaoId } },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      embalagem: true,
      conteudo: true,
      precoEmbalagem: true,
      precoUnitario: true,
      marca: true,
      especificacoes: true,
      prazoEntregaDias: true,
      cotacaoItem: { select: { produtoId: true } },
    },
  });
  const porProduto = new Map<number, (typeof precos)[number]>();
  for (const p of precos) {
    if (!porProduto.has(p.cotacaoItem.produtoId)) porProduto.set(p.cotacaoItem.produtoId, p);
  }
  return porProduto;
}
