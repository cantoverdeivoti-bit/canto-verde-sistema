import { ArrowRight, CalendarRange, ChartColumn, ChartPie, Gauge, Tags, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { CartaoDeSecao } from "@/components/pagina";
import { formatMoney, plural } from "@/lib/format";
import type { SemanaDoRelatorio } from "@/lib/orcamento";
import type { DadosDoPainel, Insight, LinhaABC } from "@/lib/painel-compras";

import { GraficoSemanal } from "./grafico-semanal";
import { Barras, COLUNAS_NA_BORDA, pctTexto } from "./pecas";

/**
 * O painel executivo de compras, só desenho: recebe tudo pronto de
 * `lib/painel-compras`.
 *
 * A ordem é a da decisão: primeiro o que pede ação, depois os números que a
 * sustentam, a evolução, e onde está o dinheiro (ABC). O que é consulta fica
 * recolhido em "Mais detalhes".
 */
export function TelaDoPainel({
  dados,
  topo,
  economia,
  bonificacao,
}: {
  dados: DadosDoPainel;
  topo?: React.ReactNode;
  /** Quanto se economizou negociando, nos pedidos do período. */
  economia?: { valor: number; itens: number };
  /** O que os fornecedores deram de bonificação no período. */
  bonificacao?: { valor: number; itens: number };
}) {
  const { kpis } = dados;
  const semCompra = kpis.gasto === 0;
  const variacaoGasto = kpis.gastoAntes > 0 ? ((kpis.gasto - kpis.gastoAntes) / kpis.gastoAntes) * 100 : null;
  const orcDelta =
    kpis.orcamento.uso !== null && kpis.orcamento.usoAntes !== null ? kpis.orcamento.uso - kpis.orcamento.usoAntes : null;
  const prazoDelta =
    kpis.prazo.pct !== null && kpis.prazo.pctAntes !== null ? kpis.prazo.pct - kpis.prazo.pctAntes : null;
  const estouradas = dados.grafico.filter((x) => x.orcamento !== null && x.pedido > x.orcamento).length;
  const aCaminho =
    kpis.aCaminho.valor > 0
      ? `+ ${curto(kpis.aCaminho.valor)} a caminho` +
        (kpis.aCaminho.semPreco > 0 ? ` (${plural(kpis.aCaminho.semPreco, "item", "itens")} sem preço)` : "")
      : kpis.aCaminho.semPreco > 0
        ? `${plural(kpis.aCaminho.semPreco, "item", "itens")} a caminho sem preço`
        : undefined;
  const prazoDetalhe = [
    kpis.prazo.semChegar > 0 ? plural(kpis.prazo.semChegar, "atrasado sem chegar", "atrasados sem chegar") : null,
    kpis.prazo.problemas > 0 ? `${plural(kpis.prazo.problemas, "item", "itens")} com problema` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      {topo}

      {/* 1. O que pede decisão. */}
      <CartaoDeSecao icone={TriangleAlert} titulo="O que pede decisão" frase="O que custou ou arrisca dinheiro no período.">
        {dados.insights.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {semCompra ? "Sem compra recebida no período." : "Nada pedindo ação."}
          </p>
        ) : (
          <ol className="grid gap-2 lg:grid-cols-3">
            {dados.insights.map((i) => (
              <CartaoDeInsight key={i.tipo} insight={i} />
            ))}
          </ol>
        )}
      </CartaoDeSecao>

      {/* 2. Os quatro números, cada um contra o período anterior de mesmo tamanho. */}
      <CartaoDeSecao icone={Gauge} titulo="Números" frase="Cada um contra o período anterior de mesmo tamanho.">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi
            rotulo="Gasto recebido"
            valor={reais(kpis.gasto)}
            delta={variacaoGasto}
            unidade="%"
            bomQuandoSobe={false}
            detalhe={aCaminho}
          />
          <Kpi
            rotulo="Uso do orçamento"
            valor={kpis.orcamento.uso === null ? "—" : pctTexto(kpis.orcamento.uso)}
            delta={orcDelta}
            unidade="p.p."
            bomQuandoSobe={false}
            alerta={kpis.orcamento.uso !== null && kpis.orcamento.uso > 100}
            detalhe={kpis.orcamento.semanas === 0 ? "sem orçamento" : undefined}
          />
          <Kpi
            rotulo="Preço da mesma cesta"
            valor={kpis.cesta.variacao === null ? "—" : `${kpis.cesta.variacao >= 0 ? "+" : ""}${pctTexto(kpis.cesta.variacao)}`}
            delta={null}
            alerta={kpis.cesta.variacao !== null && kpis.cesta.variacao >= 5}
            detalhe={
              kpis.cesta.produtos === 0
                ? undefined
                : `${kpis.cesta.efeito >= 0 ? "+" : "−"}${curto(Math.abs(kpis.cesta.efeito))} só de preço`
            }
          />
          <Kpi
            rotulo="Entregas no prazo"
            valor={kpis.prazo.pct === null ? "—" : pctTexto(kpis.prazo.pct)}
            delta={prazoDelta}
            unidade="p.p."
            bomQuandoSobe
            detalhe={prazoDetalhe || undefined}
          />
        </div>
        {/* A conta da negociação: o que o "negociar" da cotação rendeu. Fica
            fora da grade dos quatro porque não tem período anterior com que
            comparar — é um número só, e diz o que diz. Texto solto, sem caixa:
            já está dentro do cartão. */}
        {((economia && economia.valor > 0) || (bonificacao && bonificacao.valor > 0)) && (
          <div className="space-y-1 border-t border-[var(--border)] pt-3 text-sm">
            {economia && economia.valor > 0 && (
              <p>
                Negociando, a casa economizou{" "}
                <span className="num-display font-semibold" style={{ color: "var(--ok-strong)" }}>
                  {formatMoney(economia.valor)}
                </span>{" "}
                no período, em {plural(economia.itens, "item", "itens")}.
              </p>
            )}
            {bonificacao && bonificacao.valor > 0 && (
              <p>
                Em bonificações, recebeu{" "}
                <span className="num-display font-semibold" style={{ color: "var(--ok-strong)" }}>
                  {formatMoney(bonificacao.valor)}
                </span>{" "}
                no período ({plural(bonificacao.itens, "bonificação", "bonificações")}).
              </p>
            )}
          </div>
        )}
      </CartaoDeSecao>

      {/* 3. A evolução: o pedido de cada semana contra o orçamento dela. */}
      <CartaoDeSecao
        icone={ChartColumn}
        titulo="Pedido por semana"
        frase={`${plural(dados.grafico.length, "semana", "semanas")} contra o orçamento de cada uma.`}
      >
        <div className="space-y-1">
          <p className="text-right text-xs text-[var(--muted-foreground)]">
            <span className="mr-1 inline-block w-4 border-t-2 border-dashed border-[var(--foreground)] align-middle opacity-60" />
            orçamento
          </p>
          <GraficoSemanal semanas={dados.grafico} />
        </div>
        {dados.mediaSemanal !== null && (
          <p className="text-xs text-[var(--muted-foreground)]">
            Média {curto(dados.mediaSemanal)} por semana fechada
            {estouradas > 0 && (
              <span style={{ color: "var(--destructive)" }}>
                {" · "}
                {plural(estouradas, "semana acima", "semanas acima")} do orçamento
              </span>
            )}
          </p>
        )}
      </CartaoDeSecao>

      {/* 4. Onde está o dinheiro. */}
      {dados.abc.length > 0 && <CurvaABC abc={dados.abc} />}

      {/* 5. Consulta: recolhida, num cartão branco próprio. Dentro dele, cada
          assunto é um bloco com fio em cima, como numa gaveta. */}
      {(dados.semanas.length > 0 || dados.categorias.length > 0) && (
        <details className="group rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span className="flex-1">Mais detalhes</span>
            <span aria-hidden className="text-[var(--muted-foreground)] transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="space-y-5 px-4 pb-4">
            <OrcamentoSemanaASemana semanas={dados.semanas} />
            {dados.categorias.length > 0 && (
              <section className="space-y-3 border-t border-[var(--border)] pt-3">
                <h3 className="flex items-center gap-2 text-sm font-bold">
                  <Tags aria-hidden className="size-4 text-[var(--primary)]" />
                  Gasto por categoria
                </h3>
                <Barras
                  linhas={dados.categorias.map((c) => ({
                    rotulo: c.categoria,
                    pct: c.pct,
                    valor: `${formatMoney(c.valor)} · ${pctTexto(c.pct)}`,
                    dica: `${c.categoria}: ${formatMoney(c.valor)}, ${pctTexto(c.pct)} do gasto`,
                  }))}
                />
              </section>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Um número e como ele andou. A seta tem a cor do que significa — gasto
 * subindo é ruim, entrega no prazo subindo é bom —, e não a do sinal.
 */
function Kpi({
  rotulo,
  valor,
  delta,
  unidade = "%",
  bomQuandoSobe = false,
  alerta = false,
  comparacao = "",
  detalhe,
}: {
  rotulo: string;
  valor: string;
  /** Variação contra o período anterior. Nulo: sem base para comparar. */
  delta: number | null;
  unidade?: "%" | "p.p.";
  bomQuandoSobe?: boolean;
  /** O próprio valor já pede atenção (orçamento acima de 100%, preço subindo). */
  alerta?: boolean;
  /** O que dizer quando não há variação: sem base, ou o próprio número já é uma. */
  comparacao?: string;
  detalhe?: string;
}) {
  const parado = delta !== null && Math.abs(delta) < 0.05;
  const bom = delta !== null && !parado && delta > 0 === bomQuandoSobe;
  const cor = delta === null || parado ? "var(--muted-foreground)" : bom ? "var(--ok-strong)" : "var(--destructive)";
  const numero = delta === null ? "" : Math.abs(delta).toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-[var(--border)] px-3 py-3">
      <span className="text-xs font-medium text-[var(--muted-foreground)]">{rotulo}</span>
      <span
        className="num-display truncate text-xl leading-tight sm:text-2xl"
        style={{ color: alerta ? "var(--destructive)" : undefined }}
      >
        {valor}
      </span>
      {(delta !== null || comparacao) && (
      <span className="text-xs font-semibold" style={{ color: cor }}>
        {delta === null
          ? comparacao
          : parado
            ? "= estável"
            : `${delta > 0 ? "▲" : "▼"} ${numero}${unidade === "%" ? "%" : " p.p."}`}
      </span>
      )}
      {detalhe && <span className="text-xs text-[var(--muted-foreground)]">{detalhe}</span>}
    </div>
  );
}

/** Um assunto: o fato, quanto pesou e o que fazer. */
function CartaoDeInsight({ insight: i }: { insight: Insight }) {
  const cor = i.tom === "perda" ? "var(--destructive)" : "var(--warn)";
  return (
    <li
      className="flex flex-col rounded-xl border border-l-4 border-[var(--border)] bg-[var(--card)] px-4 py-3.5"
      style={{ borderLeftColor: cor }}
    >
      {/* O tipo do alerta na cor dele, e embaixo de quem se trata. */}
      <div className="flex-1">
        <p className="text-sm font-semibold" style={{ color: cor }}>
          {i.rotulo}
        </p>
        <p className="mt-0.5 text-base leading-snug font-bold">{i.assunto}</p>

        {/* A comparação em linhas: o nome à esquerda, o número à direita. */}
        {i.detalhes.length > 0 && (
          <dl className="mt-2.5 space-y-1 text-sm">
            {i.detalhes.map((d) => (
              <div key={d.rotulo} className="flex items-baseline justify-between gap-3">
                <dt className="min-w-0 truncate text-[var(--muted-foreground)]">{d.rotulo}</dt>
                <dd className="shrink-0 font-medium tabular-nums">{d.valor}</dd>
              </div>
            ))}
          </dl>
        )}
        {i.nota && <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">{i.nota}</p>}
      </div>

      {/* Embaixo: quanto custou, com o que o número quer dizer, e o que fazer. */}
      <div className="mt-3 flex items-end justify-between gap-3 border-t border-[var(--border)] pt-3">
        {i.impacto !== null ? (
          <div className="leading-tight">
            <p className="num-display text-lg font-semibold" style={{ color: cor }}>
              {formatMoney(i.impacto)}
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">{i.rotuloImpacto}</p>
          </div>
        ) : (
          <p className="text-xs font-semibold" style={{ color: cor }}>
            Risco, ainda sem custo
          </p>
        )}
        <Link
          href={i.acao.href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--primary)] underline-offset-4 hover:underline"
        >
          {i.acao.texto}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </li>
  );
}

/**
 * A curva ABC, para decidir onde negociar: o resumo em três números e a
 * classe A aberta, com o que mudou de preço e de quantos fornecedores veio.
 */
function CurvaABC({ abc }: { abc: LinhaABC[] }) {
  const classes = (["A", "B", "C"] as const).map((c) => {
    const itens = abc.filter((i) => i.classe === c);
    return { classe: c, itens, pctGasto: itens.reduce((s, i) => s + i.pct, 0) };
  });
  return (
    <CartaoDeSecao icone={ChartPie} titulo="Curva ABC" frase="Onde está o dinheiro: a classe A pede negociação.">
      <div className="grid grid-cols-3 gap-2">
        {classes.map((c) => (
          <div key={c.classe} className="rounded-lg border border-[var(--border)] px-3 py-2">
            <p className="text-xs text-[var(--muted-foreground)]">Classe {c.classe}</p>
            <p className="num-display text-lg leading-tight">{pctTexto(c.pctGasto)}</p>
            <p className="text-xs text-[var(--muted-foreground)]">{plural(c.itens.length, "item", "itens")}</p>
          </div>
        ))}
      </div>
      {/* Cada classe abre embaixo da outra, de ponta a ponta do cartão e
          separadas por um fio, em vez de uma caixa com borda dentro dele. */}
      <div className="-mx-4 -mb-4 divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {classes
          .filter((c) => c.itens.length > 0)
          .map((c) => (
            <details key={c.classe} open={c.classe === "A"}>
              <summary className="cursor-pointer px-4 py-2.5 text-sm">
                <strong>Classe {c.classe}</strong>
              </summary>
              {/* Três colunas e o nome quebrando a linha, mas no celular
                  estreito ainda estouravam a tela: a rolagem fica na tabela. */}
              <div className={`overflow-x-auto border-t border-[var(--border)] ${COLUNAS_NA_BORDA}`}>
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-left text-xs text-[var(--muted-foreground)]">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Produto</th>
                      <th className="px-3 py-1.5 text-right font-medium">Gasto</th>
                      <th className="hidden px-3 py-1.5 text-right font-medium sm:table-cell">Acum.</th>
                      <th className="px-3 py-1.5 text-right font-medium" title="Preço médio pago contra o do período anterior">
                        Preço
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {c.itens.map((i) => (
                      <tr key={i.produtoId}>
                        <td className="px-3 py-1.5 leading-snug">
                          {i.nome}
                          {/* Mais de um fornecedor para o mesmo item: dá para concentrar. */}
                          {i.fornecedores > 1 && (
                            <span className="ml-1.5 rounded bg-[var(--muted)] px-1 text-[11px] text-[var(--muted-foreground)]">
                              {i.fornecedores} forn.
                            </span>
                          )}
                        </td>
                        <td className="num-display px-3 py-1.5 text-right whitespace-nowrap">{reais(i.valor)}</td>
                        <td className="num-display hidden px-3 py-1.5 text-right sm:table-cell">{pctTexto(i.acumulado)}</td>
                        <td className="num-display px-3 py-1.5 text-right whitespace-nowrap">
                          {i.variacaoPreco === null ? (
                            <span className="text-[var(--muted-foreground)]">novo</span>
                          ) : Math.abs(i.variacaoPreco) < 0.05 ? (
                            <span className="text-[var(--muted-foreground)]">=</span>
                          ) : (
                            // Cor só no que pede olho: alta de 5% ou mais. O resto, neutro.
                            <span
                              style={{
                                color:
                                  i.variacaoPreco >= 5
                                    ? "var(--destructive)"
                                    : i.variacaoPreco <= -5
                                      ? "var(--ok-strong)"
                                      : "var(--muted-foreground)",
                              }}
                            >
                              {i.variacaoPreco > 0 ? "+" : "−"}
                              {pctTexto(Math.abs(i.variacaoPreco))}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
      </div>
    </CartaoDeSecao>
  );
}

/** "R$ 9.302" — sem centavos, para tabela. */
function reais(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** "R$ 3,2 mil" — valor em linha curta. */
function curto(valor: number) {
  return valor >= 1000
    ? `R$ ${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
    : formatMoney(valor);
}

/** "2026-09-21" → "21/09". */
function diaMes(dia: string) {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/**
 * O orçamento semana a semana: faturamento da semana anterior × meta de CMV,
 * contra o que foi pedido e o que chegou, e o CMV real — o custo do consumo
 * (contagem inicial + entradas − contagem final) sobre o faturamento.
 */
function OrcamentoSemanaASemana({ semanas }: { semanas: SemanaDoRelatorio[] }) {
  if (semanas.length === 0) return null;
  return (
    <section className="space-y-3 border-t border-[var(--border)] pt-3">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <CalendarRange aria-hidden className="size-4 text-[var(--primary)]" />
        Orçamento semana a semana
      </h3>
      {/* De ponta a ponta do cartão, entre dois fios: uma caixa com borda
          dentro do "Mais detalhes" seria cartão dentro de cartão. */}
      <div className="-mx-4 border-y border-[var(--border)]">
        {/* Celular: um cartão por semana. A tabela de oito colunas rolava para o lado. */}
        <ul className="divide-y divide-[var(--border)] text-sm tabular-nums md:hidden">
          {semanas.map((s) => {
            const pct = s.orcamento ? (s.pedido / s.orcamento) * 100 : null;
            const cmvOk = s.cmvReal !== null && s.metaCmv !== null ? s.cmvReal <= s.metaCmv : null;
            return (
              <li key={s.semana} className="space-y-1.5 px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <p className="min-w-0 flex-1 font-semibold">Semana de {diaMes(s.semana)}</p>
                  {pct === null ? (
                    <span className="text-xs text-[var(--muted-foreground)]">sem orçamento</span>
                  ) : (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-[var(--muted)]">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            background: pct > 100 ? "var(--destructive)" : "var(--ok-strong)",
                          }}
                        />
                      </span>
                      <span style={pct > 100 ? { color: "var(--destructive)" } : undefined}>{pctTexto(pct)}</span>
                    </span>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                  <dt className="text-[var(--muted-foreground)]">Orçamento</dt>
                  <dd className="text-right">{s.orcamento === null ? "—" : formatMoney(s.orcamento)}</dd>
                  <dt className="text-[var(--muted-foreground)]">Pedido</dt>
                  <dd className="text-right">{formatMoney(s.pedido)}</dd>
                  <dt className="text-[var(--muted-foreground)]">Recebido</dt>
                  <dd className="text-right">{formatMoney(s.recebido)}</dd>
                  <dt className="text-[var(--muted-foreground)]">CMV real (meta)</dt>
                  <dd
                    className="text-right font-medium"
                    style={cmvOk === null ? undefined : { color: cmvOk ? "var(--ok-strong)" : "var(--destructive)" }}
                  >
                    {s.cmvReal === null ? "—" : pctTexto(s.cmvReal)}
                    <span className="font-normal text-[var(--muted-foreground)]">
                      {" "}
                      ({s.metaCmv === null ? "—" : pctTexto(s.metaCmv)})
                    </span>
                  </dd>
                  <dt className="text-[var(--muted-foreground)]">Faturamento ant.</dt>
                  <dd className="text-right">{s.faturamento === null ? "—" : formatMoney(s.faturamento)}</dd>
                </dl>
              </li>
            );
          })}
        </ul>
        <div className={`hidden overflow-x-auto md:block ${COLUNAS_NA_BORDA}`}>
          <table className="w-full min-w-[40rem] text-sm tabular-nums">
            <thead className="bg-[var(--surface)] text-xs text-[var(--muted-foreground)]">
              <tr className="text-right">
                <th className="px-3 py-2 text-left font-medium">Semana</th>
                <th className="px-3 py-2 font-medium">Faturamento ant.</th>
                <th className="px-3 py-2 font-medium">Meta CMV</th>
                <th className="px-3 py-2 font-medium">Orçamento</th>
                <th className="px-3 py-2 font-medium">Pedido</th>
                <th className="px-3 py-2 text-left font-medium">% do orçamento</th>
                <th className="px-3 py-2 font-medium">Recebido</th>
                <th className="px-3 py-2 font-medium">CMV real</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {semanas.map((s) => {
                const pct = s.orcamento ? (s.pedido / s.orcamento) * 100 : null;
                const cmvOk = s.cmvReal !== null && s.metaCmv !== null ? s.cmvReal <= s.metaCmv : null;
                return (
                  <tr key={s.semana} className="text-right">
                    <td className="px-3 py-2 text-left whitespace-nowrap">{diaMes(s.semana)}</td>
                    <td className="px-3 py-2">{s.faturamento === null ? "—" : formatMoney(s.faturamento)}</td>
                    <td className="px-3 py-2">{s.metaCmv === null ? "—" : pctTexto(s.metaCmv)}</td>
                    <td className="px-3 py-2">{s.orcamento === null ? "—" : formatMoney(s.orcamento)}</td>
                    <td className="px-3 py-2">{formatMoney(s.pedido)}</td>
                    <td className="px-3 py-2 text-left">
                      {pct === null ? (
                        <span className="text-[var(--muted-foreground)]">sem orçamento</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--muted)]">
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${Math.min(pct, 100)}%`,
                                background: pct > 100 ? "var(--destructive)" : "var(--ok-strong)",
                              }}
                            />
                          </span>
                          <span style={pct > 100 ? { color: "var(--destructive)" } : undefined}>{pctTexto(pct)}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{formatMoney(s.recebido)}</td>
                    <td
                      className="px-3 py-2 font-medium"
                      style={cmvOk === null ? undefined : { color: cmvOk ? "var(--ok-strong)" : "var(--destructive)" }}
                      title={
                        s.consumo === null
                          ? "Precisa de duas contagens na semana para medir o consumo"
                          : s.faturamentoDaSemana === null
                            ? "Sai quando o faturamento desta semana for digitado, na segunda que vem"
                            : `Consumo ${formatMoney(s.consumo)} ÷ faturamento da semana ${formatMoney(s.faturamentoDaSemana)}`
                      }
                    >
                      {s.cmvReal === null ? "—" : pctTexto(s.cmvReal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="hint">
        Orçamento = faturamento da semana anterior × meta de CMV. Pedido é tudo o que foi pedido na
        semana (sem preço, pelo último custo). CMV real = custo do consumo da semana ÷ faturamento da
        mesma semana; precisa de duas contagens na semana e só aparece depois que o faturamento dela é
        digitado, na segunda seguinte.{" "}
        <Link href="/admin/compras/relatorios/orcamento" className="font-medium text-[var(--primary)] underline underline-offset-4">
          Ver o comparativo completo
        </Link>
      </p>
    </section>
  );
}
