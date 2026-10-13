import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";

import { Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { getSettings } from "@/lib/availability";
import { expirarConvitesVencidos } from "@/lib/actions/cotacao";
import { prisma } from "@/lib/db";
import { fornecedoresDaCotacao } from "@/lib/cotacao-fornecedores";
import { lerRespostas } from "@/lib/especificacao";
import { SEM_CATEGORIA, diaISO, formatDayMonthTime, nomeDaCotacao } from "@/lib/format";
import { valorDoPedido } from "@/lib/pedido";
import { bonificacoesDaCotacao, produtosParaBrinde } from "@/lib/bonificacoes-dados";
import { classesABC } from "@/lib/classe-abc";
import { ultimasComprasPorProduto, ultimoCustoPorProduto } from "@/lib/historico";
import { mediasPorMarca } from "@/lib/qualidade";
import { chaveDaMarca } from "@/lib/qualidade-regra";
import { orcamentoDaSemana } from "@/lib/orcamento";
import { rodadaDaCotacao } from "@/lib/rodada";
import { pareceCelular } from "@/lib/parece-celular";
import { COOKIE_VISUAL, lerVisual } from "@/lib/visual-cotacao";

import { AvisoPedidosDiretos } from "../../aviso-pedidos-diretos";
import { FluxoCompra } from "../../fluxo-compra";
import { CotacaoDetail } from "./cotacao-detail";
import { RespostasDaPesquisa } from "./respostas-pesquisa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cotação — Compras" };

/**
 * O centro da cotação: quem foi chamado, quem respondeu, e o comparativo.
 *
 * Os fornecedores candidatos vêm de duas redes, a larga e a fina: quem
 * atende alguma categoria dos itens, mais quem está vinculado item a item.
 * E quem já foi chamado nesta cotação entra mesmo que tenha sido desativado
 * depois — o preço que ele deu continua valendo para comparar.
 */
