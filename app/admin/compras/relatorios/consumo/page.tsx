import { ShoppingBasket, Tags } from "lucide-react";
import Link from "next/link";

import { CartaoDeSecao } from "@/components/pagina";
import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { UNIT_LABEL, formatMoney, plural } from "@/lib/format";
import { diasNoPeriodo } from "@/lib/periodo";
import { periodoDaPagina } from "@/lib/periodo-da-pagina";
import { comprasRecebidas, instantesDoPeriodo, porProduto } from "@/lib/relatorios-compras";

import { dinheiroCurto } from "../escala";
import { COLUNAS_NA_BORDA } from "../pecas";
import { FiltroDePeriodo } from "../periodo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compras por produto · Relatórios" };

const CAMINHO = "/admin/compras/relatorios/consumo";
/** Quantos produtos aparecem antes do "Mostrar todos". */
const PRIMEIROS = 20;
/** Quantas categorias ficam à vista no resumo; o resto abre num toque. */
const CATEGORIAS_A_VISTA = 5;

function texto(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

/**
 * Quantidade de relatório, não de balança: "71,8" e não "71,819". Abaixo de
 * 10 fica uma casa a mais, senão 0,25 KG viraria 0,3.
 */
function quantidadeCurta(q: number): string {
  return q.toLocaleString("pt-BR", { maximumFractionDigits: q < 10 ? 2 : 1 });
}

/**
 * Quanto de cada produto a casa comprou no período, quanto pagou em média por
 * unidade e, em períodos maiores que uma semana, a média por semana.
 *
 * É o que chegou e foi conferido, não o que foi pedido: a mesma régua do
 * Painel. O consumo de verdade (estoque inicial + compras − estoque final)
 * fica no Balanço; por isso a aba se chama "Compras por produto".
 */
export default async function ConsumoPage({ searchParams }: PageProps<"/admin/compras/relatorios/consumo">) {
  await guardModule("compras");
  const { capacity } = await getSettings();
  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  const q = await searchParams;
  const { de, ate } = periodoDaPagina(CAMINHO, q, hoje);
  const ordem = texto(q.ordem) === "quantidade" ? "quantidade" : "gasto";
  const todos = texto(q.todos) === "1";

  const { inicio, fim } = instantesDoPeriodo(de, ate, tz);
  const produtos = porProduto(await comprasRecebidas(inicio, fim));
  const totalGeral = produtos.reduce((t, p) => t + p.valor, 0);

  // O resumo por categoria sai dos produtos, já somados: é o mesmo número da
  // lista, sem uma segunda leitura do banco.
  const somaPorCategoria = new Map<string, number>();
  for (const p of produtos) somaPorCategoria.set(p.categoria, (somaPorCategoria.get(p.categoria) ?? 0) + p.valor);
  const categorias = [...somaPorCategoria]
    .map(([nome, valor]) => ({ nome, valor, pct: totalGeral > 0 ? (valor / totalGeral) * 100 : 0 }))
    .sort((a, b) => b.valor - a.valor);
  const maiorCategoria = categorias[0]?.valor ?? 0;

  // Categoria que não existe no período (link velho) é o mesmo que nenhuma.
  const pedida = texto(q.categoria);
  const categoria = somaPorCategoria.has(pedida) ? pedida : "";

  const dias = diasNoPeriodo(de, ate);
  // Com 7 dias ou menos, "por semana" repetiria a quantidade do período.
  const mostraSemana = dias > 7;
  const semanas = dias / 7;

  const linhas = produtos
    .filter((p) => !categoria || p.categoria === categoria)
    .sort((a, b) => (ordem === "quantidade" ? b.quantidade - a.quantidade : b.valor - a.valor));
  const visiveis = todos ? linhas : linhas.slice(0, PRIMEIROS);
  const total = linhas.reduce((t, p) => t + p.valor, 0);
  // A barra de cada produto mede contra o maior da lista, como as barras do
  // Painel: contra o total, um produto de 1% seria um traço invisível.
  const maiorProduto = Math.max(...linhas.map((p) => p.valor), 0);

  const extras: Record<string, string> = {};
  if (categoria) extras.categoria = categoria;
  if (ordem === "quantidade") extras.ordem = ordem;
  if (todos) extras.todos = "1";
  const endereco = (mudanca: Record<string, string | null>) => {
    const params = new URLSearchParams({ ...extras, de, ate });
    for (const [k, v] of Object.entries(mudanca)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    return `${CAMINHO}?${params.toString()}`;
  };
  // Trocar de categoria volta para os 20 primeiros: "todos" era da lista anterior.
  const linkDaCategoria = (nome: string) =>
    endereco({ categoria: nome === categoria ? null : nome, todos: null });

  const linhaDaCategoria = (c: (typeof categorias)[number]) => {
    const escolhida = c.nome === categoria;
    return (
      <li key={c.nome}>
        <Link
          href={linkDaCategoria(c.nome)}
          aria-current={escolhida ? "true" : undefined}
          className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-sm ${
            escolhida
              ? "bg-[var(--primary-soft)] font-semibold ring-1 ring-[var(--primary)]/30"
              : "hover:bg-[var(--muted)]"
          }`}
        >
          <span className="min-w-0 truncate">{c.nome}</span>
          <span className="text-right text-xs whitespace-nowrap tabular-nums">
            {dinheiroCurto(c.valor)}
            <span className="ml-1.5 inline-block w-9 text-[var(--muted-foreground)]">{Math.round(c.pct)}%</span>
          </span>
          <span aria-hidden className="col-span-2 h-1.5 rounded-full bg-[var(--muted)]">
            <span
              className="block h-full rounded-full bg-[var(--primary)]"
              style={{ width: `${maiorCategoria > 0 ? Math.max((c.valor / maiorCategoria) * 100, 1.5) : 0}%` }}
            />
          </span>
        </Link>
      </li>
    );
  };
  const aVista = categorias.slice(0, CATEGORIAS_A_VISTA);
  const resto = categorias.slice(CATEGORIAS_A_VISTA);
  const escolhidaNoResto = resto.some((c) => c.nome === categoria);

  const precoMedio = (p: (typeof linhas)[number]) =>
    p.quantidade > 0 ? `${formatMoney(p.valor / p.quantidade)}/${UNIT_LABEL[p.unidade]}` : null;
  const barra = (valor: number) => (
    <span aria-hidden className="block h-1 rounded-full bg-[var(--muted)]">
      <span
        className="block h-full rounded-full bg-[var(--primary)]/70"
        style={{ width: `${maiorProduto > 0 ? Math.max((valor / maiorProduto) * 100, 1.5) : 0}%` }}
      />
    </span>
  );

  return (
    <div className="space-y-5">
      <FiltroDePeriodo caminho={CAMINHO} de={de} ate={ate} hoje={hoje} extras={extras} />

      {produtos.length === 0 ? (
        <p className="msg-warn">
          Nenhuma compra recebida neste período. Este relatório conta o que chegou e foi conferido em Recebimentos.
        </p>
      ) : (
        <>
          {/* O resumo é também o filtro: tocar numa categoria mostra só ela,
              tocar de novo volta para todas. */}
          <CartaoDeSecao icone={Tags} titulo="Gasto por categoria" frase="Toque numa categoria para ver só ela.">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="num-display text-2xl font-semibold">{formatMoney(totalGeral)}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {plural(produtos.length, "produto recebido", "produtos recebidos")}
                </p>
              </div>
              {categoria && (
                <Link href={linkDaCategoria(categoria)} className="text-sm font-medium text-[var(--primary)] underline">
                  ver todas
                </Link>
              )}
            </div>
            {/* O fundo de cada linha passa um pouco do texto (-mx-2), para o
                nome alinhar com o total em cima. */}
            <div className="-mx-2">
              <ul className="space-y-0.5">{aVista.map(linhaDaCategoria)}</ul>
              {resto.length > 0 && (
                <details open={escolhidaNoResto} className="group mt-0.5">
                  <summary className="cursor-pointer list-none px-2 py-1.5 text-sm font-medium text-[var(--primary)] group-open:hidden">
                    ver as outras {plural(resto.length, "categoria", "categorias")}
                  </summary>
                  <ul className="space-y-0.5">{resto.map(linhaDaCategoria)}</ul>
                </details>
              )}
            </div>
          </CartaoDeSecao>

          <CartaoDeSecao icone={ShoppingBasket} titulo="Produtos" frase="O que chegou e foi conferido em Recebimentos.">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-sm">
              <p>
                <span className="font-medium">{plural(linhas.length, "produto", "produtos")}</span>
                {categoria && <span className="text-[var(--muted-foreground)]"> em {categoria}</span>}
                {categoria && <span className="ml-1.5 font-semibold tabular-nums">{formatMoney(total)}</span>}
              </p>
              <p className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                Ordenar por
                <Link href={endereco({ ordem: "gasto" })} aria-pressed={ordem === "gasto"} className="chip px-3 py-1.5 text-[13px]">
                  gasto
                </Link>
                <Link
                  href={endereco({ ordem: "quantidade" })}
                  aria-pressed={ordem === "quantidade"}
                  className="chip px-3 py-1.5 text-[13px]"
                >
                  quantidade
                </Link>
              </p>
            </div>

            {/* De ponta a ponta do cartão, entre dois fios: com borda própria
                aqui dentro seria caixa dentro de caixa. */}
            <div className="-mx-4 border-y border-[var(--border)]">
              {/* Celular: o nome com a largura toda e o gasto à direita, a barra
                  do tamanho do gasto embaixo e, por último, os números miúdos. */}
              <ul className="divide-y divide-[var(--border)] md:hidden">
                {visiveis.map((p) => {
                  const un = UNIT_LABEL[p.unidade];
                  const medio = precoMedio(p);
                  return (
                    <li key={p.produtoId} className="space-y-1.5 px-4 py-2.5">
                      <div className="flex items-baseline gap-3">
                        <p className="min-w-0 flex-1 text-sm leading-snug font-medium">{p.nome}</p>
                        <p className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(p.valor)}</p>
                      </div>
                      {barra(p.valor)}
                      <p className="text-xs text-[var(--muted-foreground)] tabular-nums">
                        {!categoria && <>{p.categoria} · </>}
                        {quantidadeCurta(p.quantidade)} {un}
                        {medio && <> · {medio}</>}
                        {mostraSemana && (
                          <>
                            {" "}
                            · {quantidadeCurta(p.quantidade / semanas)} {un}/semana
                          </>
                        )}{" "}
                        · {plural(p.compras, "compra", "compras")}
                      </p>
                    </li>
                  );
                })}
              </ul>

              {/* Computador: a tabela, com a barra na coluna do gasto. */}
              <div className={`hidden overflow-x-auto md:block ${COLUNAS_NA_BORDA}`}>
                <table className="w-full text-sm">
                  <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Produto</th>
                      <th className="px-3 py-2 text-right font-medium">Comprado</th>
                      <th className="px-3 py-2 text-right font-medium">Preço médio</th>
                      {mostraSemana && <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Por semana</th>}
                      <th className="px-3 py-2 text-right font-medium">Compras</th>
                      <th className="w-56 px-3 py-2 text-right font-medium">Gasto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {visiveis.map((p) => (
                      <tr key={p.produtoId}>
                        <td className="px-3 py-2">
                          {p.nome}
                          {!categoria && (
                            <span className="block text-xs text-[var(--muted-foreground)]">{p.categoria}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                          {quantidadeCurta(p.quantidade)} {UNIT_LABEL[p.unidade]}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{precoMedio(p)}</td>
                        {mostraSemana && (
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                            {quantidadeCurta(p.quantidade / semanas)} {UNIT_LABEL[p.unidade]}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right tabular-nums">{p.compras}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="block font-semibold whitespace-nowrap tabular-nums">{formatMoney(p.valor)}</span>
                          <span className="mt-1 block">{barra(p.valor)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {linhas.length > visiveis.length && (
              <Link href={endereco({ todos: "1" })} scroll={false} className="btn-ghost flex h-10 w-full items-center justify-center">
                Mostrar todos os {linhas.length}
              </Link>
            )}

            {/* "Conta o que chegou e foi conferido" subiu para a frase do cartão. */}
            <p className="hint">
              Preço médio é o gasto dividido pela quantidade.
              {mostraSemana && " Por semana divide pelo número de semanas do período e ajuda a acertar o estoque ideal."}
              {" "}O consumo de verdade, com o estoque contado, fica no Balanço.
            </p>
          </CartaoDeSecao>
        </>
      )}
    </div>
  );
}
