import { ChevronRight, ClipboardList } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, LinhaComLink, Lista, Pagina, Vazio } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { COTACAO_LABEL, corDoTom } from "@/lib/cotacao-labels";
import { formatDiaNumerico, formatMoney, formatTime, nomeDaCotacao, plural } from "@/lib/format";
import { getSettings } from "@/lib/availability";
import type { CotacaoStatus } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fazer cotação · Compras" };

/** Quantas anteriores aparecem antes do "Ver todas". */
const ANTERIORES = 8;

/** Já acabou: virou pedido ou foi descartada. O resto ainda pede alguém. */
const ENCERRADA: CotacaoStatus[] = ["APROVADA", "DESCARTADA"];

/**
 * O próximo passo de cada cotação em andamento, escrito como botão: quem abre
 * a tela quer saber o que fazer, e o selo sozinho ("chame os fornecedores")
 * dizia o quê, mas não levava lá.
 */
function proximoPasso(id: number, estatus: CotacaoStatus): { texto: string; href: string } {
  switch (estatus) {
    case "CONTANDO":
    case "ABERTA":
      return { texto: "Chamar fornecedores", href: `/admin/compras/cotacao/${id}/fornecedores` };
    case "RESPONDENDO":
      return { texto: "Ver respostas", href: `/admin/compras/cotacao/${id}` };
    default:
      return { texto: "Comparar preços", href: `/admin/compras/cotacao/${id}` };
  }
}

/**
 * As cotações em duas partes: as em andamento em cartões, com o próximo
 * passo à vista e quantos fornecedores já responderam numa barra; as
 * anteriores numa lista curta, com o que viraram de pedido.
 */
export default async function CotacoesPage({ searchParams }: PageProps<"/admin/compras/cotacao">) {
  // Fora do link de atalhos: cotar pede login (decisão do dono).
  await guardModule("compras");
  const { todas } = await searchParams;
  const [cotacoes, { capacity }] = await Promise.all([
    prisma.cotacao.findMany({
      orderBy: { dataInicio: "desc" },
      include: {
        _count: { select: { cotacaoItens: true } },
        cotacaoFornecedores: { select: { estatus: true } },
        pedidosCompra: { where: { estatus: { not: "CANCELADO" } }, select: { precoTotal: true } },
      },
    }),
    getSettings(),
  ]);
  const tz = capacity.timezone;
  // "segunda, 28/09 às 19:12": o dia da semana curto, para caber numa linha.
  // A data já está no nome ("Cotação de 02/10"); embaixo, o dia da semana e a hora.
  const quando = (d: Date) => `${formatDiaNumerico(d, tz).split(",")[0].replace("-feira", "")} às ${formatTime(d, tz)}`;

  const emAndamento = cotacoes.filter((c) => !ENCERRADA.includes(c.estatus));
  const anteriores = cotacoes.filter((c) => ENCERRADA.includes(c.estatus));
  const verTodas = todas === "1";
  const anterioresNaTela = verTodas ? anteriores : anteriores.slice(0, ANTERIORES);

  return (
    <Pagina>
      <CabecalhoDaPagina
        titulo="Fazer cotação"
        subtitulo="Conte o estoque, chame os fornecedores pelo link e compare os preços."
      />

      {/* A cotação não nasce daqui: nasce de uma contagem fechada, em Contar
          estoque. O botão leva para lá. */}
      <Button asChild size="lg" className="w-full sm:w-auto">
        <Link href="/admin/compras/contagem">
          <ClipboardList aria-hidden className="size-5" />
          Contar estoque
        </Link>
      </Button>

      {cotacoes.length === 0 && (
        <Vazio>
          Nenhuma cotação ainda. A primeira começa contando o que tem na prateleira.
        </Vazio>
      )}

      {emAndamento.length > 0 && (
        <section>
          <h2 className="section-label mb-2">
            Em andamento · {emAndamento.length}
          </h2>
          <ul className="space-y-3">
            {emAndamento.map((c) => {
              const chamados = c.cotacaoFornecedores.length;
              const responderam = c.cotacaoFornecedores.filter((f) => f.estatus === "RESPONDIDA").length;
              const rotulo = COTACAO_LABEL[c.estatus];
              const passo = proximoPasso(c.id, c.estatus);
              return (
                <li key={c.id} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={`/admin/compras/cotacao/${c.id}`}
                      className="min-w-0 text-base font-semibold underline-offset-4 hover:underline"
                    >
                      {nomeDaCotacao(c.dataInicio, tz)}
                    </Link>
                    <span className="selo shrink-0" style={{ color: corDoTom(rotulo.tom) }}>
                      {rotulo.texto}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--muted-foreground)]">{quando(c.dataInicio)}</p>

                  {/* Quantos responderam, numa barra: "0 de 0" não dizia que
                      ninguém foi chamado ainda. */}
                  <div className="mt-3">
                    {chamados === 0 ? (
                      <p className="text-sm text-[var(--muted-foreground)]">
                        {plural(c._count.cotacaoItens, "item", "itens")} · nenhum fornecedor chamado ainda
                      </p>
                    ) : (
                      <>
                        <p className="flex justify-between gap-3 text-sm">
                          <span className="text-[var(--muted-foreground)]">
                            {plural(c._count.cotacaoItens, "item", "itens")} · responderam
                          </span>
                          <span className="font-medium tabular-nums">
                            {responderam} de {chamados}
                          </span>
                        </p>
                        <span aria-hidden className="mt-1 block h-1.5 rounded-full bg-[var(--muted)]">
                          <span
                            className="block h-full rounded-full bg-[var(--primary)]"
                            style={{ width: `${Math.max((responderam / chamados) * 100, responderam > 0 ? 4 : 0)}%` }}
                          />
                        </span>
                      </>
                    )}
                  </div>

                  <Button asChild className="mt-4 h-10 w-full sm:w-auto">
                    <Link href={passo.href}>
                      {passo.texto}
                      <ChevronRight aria-hidden className="size-4" />
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {anteriores.length > 0 && (
        <section>
          <h2 className="section-label mb-2">
            Anteriores · {anteriores.length}
          </h2>
          <Lista>
            {anterioresNaTela.map((c) => {
              const rotulo = COTACAO_LABEL[c.estatus];
              const total = c.pedidosCompra.reduce((t, p) => t + p.precoTotal.toNumber(), 0);
              return (
                <LinhaComLink key={c.id} href={`/admin/compras/cotacao/${c.id}`}>
                  <span className="flex items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{nomeDaCotacao(c.dataInicio, tz)}</span>
                      <span className="block text-sm text-[var(--muted-foreground)]">{quando(c.dataInicio)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      {c.estatus === "APROVADA" && c.pedidosCompra.length > 0 ? (
                        <>
                          <span className="block text-sm font-semibold tabular-nums">{formatMoney(total)}</span>
                          <span className="block text-xs text-[var(--muted-foreground)]">
                            {plural(c.pedidosCompra.length, "pedido", "pedidos")}
                          </span>
                        </>
                      ) : (
                        <span className="selo" style={{ color: corDoTom(rotulo.tom) }}>
                          {rotulo.texto}
                        </span>
                      )}
                    </span>
                  </span>
                </LinhaComLink>
              );
            })}
          </Lista>
          {anteriores.length > anterioresNaTela.length && (
            <Link
              href="/admin/compras/cotacao?todas=1"
              className="mt-2 inline-block text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline"
            >
              Ver todas as {anteriores.length}
            </Link>
          )}
        </section>
      )}
    </Pagina>
  );
}