export default async function CotacaoPage({
  params,
}: PageProps<"/admin/compras/cotacao/[id]">) {
  // Fora do link de atalhos: cotar pede login (decisão do dono).
  await guardModule("compras");
  const { id } = await params;
  const cotacaoId = Number(id);
  if (!Number.isInteger(cotacaoId)) notFound();

  // Só os campos que a tela usa — antes vinham as linhas inteiras de preço,
  // pedido e oferta, e o nome do fornecedor de cada resposta de pesquisa numa
  // ida a mais, quando ele já vem nos convites.
  const lerCotacao = () => prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    select: {
      id: true,
      estatus: true,
      dataInicio: true,
      prazoResposta: true,
      cotacaoItens: {
        select: {
          id: true,
          produtoId: true,
          categoryId: true,
          quantidadeContada: true,
          quantidadeSolicitada: true,
          produto: {
            select: {
              name: true,
              unit: true,
              idealStock: true,
              lotSize: true,
              category: { select: { name: true, sortOrder: true } },
            },
          },
          precos: {
            select: {
              id: true,
              cotacaoFornecedorId: true,
              estatus: true,
              precoUnitario: true,
              subtotal: true,
              embalagem: true,
              conteudo: true,
              precoEmbalagem: true,
              descontoAcimaDe: true,
              descontoPrecoEmbalagem: true,
              especificacoes: true,
              precoNegociadoDe: true,
              prazoEntregaDias: true,
              marca: true,
              observacoes: true,
              aprovado: true,
              quantidadeAprovada: true,
            },
          },
        },
        orderBy: [{ produto: { category: { sortOrder: "asc" } } }, { produto: { name: "asc" } }],
      },
      cotacaoFornecedores: {
        select: {
          id: true,
          estatus: true,
          fornecedorId: true,
          fornecedor: { select: { name: true } },
          // O que cada um ofereceu por conta própria e ninguém respondeu.
          produtosNovos: {
            where: { status: "PENDENTE" },
            orderBy: { id: "asc" },
            select: {
              id: true,
              nome: true,
              unit: true,
              embalagem: true,
              conteudo: true,
              precoEmbalagem: true,
              marca: true,
              observacoes: true,
            },
          },
        },
      },
      /* As perguntas de curiosidade e o que cada um respondeu.
         Aqui, ao contrário da tela do fornecedor, TODAS as respostas vêm: é
         justamente pô-las lado a lado que responde "dá para comprar, e por
         quanto?". */
      pesquisaItens: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          descricao: true,
          observacoes: true,
          respostas: {
            select: {
              id: true,
              cotacaoFornecedorId: true,
              temProduto: true,
              precoUnitario: true,
              embalagem: true,
              marca: true,
              observacoes: true,
            },
          },
        },
      },
      pedidosCompra: {
        select: {
          id: true,
          fornecedorId: true,
          estatus: true,
          precoTotal: true,
          entregaConfirmada: true,
          dataEntregaPrevista: true,
          fornecedor: { select: { name: true } },
          itens: {
            select: {
              id: true,
              quantidadeSolicitada: true,
              precoUnitario: true,
              marca: true,
              quantidadeRecebida: true,
              problemaRecebimento: true,
              precoPago: true,
              produto: { select: { name: true, unit: true } },
            },
          },
        },
      },
    },
  });

  /* Tudo o que dá para pedir ao banco de uma vez, sai de uma vez — com o
     servidor longe do banco, cada volta em fila custava mais de cem
     milissegundos.

     A única fila que fica é a do prazo: quem não respondeu passa a "expirou"
     ANTES de ler a cotação e os convites, senão a tela mostraria como
     esperando quem já perdeu o prazo. O resto não depende disso. */
  const [
    { cotacao, rede, custoPorProduto, comprasPorProduto, qualidadePorMarca },
    rodada,
    jar,
    orcamento,
    cabecalhos,
    bonificacoesPorFornecedor,
    produtosDeBrinde,
    classePorProduto,
  ] = await Promise.all([
    expirarConvitesVencidos(cotacaoId)
      .then(() =>
        Promise.all([
          lerCotacao(),
          /* Quem pode vender o que esta cotação compra, e quem o cadastro tem
             e as redes não alcançaram. Vem de `lib/cotacao-fornecedores`
             porque a tela de Fornecedores faz a MESMA pergunta desde que virou
             passo próprio, e duas cópias da consulta é como as duas passam a
             discordar sobre quem está na rodada. */
          fornecedoresDaCotacao(cotacaoId),
        ]),
      )
      // O que precisa saber quais produtos a cotação tem sai logo atrás da
      // leitura dela, e não numa fila depois de tudo o mais.
      .then(async ([cotacao, rede]) => {
        const ids = cotacao ? cotacao.cotacaoItens.map((i) => i.produtoId) : [];
        const [custoPorProduto, comprasPorProduto, qualidadePorMarca] = await Promise.all([
          // A âncora contra a qual os preços cotados são lidos. Sem ela,
          // R$ 5,94 o quilo é um número solto: o que diz se é bom é o que a
          // casa pagou da última vez.
          ultimoCustoPorProduto(ids),
          // As três últimas compras de cada item, para o painel de histórico.
          ultimasComprasPorProduto(ids),
          // As estrelas de qualidade por marca, ao lado da marca de cada oferta.
          mediasPorMarca(ids),
        ]);
        return { cotacao, rede, custoPorProduto, comprasPorProduto, qualidadePorMarca };
      }),
    // De que contagens esta cotação nasceu, e quanto daquela semana já saiu
    // por pedido direto. É o que faz a trilha lá em cima ter o passo dos
    // diretos aceso em vez de apagado.
    rodadaDaCotacao(cotacaoId),
    cookies(),
    getSettings().then((s) => orcamentoDaSemana(s.capacity.timezone)),
    headers(),
    // As bonificações combinadas nesta rodada, por fornecedor, e os produtos
    // que podem vir de brinde: não dependem de nada acima.
    bonificacoesDaCotacao(cotacaoId),
    produtosParaBrinde(),
    // Quanto cada item pesa no bolso: o alerta de preço só fala dos A e B.
    classesABC(),
  ]);
  if (!cotacao) notFound();
  // O fuso da casa, para o prazo: as configurações já vieram (cache).
  const timezoneDaCasa = (await getSettings()).capacity.timezone;
  const fornecedorDoConvite = new Map(cotacao.cotacaoFornecedores.map((f) => [f.id, f]));
  const escolhidosPorFornecedor = new Map<number, { id: number; nome: string; unidade: (typeof cotacao.cotacaoItens)[number]["produto"]["unit"] }[]>();
  for (const i of cotacao.cotacaoItens) {
    for (const p of i.precos) {
      if (!p.aprovado) continue;
      const f = fornecedorDoConvite.get(p.cotacaoFornecedorId);
      if (!f) continue;
      const lista = escolhidosPorFornecedor.get(f.fornecedorId) ?? [];
      lista.push({ id: i.produtoId, nome: i.produto.name, unidade: i.produto.unit });
      escolhidosPorFornecedor.set(f.fornecedorId, lista);
    }
  }
  const pedidoDoFornecedor = new Map(
    cotacao.pedidosCompra.filter((p) => p.estatus !== "CANCELADO").map((p) => [p.fornecedorId, p]),
  );
  const fornecedoresComBonificacao = cotacao.cotacaoFornecedores
    .filter((f) => escolhidosPorFornecedor.has(f.fornecedorId) || bonificacoesPorFornecedor.has(f.fornecedorId))
    .map((f) => {
      const pedido = pedidoDoFornecedor.get(f.fornecedorId);
      return {
        id: f.fornecedorId,
        nome: f.fornecedor.name,
        produtos: (escolhidosPorFornecedor.get(f.fornecedorId) ?? []).map((p) => ({ ...p, lote: null, doFornecedor: true })),
        lista: bonificacoesPorFornecedor.get(f.fornecedorId) ?? [],
        // Trava quando o pedido já chegou; sem pedido, quando a rodada fechou.
        editavel: pedido ? !pedido.entregaConfirmada : cotacao.estatus !== "APROVADA",
      };
    });


  /* Lista ou mapa, lido no SERVIDOR.
     Do navegador, a primeira pintura viria no modo errado e trocaria na cara
     da pessoa — e ler num efeito custaria uma violação de
     `set-state-in-effect`, que este projeto não acrescenta. */
  const visualInicial = lerVisual(jar.get(COOKIE_VISUAL)?.value);
  /* Celular ou computador, pelo que o navegador diz de si. É só um palpite
     para a primeira pintura — a tela confere a largura de verdade assim que
     abre —, mas é o que deixa o celular não montar o mapa: a tabela de
     fornecedor × item, escondida lá, custava a maior parte da página. */
  const celular = pareceCelular(cabecalhos);
  // O nome de quem respondeu cada pergunta vem dos convites já lidos.
  const nomeDoConvite = new Map(cotacao.cotacaoFornecedores.map((f) => [f.id, f.fornecedor.name]));

  return (
    <Pagina largura="larga">
      {/* Sempre "cotacao": chamar fornecedor virou página própria, e esta
          aqui é só a comparação.

          `cotacaoId` também faz o passo anterior apontar para `?cotacao=13`,
          que relê os números guardados em `CotacaoItem` em vez de recalcular
          `ideal − contado`. */}
      <CotacaoDetail
        // A trilha das etapas vem logo abaixo do título (que fica na faixa verde do alto).
        depoisDoTitulo={
          <>
            <FluxoCompra
              etapa="cotacao"
              cotacaoId={cotacao.id}
              contagemIds={rodada.contagemIds}
              pedidosDiretos={rodada.pedidosDiretos}
            />
            <AvisoPedidosDiretos quantos={rodada.pedidosDiretos} contagemIds={rodada.contagemIds} />
          </>
        }
        cotacao={{
          id: cotacao.id,
          estatus: cotacao.estatus,
          dataInicio: cotacao.dataInicio.toISOString(),
          nome: nomeDaCotacao(cotacao.dataInicio, timezoneDaCasa),
          temPedido: cotacao.pedidosCompra.length > 0,
          convitesEmAberto: cotacao.cotacaoFornecedores.filter((f) => f.estatus === "ENVIADA").length,
          convitesExpirados: cotacao.cotacaoFornecedores.filter((f) => f.estatus === "EXPIRADA").length,
          prazoTexto: cotacao.prazoResposta ? formatDayMonthTime(cotacao.prazoResposta, timezoneDaCasa) : null,
        }}
        itens={cotacao.cotacaoItens.map((i) => ({
          id: i.id,
          produtoId: i.produtoId,
          categoryId: i.categoryId,
          idealStock: i.produto.idealStock?.toNumber() ?? null,
          lote: i.produto.lotSize?.toNumber() ?? null,
          nome: i.produto.name,
          unidade: i.produto.unit,
          categoria: i.produto.category?.name ?? SEM_CATEGORIA,
          quantidadeContada: i.quantidadeContada.toNumber(),
          quantidadeSolicitada: i.quantidadeSolicitada.toNumber(),
          semFornecedor:
            !rede.produtosVinculados.has(i.produtoId) &&
            (i.categoryId === null || !rede.categoriasAtendidas.has(i.categoryId)),
          ultimaCompra: custoPorProduto.get(i.produtoId) ?? null,
          classe: classePorProduto.get(i.produtoId) ?? null,
          historico: comprasPorProduto.get(i.produtoId) ?? [],
          precos: i.precos.map((p) => ({
            id: p.id,
            cotacaoFornecedorId: p.cotacaoFornecedorId,
            estatus: p.estatus,
            precoUnitario: p.precoUnitario.toNumber(),
            subtotal: p.subtotal.toNumber(),
            embalagem: p.embalagem,
            conteudo: p.conteudo?.toNumber() ?? null,
            precoEmbalagem: p.precoEmbalagem?.toNumber() ?? null,
            descontoAcimaDe: p.descontoAcimaDe?.toNumber() ?? null,
            descontoPrecoEmbalagem: p.descontoPrecoEmbalagem?.toNumber() ?? null,
            especificacoes: lerRespostas(p.especificacoes),
            precoNegociadoDe: p.precoNegociadoDe?.toNumber() ?? null,
            prazoEntregaDias: p.prazoEntregaDias,
            marca: p.marca,
            qualidade: qualidadePorMarca.get(`${i.produtoId}|${chaveDaMarca(p.marca)}`) ?? null,
            observacoes: p.observacoes,
            aprovado: p.aprovado,
            quantidadeAprovada: p.quantidadeAprovada?.toNumber() ?? null,
          })),
        }))}
        /* `pedidoId` já vem preenchido de lá: a existência do `PedidoCompra`
           É a resposta para "a compra dele já foi confirmada?", e uma coluna
           a mais no banco seria um segundo lugar onde a mesma verdade poderia
           ficar desatualizada. */
        fornecedores={rede.fornecedores}
        categorias={rede.categorias}
        categoriasDaCotacao={rede.categoriasDaCotacao}
        foraDaLista={rede.foraDaLista}
        visualInicial={visualInicial}
        telaGrandeNoServidor={!celular}
        orcamento={orcamento}
        ofertas={cotacao.cotacaoFornecedores.flatMap((f) =>
          f.produtosNovos.map((o) => ({
            id: o.id,
            fornecedor: f.fornecedor.name,
            nome: o.nome,
            unit: o.unit,
            embalagem: o.embalagem,
            conteudo: o.conteudo.toNumber(),
            precoEmbalagem: o.precoEmbalagem.toNumber(),
            marca: o.marca,
            observacoes: o.observacoes,
          })),
        )}
        bonificacoes={{ fornecedores: fornecedoresComBonificacao, todosOsProdutos: produtosDeBrinde }}
        pedidos={cotacao.pedidosCompra.map((p) => ({
          id: p.id,
          fornecedor: p.fornecedor.name,
          estatus: p.estatus,
          total: p.precoTotal.toNumber(),
          entregaConfirmada: p.entregaConfirmada,
          entregaPrevista:
            p.dataEntregaPrevista === null ? null : diaISO(p.dataEntregaPrevista),
          itens: p.itens.map((i) => ({
            id: i.id,
            nome: i.produto.name,
            unidade: i.produto.unit,
            quantidade: i.quantidadeSolicitada.toNumber(),
            precoUnitario: i.precoUnitario?.toNumber() ?? null,
            marca: i.marca,
            recebida: i.quantidadeRecebida?.toNumber() ?? null,

            problema: i.problemaRecebimento,

            precoPago: i.precoPago?.toNumber() ?? null,
          })),
        })).map((p) => ({ ...p, total: valorDoPedido(p) }))}
      />

      <RespostasDaPesquisa
        perguntas={cotacao.pesquisaItens.map((p) => ({
          id: p.id,
          descricao: p.descricao,
          observacoes: p.observacoes,
          respostas: p.respostas.map((r) => ({
            id: r.id,
            fornecedor: nomeDoConvite.get(r.cotacaoFornecedorId) ?? "—",
            tem: r.temProduto,
            preco: r.precoUnitario?.toNumber() ?? null,
            embalagem: r.embalagem,
            marca: r.marca,
            observacoes: r.observacoes,
          })),
          // Chamados menos quem respondeu ESTA pergunta. Quem respondeu a de
          // cima e não esta continua calado sobre esta.
          calados: cotacao.cotacaoFornecedores.length - p.respostas.length,
        }))}
      />
    </Pagina>
  );
}
