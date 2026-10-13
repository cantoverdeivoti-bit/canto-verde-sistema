import Link from "next/link";

import { MolduraDeLink } from "@/components/pagina/moldura-de-link";
import { prisma } from "@/lib/db";
import { can, getCurrentUser } from "@/lib/permissions";
import { getSettings } from "@/lib/availability";
import { SEM_CATEGORIA, UNIT_LABEL, ehHoje, formatDayMonthTime, plural } from "@/lib/format";

import { ContagemForm } from "./contagem-form";
import { PrazoDaContagem } from "./prazo-da-contagem";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Contagem de estoque",
  // O link é a credencial: uma contagem indexada é a despensa aberta a quem
  // achar a página. A tela irmã do fornecedor já se protege assim.
  robots: { index: false, follow: false },
};

/**
 * A página do estoquista. Sem login: o link é a credencial.
 *
 * Mesmo desenho da página do fornecedor — quem abre não é da casa, não tem
 * senha, e está com o celular na mão no meio do corredor. Aqui isso é mais
 * verdade ainda: ele conta andando, uma prateleira por vez.
 */
export default async function ContagemPublicaPage({
  params,
}: PageProps<"/estoquista/contagem/[token]">) {
  const { token } = await params;

  const [contagem, categorias, catalogo, { capacity }] = await Promise.all([
    prisma.contagem.findUnique({
      where: { token },
      select: {
        concluida: true,
        expiresAt: true,
        canceladaEm: true,
        recado: true,
        responsavel: { select: { name: true, username: true } },
        listaCompra: {
          select: {
            nome: true,
            // O ideal do dia de cada produto: aparece ao lado do que ele conta.
            itens: { select: { produtoId: true, idealStock: true } },
            // O pedido de hoje da rotina (o que esta contagem criou, ou aquele
            // em que ela juntou itens), para a tela de "finalizada" levar a ele.
            pedidos: {
              where: { estatus: { not: "CANCELADO" } },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, createdAt: true, estatus: true, _count: { select: { itens: true } } },
            },
          },
        },
        listaCompraId: true,
        itens: {
          select: {
            produtoId: true,
            quantidadeContada: true,
            produto: {
              select: {
                name: true,
                code: true,
                unit: true,
                description: true,
                categoryId: true,
                lotSize: true,
                category: { select: { name: true, sortOrder: true } },
              },
            },
          },
        },
        // O que ele já lançou como produto novo nesta volta.
        produtosNovos: {
          where: { status: "PENDENTE" },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            nome: true,
            unit: true,
            quantidade: true,
            category: { select: { name: true } },
          },
        },
      },
    }),
    // Todas as gavetas, e não só as desta contagem: ele pode ter achado o item
    // em qualquer prateleira, inclusive numa que não está sendo contada.
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    // O catálogo inteiro, para a busca saber a diferença entre "não existe" e
    // "existe, só não está nesta contagem".
    //
    // Os desativados entram, e são o caso que mais importa: `abrirContagem` só
    // recolhe produto ativo, então tudo que foi desativado é invisível para
    // ele — e um item desativado que voltou para a prateleira é exatamente o
    // que ele vai lançar como novo.
    prisma.product.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isActive: true,
        category: { select: { name: true } },
      },
    }),
    getSettings(),
  ]);

  const casa = `${capacity.name} · Ivoti`;

  if (!contagem) {
    return (
      <MolduraDeLink largura="estreita" rotulo={casa} titulo="Link não encontrado">
        <Aviso>Confira o endereço com quem mandou. Cada contagem tem o seu.</Aviso>
      </MolduraDeLink>
    );
  }

  if (contagem.concluida) {
    return (
      <MolduraDeLink largura="estreita" rotulo={casa} titulo="Contagem finalizada">
        <Aviso>
          Esta contagem já foi fechada e o estoque foi atualizado. Obrigado!
          {contagem.listaCompraId !== null && <PedidoDaRotina contagem={contagem} hoje={capacity.timezone} />}
          {contagem.listaCompraId === null && contagem.recado && <p className="mt-2 font-semibold">{contagem.recado}</p>}
        </Aviso>
      </MolduraDeLink>
    );
  }

  // Cancelada pelo dono: fecha de vez. Vencida: o próprio estoquista reabre,
  // escolhendo até quando — o que ele já contou continua lá.
  if (contagem.canceladaEm) {
    return (
      <MolduraDeLink largura="estreita" rotulo={casa} titulo="Esta contagem foi cancelada">
        <Aviso>Peça um link novo para quem cuida das compras.</Aviso>
      </MolduraDeLink>
    );
  }
  if (contagem.expiresAt < new Date()) {
    return (
      <MolduraDeLink largura="estreita" rotulo={casa} titulo="O prazo deste link venceu">
        <Aviso>
          <p className="mb-3">O que você digitou está guardado. Escolha até quando vai a contagem para continuar.</p>
          <PrazoDaContagem
            token={token}
            fimIso={contagem.expiresAt.toISOString()}
            fimTexto={formatDayMonthTime(contagem.expiresAt, capacity.timezone)}
            vencida
          />
        </Aviso>
      </MolduraDeLink>
    );
  }

  // Na ordem em que a despensa é percorrida: a categoria manda, e o nome
  // desempata. É a mesma ordem da lista de compras — quem conta anda pelo
  // mesmo caminho de quem guarda.
  const naContagem = new Set(contagem.itens.map((i) => i.produtoId));
  const itens = [...contagem.itens].sort((a, b) => {
    const ca = a.produto.category;
    const cb = b.produto.category;
    const oa = ca?.sortOrder ?? 9999;
    const ob = cb?.sortOrder ?? 9999;
    if (oa !== ob) return oa - ob;
    const na = ca?.name ?? "";
    const nb = cb?.name ?? "";
    if (na !== nb) return na.localeCompare(nb, "pt-BR");
    return a.produto.name.localeCompare(b.produto.name, "pt-BR");
  });

  const idealDaRotina = new Map(
    (contagem.listaCompra?.itens ?? []).map((i) => [i.produtoId, i.idealStock.toNumber()]),
  );

  // As Requisições ativas de cada produto, com o ideal de hoje: o estoquista
  // pode sugerir outro, e o dono decide em Pendências.
  const naRequisicao = await prisma.listaCompraItem.findMany({
    where: { produtoId: { in: itens.map((i) => i.produtoId) }, lista: { ativa: true } },
    select: {
      produtoId: true,
      idealStock: true,
      lista: { select: { id: true, nome: true, diaSemana: true } },
    },
    orderBy: { lista: { diaSemana: "asc" } },
  });
  const requisicoesDo = new Map<number, { listaId: number; nome: string; ideal: number | null }[]>();
  for (const r of naRequisicao) {
    const lista = requisicoesDo.get(r.produtoId) ?? [];
    lista.push({
      listaId: r.lista.id,
      nome: r.lista.nome,
      ideal: r.idealStock.toNumber(),
    });
    requisicoesDo.set(r.produtoId, lista);
  }

  return (
    <MolduraDeLink
      largura="estreita"
      rotulo={casa}
      titulo={contagem.listaCompra ? `Compra de rotina ${contagem.listaCompra.nome}` : "Contagem de estoque"}
      subtitulo={
        // Quanto tempo ainda dá, até quando e de quem é: as três perguntas de
        // quem abre o link, no verde do alto como nas outras telas.
        <>
          <PrazoDaContagem
            token={token}
            fimIso={contagem.expiresAt.toISOString()}
            fimTexto={formatDayMonthTime(contagem.expiresAt, capacity.timezone)}
          />
          {contagem.responsavel && <p>com {contagem.responsavel.name ?? contagem.responsavel.username}</p>}
        </>
      }
    >
      {/* A abertura saiu, a pedido do dono.
          Eram duas frases de instrução em cima de toda tela, todo dia, para
          quem faz a mesma contagem toda semana — e o que elas ensinavam já
          aparece onde é preciso: o "em branco não vira zero" volta na hora de
          finalizar, com os números de verdade dentro, e a oferta de lançar
          produto novo aparece sozinha quando a busca não acha nada. */}

      <ContagemForm
        token={token}
        gavetasAbertas={contagem.listaCompraId !== null}
        categorias={categorias}
        // Nome, gaveta e se está ligado. O id vai só no desativado: é o único
        // que ele pode mexer daqui ("Reativar e contar"). O ativo fora da
        // contagem continua sem id — não há o que fazer com ele por esta página.
        // Só o que está FORA desta contagem: a busca no catálogo só aparece
        // quando o termo não bate com nenhum item da lista, então mandar os
        // da contagem de novo era carga dobrada para o celular.
        catalogo={catalogo
          .filter((p) => !naContagem.has(p.id))
          .map((p) => ({
          id: p.isActive ? null : p.id,
          nome: p.name,
          categoria: p.category?.name ?? SEM_CATEGORIA,
          ativo: p.isActive,
        }))}
        novosIniciais={contagem.produtosNovos.map((p) => ({
          id: p.id,
          nome: p.nome,
          unit: p.unit,
          categoria: p.category?.name ?? null,
          quantidade: p.quantidade.toNumber(),
        }))}
        itens={itens.map((i) => ({
          produtoId: i.produtoId,
          nome: i.produto.name,
          codigo: i.produto.code,
          unidade: UNIT_LABEL[i.produto.unit],
          // A unidade e a gaveta cruas, ao lado do rótulo: o formulário de
          // correção nasce preenchido com o cadastro, e para isso precisa do
          // valor que o banco guarda, não do que a tela mostra.
          unit: i.produto.unit,
          categoriaId: i.produto.categoryId,
          detalhe: i.produto.description,
          // O mesmo termo que a busca de Produtos indexa de propósito: é o
          // que a pessoa digita quando quer achar o que ficou sem gaveta.
          categoria: i.produto.category?.name ?? SEM_CATEGORIA,
          // O lote de compra (fardo de 12, caixa de 24): é a embalagem em que
          // o produto chega, e o estoquista pode contar por ela.
          lote: i.produto.lotSize !== null && i.produto.lotSize.toNumber() > 1 ? i.produto.lotSize.toNumber() : null,
          requisicoes: requisicoesDo.get(i.produtoId) ?? [],
          // Na compra de rotina, o ideal do dia ao lado de cada produto.
          ideal: idealDaRotina.get(i.produtoId) ?? null,
          contado:
            i.quantidadeContada === null
              ? ""
              : String(i.quantidadeContada).replace(".", ","),
        }))}
      />
    </MolduraDeLink>
  );
}

