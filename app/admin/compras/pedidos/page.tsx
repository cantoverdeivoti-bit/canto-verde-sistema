import Link from "next/link";

import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { getSettings } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { can } from "@/lib/roles";
import { prisma } from "@/lib/db";
import { formatDiaNumerico, formatMoney, nomeDaCotacao, plural } from "@/lib/format";
import { contagensDaRodada } from "@/lib/rodada";

import { linhasDePedidos } from "./linhas-de-pedidos";
import { PedidoLinha } from "./pedido-linha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos — Compras" };

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
 * Tudo que a casa pediu, e o link de quem ainda não respondeu.
 *
 * Esta tela nasce de um buraco: `montarCotacao` gera um `token` para o
 * fornecedor exclusivo confirmar o preço pelo link, grava esse token no
 * banco, devolve para quem chamou — e quem chamou descartava. A página
 * `/comprador/pedido/<token>` existia, funcionava, e não havia como chegar
 * até ela por nenhuma tela do painel. O pedido direto sumia para Recebimentos
 * e o fornecedor nunca via o que tinha sido pedido.
 *
 * Mostra TODOS os pedidos, e não só os diretos. Uma aba chamada "Pedidos" que
 * escondesse metade deles seria uma aba que mente pelo nome — e a pergunta
 * "o que eu pedi esta semana" não separa por origem.
 *
 * Não é Recebimentos, e a diferença não é de gosto: aqui a pergunta é "o que
 * eu pedi, e quem ainda não respondeu"; lá é "o que chegou". Recebimentos é a
 * única porta que dá entrada no estoque, e continua sendo — entrada de
 * estoque não tem desfazer, e duas portas para ela é como um pedido acaba
 * conferido duas vezes.
 *
 * Agrupado por rodada, da mais nova para a mais velha, porque é assim que a
 * semana de compra acontece: uma contagem vira uma cotação mais alguns
 * pedidos diretos, e eles se leem juntos.
 */
/** Quantos encerrados a lista mostra: os mais recentes. O resto está em Relatórios → Pedidos. */
const ENCERRADOS_NA_TELA = 50;

