import { CheckCheck, Scale, ShoppingCart, Truck } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { expirarConvitesVencidos } from "@/lib/actions/cotacao";
import { guardModule } from "@/lib/auth-guard";
import { getSettings } from "@/lib/availability";
import { fornecedoresDaCotacao } from "@/lib/cotacao-fornecedores";
import { COTACAO_LABEL, corDoTom, respostasLabel } from "@/lib/cotacao-labels";
import { prisma } from "@/lib/db";
import { formatDayMonthTime, nomeDaCotacao, plural } from "@/lib/format";
import { contagensDaRodada, idsDaQuery, rodadaDaCotacao } from "@/lib/rodada";

import { ListaFornecedores } from "../cotacao/[id]/fornecedores/lista-fornecedores";
import { PrazoResposta } from "../cotacao/[id]/fornecedores/prazo-resposta";
import { FluxoCompra } from "../fluxo-compra";
import { linhasDePedidos, type LinhaDePedido } from "../pedidos/linhas-de-pedidos";
import { PedidoLinha } from "../pedidos/pedido-linha";
import { UmPorUm } from "./um-por-um";

export const dynamic = "force-dynamic";
export const metadata = { title: "Enviar — Compras" };

/**
 * O terceiro passo da compra: tudo o que sai da casa numa rodada, na ordem
 * de mandar.
 *
 * 1. Os pedidos dos fornecedores exclusivos — já nasceram na conferência, e
 *    cada um tem o WhatsApp com o link de preço.
 * 2. A compra no atacado — não há a quem mandar; é a lista que se leva.
 * 3. A cotação — o link para os fornecedores da categoria darem preço.
 * 4. Os pedidos da cotação — nascem depois de comparar os preços, e voltam
 *    para cá: um lugar só para o que sai da casa naquela rodada.
 *
 * Juntou o que eram duas telas, "Chamar fornecedores" e "Enviar pedidos",
 * que o dono via como uma coisa só: depois de conferir a lista, mandar.
 *
 * A rodada vem de `?cotacao=` ou de `?c=` (as contagens). Sem cotação ainda,
 * a página mostra os exclusivos confirmados e diz que o convite nasce ao
 * concluir a conferência.
 */