/** O recado das telas de fim (finalizada, cancelada, vencida), num cartão branco. */
function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-[var(--muted-foreground)]">
      {children}
    </div>
  );
}

/**
 * O fim da contagem da compra de rotina: o recado do que aconteceu com o
 * pedido e, quando há pedido de hoje, quem fica com ele. Mandar ao fornecedor
 * é de quem compra (configura Compras, decisão do dono): para ele o botão
 * abre o pedido para mandar; o estoquista fica sabendo que o comprador foi
 * avisado e, logado, pode abrir para ver.
 */
async function PedidoDaRotina({
  contagem,
  hoje,
}: {
  contagem: {
    recado: string | null;
    listaCompra: { pedidos: { id: number; createdAt: Date; estatus: string; _count: { itens: number } }[] } | null;
  };
  hoje: string;
}) {
  const pedido = contagem.listaCompra?.pedidos[0];
  const deHoje = pedido && ehHoje(pedido.createdAt, hoje) ? pedido : null;
  const entra = await getCurrentUser();
  const compra = can(entra, "compras", { configure: true });
  const esperando = deHoje && (deHoje.estatus === "CRIADO" || deHoje.estatus === "AGUARDANDO_FORNECEDOR");
  return (
    <div className="mt-4 space-y-3">
      {contagem.recado && <p className="text-sm font-semibold">{contagem.recado}</p>}
      {esperando && !compra && (
        <p className="text-sm">
          O pedido #{deHoje.id} está pronto. Quem compra foi avisado e vai revisar e mandar ao fornecedor.
        </p>
      )}
      {deHoje && entra && (
        <Link
          href={`/admin/compras/pedidos/${deHoje.id}`}
          className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-[var(--botao)] px-4 text-sm font-semibold text-[var(--botao-texto)] hover:opacity-90"
        >
          {esperando && compra ? `Ver e mandar o pedido #${deHoje.id}` : `Ver o pedido #${deHoje.id}`}
          <span className="font-normal opacity-80">· {plural(deHoje._count.itens, "item", "itens")}</span>
        </Link>
      )}
    </div>
  );
}