export default async function PedidosPage({
  searchParams,
}: PageProps<"/admin/compras/pedidos">) {
  const user = await guardModule("compras");
  const podeComprar = can(user, "compras", { configure: true });

  const { c, cotacao } = await searchParams;
  const daRodada = await contagensDaRodada(idsDaQuery(c));
  /* `?cotacao=12` é como a tela do comparativo aponta para cá: fechou a
     compra de um fornecedor, o botão "Enviar pedidos" traz para esta lista
     já recortada na rodada de preços que acabou de virar compra. */
  const daCotacao = idsDaQuery(cotacao)[0] ?? null;

  const recorte =
    daCotacao !== null
      ? { cotacaoId: daCotacao }
      : daRodada.length > 0
        ? { contagemId: { in: daRodada } }
        : {};
  // Os abertos vêm todos; os encerrados (recebidos ou cancelados), só os
  // mais recentes — antes vinha o histórico inteiro a cada visita.
  const [abertos0, encerrados0, { capacity }, cotacaoDoRecorte] = await Promise.all([
    linhasDePedidos({ ...recorte, entregaConfirmada: false, estatus: { not: "CANCELADO" } }),
    linhasDePedidos({ ...recorte, OR: [{ entregaConfirmada: true }, { estatus: "CANCELADO" }] }, ENCERRADOS_NA_TELA),
    getSettings(),
    daCotacao === null
      ? null
      : prisma.cotacao.findUnique({ where: { id: daCotacao }, select: { dataInicio: true } }),
  ]);
  const linhas = [...abertos0, ...encerrados0];

  const timezone = capacity.timezone;

  /* Encerrado é quem já não pede nada de ninguém: chegou, ou foi cancelado.
     Fica recolhido — a tela existe para o que está de pé, e uma lista de
     trinta pedidos entregues empurraria os cinco que importam para fora da
     primeira tela. */
  const encerrado = (p: (typeof linhas)[number]) =>
    p.entregaConfirmada || p.estatus === "CANCELADO";
  const abertos = linhas.filter((p) => !encerrado(p));
  const encerrados = linhas.filter(encerrado);

  /* Por origem, e são TRÊS, não duas.
     A contagem quando ele nasceu de uma, a cotação quando saiu da aprovação
     de preços sem passar por contagem, e avulso quando não tem nem uma nem
     outra. Agrupar só por contagem jogava o pedido de cotação no grupo
     "Avulsos", e isso não é detalhe: avulso quer dizer "pedi de cabeça, fora
     da rodada", e um pedido que saiu de uma comparação de preços é o oposto
     disso. */
  const rodadas = new Map<string, { titulo: string; pedidos: typeof abertos }>();
  for (const p of abertos) {
    const [chave, titulo] =
      p.contagemId !== null
        ? [
            `c${p.contagemId}`,
            `${p.lista === null ? "Contagem" : `Compra de rotina ${p.lista} · contagem`} de ${
              p.contadoEm === null ? "—" : formatDiaNumerico(p.contadoEm, timezone)
            }`,
          ]
        : p.cotacaoId !== null
          ? [`q${p.cotacaoId}`, p.cotacaoNome ?? "Cotação"]
          : p.listaCompraId !== null
            ? [`r${p.listaCompraId}`, `Compra de rotina ${p.lista ?? ""}`.trim()]
            : ["avulsos", "Avulsos"];
    const grupo = rodadas.get(chave);
    if (grupo) grupo.pedidos.push(p);
    else rodadas.set(chave, { titulo, pedidos: [p] });
  }

  /* A chave do React é a da contagem, e NÃO o título.
     Duas contagens do mesmo dia — que é exatamente o caso que esta tela
     precisa saber mostrar, já que juntar duas voltas pela despensa é o
     normal — dão títulos idênticos, e o React reclama de chave repetida e
     pode omitir ou duplicar um grupo inteiro. */
  const grupos = [...rodadas].map(([chave, r]) => ({ chave, ...r }));

  const recortada = daCotacao !== null || daRodada.length > 0;

  return (
    <Pagina>
      {/* Sem parágrafo de explicação: quem usa a tela toda semana já sabe o
          que ela é. Fica o recorte, quando há, e o atalho para Recebimentos. */}
      <CabecalhoDaPagina
        titulo="Pedidos"
        subtitulo={
          recortada ? (
            <>
              {daCotacao !== null
                ? cotacaoDoRecorte
                  ? `da ${nomeDaCotacao(cotacaoDoRecorte.dataInicio, timezone)}`
                  : "da cotação"
                : `desta rodada`}
              {" · "}
              <Link
                href="/admin/compras/pedidos"
                className="text-[var(--primary)] underline-offset-4 hover:underline"
              >
                ver todos
              </Link>
            </>
          ) : undefined
        }
        acoes={
          <Link
            href="/admin/compras/recebimentos"
            className="text-sm text-[var(--primary)] underline-offset-4 hover:underline"
          >
            Receber pedidos →
          </Link>
        }
      />

      {abertos.length === 0 ? (
        <Vazio>
          Nenhum pedido em aberto. Eles nascem quando você monta a compra na{" "}
          <Link
            href="/admin/compras/contagem"
            className="text-[var(--primary)] underline-offset-4 hover:underline"
          >
            Contar estoque
          </Link>
          , ou no{" "}
          <Link
            href="/admin/compras/pedido-manual"
            className="text-[var(--primary)] underline-offset-4 hover:underline"
          >
            Pedido manual
          </Link>
          , para comprar fora da contagem.
        </Vazio>
      ) : (
        grupos.map((r) => (
          <section key={r.chave}>
            <h2 className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
              <span className="font-semibold first-letter:uppercase">{r.titulo}</span>
              <span className="text-[var(--muted-foreground)]">
                {plural(r.pedidos.length, "pedido", "pedidos")}
                {/* Só com preço: "R$ 0,00" de uma rodada esperando os
                    fornecedores diria "de graça". */}
                {r.pedidos.some((p) => p.total > 0) && (
                  <>
                    {" · "}
                    <span className="tabular-nums">
                      {formatMoney(r.pedidos.reduce((soma, p) => soma + p.total, 0))}
                    </span>
                  </>
                )}
              </span>
            </h2>
            <ul className="mt-2 space-y-2">
              {r.pedidos.map((p) => (
                <PedidoLinha key={p.id} pedido={p} podeComprar={podeComprar} />
              ))}
            </ul>
          </section>
        ))
      )}

      {encerrados.length > 0 && (
        <details>
          <summary className="cursor-pointer">
            <span className="section-label">
              Encerrados · {encerrados.length}
            </span>
          </summary>
          <ul className="mt-3 space-y-2">
            {encerrados.map((p) => (
              <PedidoLinha key={p.id} pedido={p} podeComprar={podeComprar} />
            ))}
          </ul>
        </details>
      )}
    </Pagina>
  );
}
