import { ClipboardList, History } from "lucide-react";
import Link from "next/link";

import { CartaoDeSecao } from "@/components/pagina";
import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { UNIT_LABEL, formatAmount, formatDiaNumerico, nomeDaCotacao, plural } from "@/lib/format";
import { atalhosDePeriodo } from "@/lib/periodo";
import { periodoDaPagina } from "@/lib/periodo-da-pagina";
import { instantesDoPeriodo } from "@/lib/relatorios-compras";

import { BuscaDeProduto } from "../busca-de-produto";
import { COLUNAS_NA_BORDA } from "../pecas";
import { FiltroDePeriodo } from "../periodo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contagens — Relatórios" };

function texto(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

/**
 * O estoque ao longo do tempo, pelo que o sistema registra: as contagens e o
 * que chegou entre elas.
 *
 * Não existe tabela de movimento — o estoque é um número só, reescrito a cada
 * contagem e a cada recebimento. O histórico se remonta a partir dos dois:
 * sem produto escolhido, as contagens do período e no que cada uma virou; com
 * um produto, a linha do tempo dele, e quanto SAIU entre uma contagem e a
 * seguinte (contado antes + recebido no meio − contado agora).
 */
export default async function HistoricoDeEstoquePage({
  searchParams,
}: PageProps<"/admin/compras/relatorios/estoque">) {
  await guardModule("compras");
  const { capacity } = await getSettings();
  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  const q = await searchParams;
  const produtoId = Number(texto(q.produto)) || null;
  // Vindo do ícone de histórico da lista de produtos, sem período escolhido:
  // 90 dias, porque o mês corrente mostra duas contagens e não conta história.
  const noventa = atalhosDePeriodo(hoje).find((a) => a.chave === "90")!;
  const { de, ate } = periodoDaPagina(
    "/admin/compras/relatorios/estoque",
    q,
    hoje,
    produtoId !== null ? { de: noventa.de, ate: noventa.ate } : undefined,
  );
  const { inicio, fim } = instantesDoPeriodo(de, ate, tz);

  const contados = await prisma.product.findMany({
    where: { contagensItens: { some: { quantidadeContada: { not: null } } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true, currentStock: true, idealStock: true },
  });
  const produto = produtoId === null ? null : (contados.find((p) => p.id === produtoId) ?? null);

  const busca = (
    <BuscaDeProduto
      produtos={contados.map((p) => ({ id: p.id, nome: p.name }))}
      caminho="/admin/compras/relatorios/estoque"
      de={de}
      ate={ate}
      // Curto: com a lupa no campo, o texto maior saía cortado no celular.
      placeholder="Ver o estoque de um produto"
    />
  );

  if (produto) {
    const unidade = UNIT_LABEL[produto.unit];
    const [contagens, recebidos] = await Promise.all([
      prisma.contagemItem.findMany({
        where: {
          produtoId: produto.id,
          quantidadeContada: { not: null },
          contagem: { concluida: true, dataContagem: { gte: inicio, lt: fim } },
        },
        select: { quantidadeContada: true, contagem: { select: { id: true, dataContagem: true } } },
      }),
      prisma.pedidoCompraItem.findMany({
        where: {
          produtoId: produto.id,
          quantidadeRecebida: { gt: 0 },
          pedidoCompra: { entregaConfirmada: true, estatus: { not: "CANCELADO" }, dataEntregaReal: { gte: inicio, lt: fim } },
        },
        select: {
          quantidadeRecebida: true,
          pedidoCompra: {
            select: { id: true, dataEntregaReal: true, fornecedor: { select: { name: true, apelido: true } } },
          },
        },
      }),
    ]);

    type Evento =
      | { tipo: "contagem"; data: Date; quantidade: number; contagemId: number; saiu: number | null }
      | { tipo: "recebido"; data: Date; quantidade: number; pedidoId: number; fornecedor: string };
    const eventos: Evento[] = [
      ...contagens.map((c) => ({
        tipo: "contagem" as const,
        data: c.contagem.dataContagem,
        quantidade: c.quantidadeContada!.toNumber(),
        contagemId: c.contagem.id,
        saiu: null,
      })),
      ...recebidos.map((r) => ({
        tipo: "recebido" as const,
        data: r.pedidoCompra.dataEntregaReal!,
        quantidade: r.quantidadeRecebida!.toNumber(),
        pedidoId: r.pedidoCompra.id,
        fornecedor: r.pedidoCompra.fornecedor.apelido ?? r.pedidoCompra.fornecedor.name,
      })),
    ].sort((a, b) => a.data.getTime() - b.data.getTime());

    // O que saiu entre duas contagens: o contado antes, mais o que chegou no
    // meio, menos o contado agora. Negativo quer dizer que a conta não fecha
    // (recebimento não conferido, contagem errada) — mostra assim mesmo.
    let anterior: number | null = null;
    let chegou = 0;
    for (const e of eventos) {
      if (e.tipo === "recebido") {
        chegou += e.quantidade;
        continue;
      }
      if (anterior !== null) e.saiu = Math.round((anterior + chegou - e.quantidade) * 1000) / 1000;
      anterior = e.quantidade;
      chegou = 0;
    }

    return (
      <div className="space-y-5">
        <Link
          href={`/admin/compras/relatorios/estoque?de=${de}&ate=${ate}`}
          className="text-sm text-[var(--primary)] underline-offset-4 hover:underline"
        >
          ← Contagens do período
        </Link>
        <FiltroDePeriodo
          caminho="/admin/compras/relatorios/estoque"
          de={de}
          ate={ate}
          hoje={hoje}
          extras={{ produto: String(produto.id) }}
          busca={busca}
        />
        {/* O nome do produto vai na frase do cartão: é dele o movimento todo. */}
        <CartaoDeSecao icone={History} titulo="Movimento do produto" frase={produto.name}>
          <p className="text-sm text-[var(--muted-foreground)]">
            Estoque agora: <strong>{formatAmount(produto.currentStock.toNumber())} {unidade}</strong>
            {produto.idealStock !== null && (
              <> · ideal {formatAmount(produto.idealStock.toNumber())} {unidade}</>
            )}
          </p>
          {eventos.length === 0 ? (
            <p className="msg-warn">Nenhuma contagem nem recebimento deste produto no período.</p>
          ) : (
            // Quatro colunas curtas, mas no celular estreito ainda estouravam a
            // tela: a rolagem para o lado fica na tabela, não na página. De
            // ponta a ponta do cartão, com um fio em cima, como a Lista.
            <div className={`-mx-4 -mb-4 overflow-x-auto border-t border-[var(--border)] ${COLUNAS_NA_BORDA}`}>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-2 py-1.5 sm:px-3 font-medium">Data</th>
                    <th className="px-2 py-1.5 sm:px-3 font-medium">O quê</th>
                    <th className="px-2 py-1.5 sm:px-3 text-right font-medium">Qtd.</th>
                    <th className="px-2 py-1.5 sm:px-3 text-right font-medium" title="Quanto saiu desde a contagem anterior">
                      Saiu
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {[...eventos].reverse().map((e, i) => (
                    <tr key={i}>
                      {/* Curta — "qua., 23 set." — para a tabela caber no
                          celular; o dia da semana ajuda a ver a rotina. */}
                      <td className="px-2 py-1.5 sm:px-3 whitespace-nowrap">
                        {e.data.toLocaleDateString("pt-BR", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          timeZone: tz,
                        })}
                      </td>
                      <td className="px-2 py-1.5 sm:px-3">
                        {e.tipo === "contagem" ? (
                          "Contado"
                        ) : (
                          <Link
                            href={`/admin/compras/pedidos/${e.pedidoId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            Recebido
                            <span className="block text-xs text-[var(--muted-foreground)]">
                              {e.fornecedor} · #{e.pedidoId}
                            </span>
                          </Link>
                        )}
                      </td>
                      <td className="num-display px-2 py-1.5 sm:px-3 text-right whitespace-nowrap">
                        {e.tipo === "recebido" ? "+" : ""}
                        {formatAmount(e.quantidade)} {unidade}
                      </td>
                      <td className="num-display px-2 py-1.5 sm:px-3 text-right whitespace-nowrap">
                        {e.tipo === "contagem" && e.saiu !== null ? `${formatAmount(e.saiu)} ${unidade}` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CartaoDeSecao>
      </div>
    );
  }

  const contagens = await prisma.contagem.findMany({
    where: { concluida: true, dataContagem: { gte: inicio, lt: fim } },
    orderBy: { dataContagem: "desc" },
    select: {
      id: true,
      dataContagem: true,
      cotacaoId: true,
      cotacao: { select: { dataInicio: true } },
      responsavel: { select: { name: true, username: true } },
      listaCompra: { select: { nome: true } },
      _count: { select: { itens: true, pedidosCompraDiretos: true } },
      itens: { where: { quantidadeContada: { not: null } }, select: { id: true } },
    },
  });

  return (
    <div className="space-y-5">
      <FiltroDePeriodo caminho="/admin/compras/relatorios/estoque" de={de} ate={ate} hoje={hoje} busca={busca} />
      <CartaoDeSecao
        icone={ClipboardList}
        titulo="Contagens finalizadas"
        frase={contagens.length > 0 ? `${plural(contagens.length, "contagem", "contagens")} no período.` : undefined}
      >
        {contagens.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Nenhuma contagem finalizada no período.</p>
        ) : (
          // A lista ocupa o cartão de ponta a ponta, como a Lista das outras telas.
          <ul className="-mx-4 -my-4 divide-y divide-[var(--border)]">
            {contagens.map((c) => {
              const virou =
                c.cotacao && c.cotacaoId !== null
                  ? { texto: nomeDaCotacao(c.cotacao.dataInicio, tz), href: `/admin/compras/cotacao/${c.cotacaoId}` }
                  : c._count.pedidosCompraDiretos > 0
                    ? {
                        texto: plural(c._count.pedidosCompraDiretos, "pedido", "pedidos"),
                        href: `/admin/compras/pedidos?c=${c.id}`,
                      }
                    : null;
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="font-medium">
                      {formatDiaNumerico(c.dataContagem, tz)}
                      {c.listaCompra && (
                        <span className="font-normal text-[var(--muted-foreground)]"> · Compra de rotina {c.listaCompra.nome}</span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {c.itens.length} de {plural(c._count.itens, "item contado", "itens contados")}
                      {c.responsavel && ` · ${c.responsavel.name ?? c.responsavel.username}`}
                    </p>
                  </div>
                  {virou ? (
                    <Link href={virou.href} className="selo text-[var(--primary)] underline-offset-4 hover:underline">
                      {virou.texto}
                    </Link>
                  ) : (
                    <span className="selo text-[var(--muted-foreground)]">não virou compra</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CartaoDeSecao>
    </div>
  );
}