export default async function EnviarPage({ searchParams }: PageProps<"/admin/compras/enviar">) {
  // Mandar ao fornecedor é de quem compra (configura Compras), não do estoquista.
  await guardModule("compras", { configure: true });

  const { c, cotacao } = await searchParams;
  let cotacaoId: number | null = idsDaQuery(cotacao)[0] ?? null;
  let contagemIds: number[];
  if (cotacaoId !== null) {
    contagemIds = (await rodadaDaCotacao(cotacaoId)).contagemIds;
  } else {
    contagemIds = await contagensDaRodada(idsDaQuery(c));
    if (contagemIds.length > 0) {
      const comCotacao = await prisma.contagem.findFirst({
        where: { id: { in: contagemIds }, cotacaoId: { not: null } },
        select: { cotacaoId: true },
      });
      cotacaoId = comCotacao?.cotacaoId ?? null;
    }
  }

  if (cotacaoId === null && contagemIds.length === 0) {
    return (
      <Pagina>
        <CabecalhoDaPagina
          titulo="Enviar"
          subtitulo="Escolha uma contagem e confira a lista de compra: é de lá que esta página nasce."
        />
        <FluxoCompra etapa="enviar" />
        <Button asChild>
          <Link href="/admin/compras/contagem">Ir para as contagens</Link>
        </Button>
      </Pagina>
    );
  }

  // Prazo vencido: quem não respondeu passa a "link venceu", antes de ler.
  if (cotacaoId !== null) await expirarConvitesVencidos(cotacaoId);

  const naoCancelado = { estatus: { not: "CANCELADO" as const } };
  const [diretos, daCotacao, cot, rede, contagens, { capacity }] = await Promise.all([
    contagemIds.length > 0
      ? linhasDePedidos({ ...naoCancelado, contagemId: { in: contagemIds }, cotacaoId: null })
      : Promise.resolve([] as LinhaDePedido[]),
    cotacaoId !== null ? linhasDePedidos({ ...naoCancelado, cotacaoId }) : Promise.resolve([] as LinhaDePedido[]),
    cotacaoId !== null
      ? prisma.cotacao.findUnique({
          where: { id: cotacaoId },
          select: {
            id: true,
            estatus: true,
            dataInicio: true,
            prazoResposta: true,
            cotacaoItens: {
              select: { produtoId: true, categoryId: true, produto: { select: { name: true } } },
              orderBy: { produto: { name: "asc" } },
            },
          },
        })
      : Promise.resolve(null),
    cotacaoId !== null ? fornecedoresDaCotacao(cotacaoId) : Promise.resolve(null),
    prisma.contagem.findMany({
      where: { id: { in: contagemIds } },
      select: { processadaEm: true, cotacaoId: true },
    }),
    getSettings(),
  ]);

  // A conferência ainda não terminou: só os exclusivos confirmados um a um
  // existem; o resto (e a cotação) nasce ao concluir.
  const conferenciaAberta =
    contagens.length > 0 && contagens.every((x) => x.processadaEm === null && x.cotacaoId === null);

  const exclusivos = diretos.filter((p) => !p.atacado);
  const atacado = diretos.filter((p) => p.atacado);

  // As partes que aparecem, numeradas na ordem de mandar.
  const ordem = [
    exclusivos.length > 0 && "exclusivos",
    atacado.length > 0 && "atacado",
    "cotacao",
    cot !== null && "daCotacao",
  ].filter(Boolean);
  const numero = (parte: string) => ordem.indexOf(parte) + 1;

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Enviar"
        subtitulo="Primeiro os pedidos dos exclusivos, depois a cotação. Os pedidos da cotação voltam para cá depois de comparar os preços."
      />
      <FluxoCompra
        etapa="enviar"
        cotacaoId={cotacaoId}
        contagemIds={contagemIds}
        pedidosDiretos={diretos.length}
      />

      <UmPorUm pedidos={[...exclusivos, ...daCotacao]} />

      {conferenciaAberta && (
        <div className="msg-warn max-w-2xl">
          A conferência desta rodada ainda não foi concluída: aqui estão só os pedidos que você já
          confirmou. O resto — e o link da cotação — nasce quando você concluir.{" "}
          <Link
            href={`/admin/compras/conferir?c=${contagemIds.join(",")}`}
            className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline"
          >
            Voltar à conferência
          </Link>
        </div>
      )}

      <div className="space-y-8">
        {exclusivos.length > 0 && (
          <Parte
            numero={numero("exclusivos")}
            icone={<Truck aria-hidden className="size-6 shrink-0" />}
            titulo="Pedidos dos exclusivos"
            dica="Mande cada um pelo WhatsApp: o fornecedor recebe o link e digita o preço."
            quantos={plural(exclusivos.length, "pedido", "pedidos")}
          >
            <ul className="space-y-3">
              {exclusivos.map((p) => (
                <PedidoLinha key={p.id} pedido={p} />
              ))}
            </ul>
          </Parte>
        )}

        {atacado.length > 0 && (
          <Parte
            numero={numero("atacado")}
            icone={<ShoppingCart aria-hidden className="size-6 shrink-0" />}
            titulo="Compra no atacado"
            dica="Não há a quem mandar: abra a lista de compra para levar à loja."
            quantos={plural(atacado.length, "lista", "listas")}
          >
            <ul className="space-y-3">
              {atacado.map((p) => (
                <PedidoLinha key={p.id} pedido={p} />
              ))}
            </ul>
          </Parte>
        )}

        <Parte
          numero={numero("cotacao")}
          icone={<Scale aria-hidden className="size-6 shrink-0" />}
          titulo="Cotação"
          dica="Mande o link para os fornecedores da categoria darem preço."
          quantos={cot ? plural(cot.cotacaoItens.length, "item", "itens") : null}
        >
          {cot && rede ? (
            <Convite cot={cot} rede={rede} timezone={capacity.timezone} />
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              {conferenciaAberta
                ? "A cotação nasce quando você concluir a conferência."
                : "Esta rodada não teve o que cotar — tudo foi para os exclusivos."}
            </p>
          )}
        </Parte>

        {cot && (
          <div id="da-cotacao" className="scroll-mt-4">
            <Parte
              numero={numero("daCotacao")}
              icone={<CheckCheck aria-hidden className="size-6 shrink-0" />}
              titulo="Pedidos da cotação"
              dica="Os vencedores de cada item, depois de comparar os preços."
              quantos={daCotacao.length > 0 ? plural(daCotacao.length, "pedido", "pedidos") : null}
            >
              {daCotacao.length > 0 ? (
                <ul className="space-y-3">
                  {daCotacao.map((p) => (
                    <PedidoLinha key={p.id} pedido={p} />
                  ))}
                </ul>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Aparecem aqui quando você fechar a compra no comparativo.
                  </p>
                  <Button asChild size="sm" className="gap-1.5">
                    <Link href={`/admin/compras/cotacao/${cot.id}`}>Comparar preços</Link>
                  </Button>
                </div>
              )}
            </Parte>
          </div>
        )}
      </div>
    </Pagina>
  );
}

