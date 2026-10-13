import { ListChecks, Scale } from "lucide-react";
import Link from "next/link";

import { CartaoDeSecao } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { COTACAO_LABEL, corDoTom, respostasLabel } from "@/lib/cotacao-labels";
import { prisma } from "@/lib/db";
import { formatMoney, nomeDaCotacao, plural } from "@/lib/format";
import { periodoDaPagina } from "@/lib/periodo-da-pagina";
import { instantesDoPeriodo } from "@/lib/relatorios-compras";
import { custosPara, valorDoPedido } from "@/lib/valor-do-item";

import { NumeroGrande } from "../pecas";
import { FiltroDePeriodo } from "../periodo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cotações — Relatórios" };

/**
 * As cotações do período, da mais nova para a mais antiga: quantos itens,
 * quantos fornecedores responderam e quanto virou pedido.
 *
 * "Virou pedido" é a soma dos pedidos que saíram dela e não foram cancelados —
 * é o dinheiro que a cotação decidiu. O preço de cada item e a comparação
 * ficam na própria cotação, no botão Abrir.
 */
export default async function HistoricoDeCotacoesPage({
  searchParams,
}: PageProps<"/admin/compras/relatorios/cotacoes">) {
  await guardModule("compras");
  const { capacity } = await getSettings();
  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  const q = await searchParams;
  const { de, ate } = periodoDaPagina("/admin/compras/relatorios/cotacoes", q, hoje);
  const { inicio, fim } = instantesDoPeriodo(de, ate, tz);

  const cotacoes = await prisma.cotacao.findMany({
    where: { dataInicio: { gte: inicio, lt: fim } },
    orderBy: { dataInicio: "desc" },
    select: {
      id: true,
      estatus: true,
      dataInicio: true,
      dataFechamento: true,
      _count: { select: { cotacaoItens: true, cotacaoFornecedores: true } },
      cotacaoFornecedores: { select: { estatus: true } },
      pedidosCompra: {
        where: { estatus: { not: "CANCELADO" } },
        select: {
          entregaConfirmada: true,
          itens: {
            select: {
              produtoId: true,
              quantidadeSolicitada: true,
              quantidadeRecebida: true,
              precoUnitario: true,
              precoPago: true,
              precoEstimado: true,
            },
          },
        },
      },
    },
  });
  // A mesma regra de Pedidos: conferido vale o que chegou; antes, o pedido.
  const custos = await custosPara(
    cotacoes.flatMap((c) => c.pedidosCompra.filter((p) => !p.entregaConfirmada).flatMap((p) => p.itens)),
  );

  const linhas = cotacoes.map((c) => ({
    ...c,
    respondidos: c.cotacaoFornecedores.filter((f) => f.estatus === "RESPONDIDA").length,
    valor: c.pedidosCompra.reduce((s, p) => s + valorDoPedido(p, custos), 0),
    pedidos: c.pedidosCompra.length,
  }));
  const totalDecidido = linhas.reduce((s, c) => s + c.valor, 0);
  const chamados = linhas.reduce((s, c) => s + c._count.cotacaoFornecedores, 0);
  const respondidos = linhas.reduce((s, c) => s + c.respondidos, 0);

  return (
    <div className="space-y-5">
      <FiltroDePeriodo caminho="/admin/compras/relatorios/cotacoes" de={de} ate={ate} hoje={hoje} />

      <CartaoDeSecao icone={Scale} titulo="Resumo" frase="As cotações que começaram no período.">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumeroGrande rotulo="Cotações no período" valor={String(linhas.length)} />
          <NumeroGrande
            rotulo="Viraram pedido"
            valor={formatMoney(totalDecidido)}
            detalhe="o que chegou; o que falta chegar, pelo valor pedido"
          />
          <NumeroGrande
            rotulo="Fornecedores que responderam"
            valor={chamados === 0 ? "—" : `${respondidos} de ${chamados}`}
            detalhe={chamados === 0 ? "nenhum fornecedor chamado" : "somando todas as cotações"}
          />
        </div>
      </CartaoDeSecao>

      <CartaoDeSecao icone={ListChecks} titulo="Cotações do período" frase="Da mais nova para a mais antiga.">
        {linhas.length === 0 ? (
          <p className="msg-warn">Nenhuma cotação começou neste período.</p>
        ) : (
          // A lista ocupa o cartão de ponta a ponta, como a Lista das outras telas.
          <ul className="-mx-4 -my-4 divide-y divide-[var(--border)]">
            {linhas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-medium">
                    {nomeDaCotacao(c.dataInicio, tz)}{" "}
                    <span className="selo ml-1" style={{ color: corDoTom(COTACAO_LABEL[c.estatus].tom) }}>
                      {COTACAO_LABEL[c.estatus].texto}
                    </span>
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {plural(c._count.cotacaoItens, "item", "itens")} ·{" "}
                    {respostasLabel(c.respondidos, c._count.cotacaoFornecedores)}
                    {c.pedidos > 0 && ` · ${plural(c.pedidos, "pedido", "pedidos")}`}
                  </p>
                </div>
                <span className="num-display text-sm">{c.pedidos > 0 ? formatMoney(c.valor) : "—"}</span>
                <Button asChild size="sm" className="gap-1.5">
                  <Link href={`/admin/compras/cotacao/${c.id}`}>Abrir</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CartaoDeSecao>
    </div>
  );
}