/** Uma parte da página: a faixa vinho numerada, como as da conferência, e o conteúdo. */
function Parte({
  numero,
  icone,
  titulo,
  dica,
  quantos,
  children,
}: {
  numero: number;
  icone: React.ReactNode;
  titulo: string;
  dica: string;
  quantos: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="max-w-3xl space-y-3">
      <div className="flex items-center gap-3 rounded-xl bg-[var(--botao)] px-4 py-3 text-[var(--botao-texto)]">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--botao-texto)] text-sm font-bold text-[var(--botao)]">
          {numero}
        </span>
        {/* No celular só o número: com o ícone junto, o título quebra em três linhas. */}
        <span className="hidden sm:inline-flex">{icone}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold leading-tight">{titulo}</h2>
          <p className="text-xs opacity-85">{dica}</p>
        </div>
        {quantos && (
          <span className="shrink-0 rounded-full bg-[var(--botao-texto)] px-2.5 py-0.5 text-sm font-semibold text-[var(--botao)]">
            {quantos}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/** O convite da cotação: prazo, item sem quem venda, e a lista de fornecedores. */
function Convite({
  cot,
  rede,
  timezone,
}: {
  cot: {
    id: number;
    estatus: keyof typeof COTACAO_LABEL;
    dataInicio: Date;
    prazoResposta: Date | null;
    cotacaoItens: { produtoId: number; categoryId: number | null; produto: { name: string } }[];
  };
  rede: Awaited<ReturnType<typeof fornecedoresDaCotacao>>;
  timezone: string;
}) {
  const prazoTexto = cot.prazoResposta ? formatDayMonthTime(cot.prazoResposta, timezone) : null;
  // Descartada também: não se chama mais ninguém.
  const fechada = cot.estatus === "APROVADA" || cot.estatus === "DESCARTADA";
  const rotulo = COTACAO_LABEL[cot.estatus];
  const chamados = rede.fornecedores.filter((f) => f.chamado !== null);
  const respondidos = chamados.filter((f) => f.chamado?.estatus === "RESPONDIDA").length;
  // Item que ninguém alcança nunca receberá preço: dito antes de os links irem.
  const orfaos = cot.cotacaoItens.filter(
    (i) =>
      !rede.produtosVinculados.has(i.produtoId) &&
      (i.categoryId === null || !rede.categoriasAtendidas.has(i.categoryId)),
  );

  return (
    /* Ver `data-secao` em `globals.css`: o relevo dos botões da cotação. */
    <div data-secao="cotacao">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-semibold">{nomeDaCotacao(cot.dataInicio, timezone)}</p>
        <span className="selo" style={{ color: corDoTom(rotulo.tom) }}>
          {rotulo.texto}
        </span>
        {chamados.length > 0 && (
          <span className="text-sm text-[var(--muted-foreground)]">
            {respostasLabel(respondidos, chamados.length)}
          </span>
        )}
        <Link
          href={`/admin/compras/cotacao/${cot.id}`}
          className="ml-auto text-sm text-[var(--primary)] underline-offset-4 hover:underline"
        >
          Comparar preços →
        </Link>
      </div>

      <PrazoResposta cotacaoId={cot.id} fechada={fechada} texto={prazoTexto} />

      {orfaos.length > 0 && !fechada && (
        <div className="msg-warn mt-3 max-w-2xl">
          <p className="font-semibold">
            {orfaos.length === 1
              ? "1 item não tem fornecedor que o venda"
              : `${orfaos.length} itens não têm fornecedor que os venda`}
          </p>
          <p className="mt-1">
            {orfaos.map((i) => i.produto.name).join(", ")}. Cadastre quem vende, vincule alguém que
            já existe, ou marque a categoria no cadastro dele.
          </p>
        </div>
      )}

      <ListaFornecedores
        cotacaoId={cot.id}
        fechada={fechada}
        fornecedores={rede.fornecedores}
        categorias={rede.categorias}
        categoriasDaCotacao={rede.categoriasDaCotacao}
        foraDaLista={rede.foraDaLista}
        prazoTexto={prazoTexto}
        totalItens={cot.cotacaoItens.length}
      />
    </div>
  );
}
