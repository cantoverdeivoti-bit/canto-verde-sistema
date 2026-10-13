import { ChartLine, History, TrendingDown, TrendingUp, Truck, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { CartaoDeSecao } from "@/components/pagina";
import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { UNIT_LABEL, formatMoney } from "@/lib/format";
import { precoMedioPorProduto, variacoesDePreco, type VariacaoDePreco } from "@/lib/painel-compras";
import { periodoAnterior, somarDias } from "@/lib/periodo";
import { periodoDaPagina } from "@/lib/periodo-da-pagina";
import { comprasRecebidas, instantesDoPeriodo, precosDoProduto } from "@/lib/relatorios-compras";

import { COLUNAS_NA_BORDA, pctTexto } from "../pecas";
import { BuscaDeProduto } from "../busca-de-produto";
import { FiltroDePeriodo, diaCurto } from "../periodo";
import { LinhaDePreco } from "./linha-de-preco";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preços — Relatórios" };

function texto(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

/** "▲ 12,5%" ou "▼ 3,0%". */
function setaPct(v: number) {
  return `${v > 0 ? "▲" : "▼"} ${pctTexto(Math.abs(v))}`;
}

/**
 * Quanto cada produto custou. Sem produto escolhido, as maiores altas e
 * quedas do período; com um, a linha e a tabela dele.
 *
 * Variação é sempre o preço médio pago no período contra o do período
 * anterior de mesmo tamanho — a conta do Painel (`variacoesDePreco`), para o
 * "ficou X% mais caro" de lá abrir aqui com o mesmo número.
 */
export default async function PrecosPage({ searchParams }: PageProps<"/admin/compras/relatorios/precos">) {
  await guardModule("compras");
  const { capacity } = await getSettings();
  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  const q = await searchParams;
  const { de, ate } = periodoDaPagina("/admin/compras/relatorios/precos", q, hoje);
  const produtoId = Number(texto(q.produto)) || null;

  // Só produtos que têm alguma compra registrada: buscar um que nunca foi
  // comprado levaria a uma tela vazia.
  const comHistorico = await prisma.product.findMany({
    where: { historico: { some: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true },
  });
  const produto = produtoId === null ? null : (comHistorico.find((p) => p.id === produtoId) ?? null);
  const dia = (d: Date) =>
    d.toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: tz,
    });

  const busca = (
    <BuscaDeProduto
      produtos={comHistorico.map((p) => ({ id: p.id, nome: p.name }))}
      caminho="/admin/compras/relatorios/precos"
      de={de}
      ate={ate}
      placeholder="Buscar produto pelo nome"
    />
  );

  const antes = periodoAnterior(de, ate);
  const agora = instantesDoPeriodo(de, ate, tz);
  const anterior = instantesDoPeriodo(antes.de, antes.ate, tz);
  const textoAnterior = `${diaCurto(antes.de)} a ${diaCurto(antes.ate)}`;

  if (produto) {
    const [pontos, recebidas, recebidasAntes] = await Promise.all([
      precosDoProduto(produto.id, agora),
      comprasRecebidas(agora.inicio, agora.fim, produto.id),
      comprasRecebidas(anterior.inicio, anterior.fim, produto.id),
    ]);
    const medio = precoMedioPorProduto(recebidas).get(produto.id) ?? null;
    const medioAntes = precoMedioPorProduto(recebidasAntes).get(produto.id) ?? null;
    const variacao = medio && medioAntes && medioAntes.preco > 0 ? (medio.preco / medioAntes.preco - 1) * 100 : null;
    // Um resumo por fornecedor a partir dos mesmos pontos (do mais antigo ao
    // mais novo, então o último de cada um é o preço mais recente dele).
    const mapa = new Map<string, number[]>();
    for (const p of pontos) {
      if (!p.fornecedor) continue;
      const lista = mapa.get(p.fornecedor) ?? [];
      lista.push(p.preco);
      mapa.set(p.fornecedor, lista);
    }
    const porFornecedor = [...mapa]
      .map(([nome, precos]) => ({
        nome,
        ultimo: precos[precos.length - 1],
        menor: Math.min(...precos),
        media: precos.reduce((s, x) => s + x, 0) / precos.length,
        compras: precos.length,
      }))
      .sort((x, y) => x.ultimo - y.ultimo);
    const menorUltimo = porFornecedor[0]?.ultimo;
    const unidade = UNIT_LABEL[produto.unit];
    const umAno = { de: somarDias(hoje, -364), ate: hoje };
    return (
      <div className="space-y-5">
        <Link
          href={`/admin/compras/relatorios/precos?de=${de}&ate=${ate}`}
          className="text-sm text-[var(--primary)] underline-offset-4 hover:underline"
        >
          ← Altas e quedas do período
        </Link>
        <FiltroDePeriodo
          caminho="/admin/compras/relatorios/precos"
          de={de}
          ate={ate}
          hoje={hoje}
          extras={{ produto: String(produto.id) }}
          busca={busca}
        />
        {/* O nome do produto vai na frase do cartão: é dele a linha toda. */}
        <CartaoDeSecao icone={ChartLine} titulo="Linha do preço" frase={produto.name}>
          <p className="text-sm">
            {medio ? (
              <>
                Preço médio pago no período:{" "}
                <span className="num-display font-semibold">
                  {formatMoney(medio.preco)}/{unidade}
                </span>
                {medioAntes ? (
                  <>
                    {" "}
                    · antes ({textoAnterior}) {formatMoney(medioAntes.preco)}
                    {variacao !== null && Math.abs(variacao) >= 0.05 && (
                      <span
                        className="num-display ml-1 font-semibold"
                        style={{
                          color: variacao > 0 ? "var(--destructive)" : "var(--ok-strong)",
                        }}
                      >
                        {setaPct(variacao)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[var(--muted-foreground)]"> · sem compra recebida no período anterior</span>
                )}
              </>
            ) : (
              <span className="text-[var(--muted-foreground)]">Nenhuma compra recebida no período.</span>
            )}
          </p>
          <LinhaDePreco
            pontos={pontos}
            timezone={tz}
            vazio={
              <>
                Menos de duas compras neste período, então não há linha para desenhar.{" "}
                <Link
                  href={`/admin/compras/relatorios/precos?de=${umAno.de}&ate=${umAno.ate}&produto=${produto.id}`}
                  className="text-[var(--primary)] underline-offset-4 hover:underline"
                >
                  Ver os últimos 12 meses
                </Link>
              </>
            }
          />
        </CartaoDeSecao>
        {/* O mesmo produto, fornecedor a fornecedor: quem cobra menos, e de
            quem a casa mais compra. Só com mais de um fornecedor no período. */}
        {porFornecedor.length > 1 && (
          <CartaoDeSecao icone={Truck} titulo="Por fornecedor" frase="Do último preço mais barato ao mais caro.">
            {/* De ponta a ponta do cartão, como a Lista: sem caixa dentro de caixa. */}
            <div className="-mx-4 -my-4">
              <ul className="divide-y divide-[var(--border)] text-sm md:hidden">
                {porFornecedor.map((f) => (
                  <li key={f.nome} className="px-4 py-2.5">
                    <div className="flex items-baseline gap-3">
                      <p className="min-w-0 flex-1 font-medium">
                        {f.nome}
                        {f.ultimo === menorUltimo && (
                          <span className="ml-1.5 rounded bg-[var(--ok-soft)] px-1.5 py-0.5 text-xs font-semibold text-[var(--ok-strong)]">
                            mais barato
                          </span>
                        )}
                      </p>
                      <span className="num-display shrink-0 font-semibold">{formatMoney(f.ultimo)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--muted-foreground)] tabular-nums">
                      menor {formatMoney(f.menor)} · média {formatMoney(f.media)} · {f.compras}{" "}
                      {f.compras === 1 ? "compra" : "compras"}
                    </p>
                  </li>
                ))}
              </ul>
              <div className={`hidden overflow-x-auto md:block ${COLUNAS_NA_BORDA}`}>
                <table className="w-full text-sm tabular-nums">
                  <thead className="bg-[var(--surface)] text-left text-xs text-[var(--muted-foreground)]">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Fornecedor</th>
                      <th className="px-3 py-1.5 text-right font-medium">Último</th>
                      <th className="px-3 py-1.5 text-right font-medium">Menor</th>
                      <th className="px-3 py-1.5 text-right font-medium">Média</th>
                      <th className="px-3 py-1.5 text-right font-medium">Compras</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {porFornecedor.map((f) => (
                      <tr key={f.nome}>
                        <td className="px-3 py-1.5">
                          {f.nome}
                          {f.ultimo === menorUltimo && (
                            <span className="ml-1.5 rounded bg-[var(--ok-soft)] px-1.5 py-0.5 text-xs font-semibold text-[var(--ok-strong)]">
                              mais barato
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold whitespace-nowrap">
                          {formatMoney(f.ultimo)}
                        </td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatMoney(f.menor)}</td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{formatMoney(f.media)}</td>
                        <td className="px-3 py-1.5 text-right">{f.compras}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CartaoDeSecao>
        )}
        {pontos.length > 0 && (
          <CartaoDeSecao icone={History} titulo="Compras" frase="Da mais nova para a mais antiga.">
            <div className="-mx-4 -my-4">
              <ul className="divide-y divide-[var(--border)] text-sm md:hidden">
                {[...pontos].reverse().map((p, i, lista) => {
                  const anterior = lista[i + 1];
                  const v = anterior && anterior.preco > 0 ? ((p.preco - anterior.preco) / anterior.preco) * 100 : null;
                  return (
                    <li key={i} className="flex items-baseline gap-3 px-4 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{dia(p.data)}</span>
                        <span className="block text-xs text-[var(--muted-foreground)]">
                          {p.fornecedor ?? "compra antiga"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="num-display block font-semibold">{formatMoney(p.preco)}</span>
                        <span className="num-display block text-xs text-[var(--muted-foreground)]">
                          {v === null || v === 0 ? "—" : `${v > 0 ? "▲" : "▼"} ${pctTexto(Math.abs(v))}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className={`hidden overflow-x-auto md:block ${COLUNAS_NA_BORDA}`}>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-[var(--muted-foreground)]">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Data</th>
                      <th className="px-3 py-1.5 font-medium">Fornecedor</th>
                      <th className="px-3 py-1.5 text-right font-medium">Preço / {unidade}</th>
                      <th className="px-3 py-1.5 text-right font-medium">Variação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {[...pontos].reverse().map((p, i, lista) => {
                      const anterior = lista[i + 1];
                      const v = anterior && anterior.preco > 0 ? ((p.preco - anterior.preco) / anterior.preco) * 100 : null;
                      return (
                        <tr key={i}>
                          <td className="px-3 py-1.5 whitespace-nowrap">{dia(p.data)}</td>
                          <td className="px-3 py-1.5">
                            {p.fornecedor ?? <span className="text-[var(--muted-foreground)]">compra antiga</span>}
                          </td>
                          <td className="num-display px-3 py-1.5 text-right whitespace-nowrap">{formatMoney(p.preco)}</td>
                          <td className="num-display px-3 py-1.5 text-right whitespace-nowrap">
                            {v === null || v === 0 ? "—" : `${v > 0 ? "▲" : "▼"} ${pctTexto(Math.abs(v))}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </CartaoDeSecao>
        )}
      </div>
    );
  }

  const [recebidas, recebidasAntes] = await Promise.all([
    comprasRecebidas(agora.inicio, agora.fim),
    comprasRecebidas(anterior.inicio, anterior.fim),
  ]);
  const variacoes = variacoesDePreco(recebidas, recebidasAntes).filter((v) => Math.abs(v.variacao) >= 0.05);
  // Pelo que pesou em reais: 20% num tempero pesa menos que 5% na carne.
  const altas = variacoes
    .filter((v) => v.variacao > 0)
    .sort((a, b) => b.efeito - a.efeito)
    .slice(0, 15);
  const quedas = variacoes
    .filter((v) => v.variacao < 0)
    .sort((a, b) => a.efeito - b.efeito)
    .slice(0, 15);
  const produtosComCompra = new Set(recebidas.map((l) => l.produtoId)).size;

  const tabela = (icone: LucideIcon, titulo: string, linhas: VariacaoDePreco[]) => (
    <CartaoDeSecao icone={icone} titulo={titulo} frase="Do que mais pesou em reais ao que menos.">
      {linhas.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Nenhuma no período.</p>
      ) : (
        // De ponta a ponta do cartão, como a Lista: sem caixa dentro de caixa.
        <div className="-mx-4 -my-4">
          {/* Celular: o nome na linha inteira e os números embaixo; a tabela
              de cinco colunas não cabia e rolava para o lado. */}
          <ul className="divide-y divide-[var(--border)] md:hidden">
            {linhas.map((p) => (
              <li key={p.produtoId} className="px-4 py-2.5">
                <div className="flex items-baseline gap-3">
                  <Link
                    href={`/admin/compras/relatorios/precos?de=${de}&ate=${ate}&produto=${p.produtoId}`}
                    className="min-w-0 flex-1 font-medium leading-snug underline-offset-4 hover:underline"
                  >
                    {p.nome}
                  </Link>
                  <span className="num-display shrink-0 text-sm font-semibold">{setaPct(p.variacao)}</span>
                </div>
                <p className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-xs text-[var(--muted-foreground)]">
                  <span className="tabular-nums">
                    {formatMoney(p.antes)} → {formatMoney(p.agora)}/{UNIT_LABEL[p.unidade]}
                  </span>
                  <span className="tabular-nums">
                    pesou {p.efeito >= 0 ? "+" : "−"}
                    {formatMoney(Math.abs(p.efeito))}
                  </span>
                </p>
              </li>
            ))}
          </ul>
          <div className={`hidden overflow-x-auto md:block ${COLUNAS_NA_BORDA}`}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Produto</th>
                  <th className="px-3 py-1.5 text-right font-medium">Antes</th>
                  <th className="px-3 py-1.5 text-right font-medium">Agora</th>
                  <th className="px-3 py-1.5 text-right font-medium">Variação</th>
                  <th className="px-3 py-1.5 text-right font-medium">Pesou</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {linhas.map((p) => (
                  <tr key={p.produtoId}>
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/admin/compras/relatorios/precos?de=${de}&ate=${ate}&produto=${p.produtoId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {p.nome}
                      </Link>
                    </td>
                    <td className="num-display px-3 py-1.5 text-right whitespace-nowrap">
                      {formatMoney(p.antes)}/{UNIT_LABEL[p.unidade]}
                    </td>
                    <td className="num-display px-3 py-1.5 text-right whitespace-nowrap">
                      {formatMoney(p.agora)}/{UNIT_LABEL[p.unidade]}
                    </td>
                    <td className="num-display px-3 py-1.5 text-right whitespace-nowrap">{setaPct(p.variacao)}</td>
                    <td className="num-display px-3 py-1.5 text-right whitespace-nowrap">
                      {p.efeito >= 0 ? "+" : "−"}
                      {formatMoney(Math.abs(p.efeito))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </CartaoDeSecao>
  );

  return (
    <div className="space-y-5">
      <FiltroDePeriodo caminho="/admin/compras/relatorios/precos" de={de} ate={ate} hoje={hoje} busca={busca} />
      {/* A conta e o tamanho da lista, fora dos cartões, como a contagem das
          listas; a ordem ("do que mais pesou…") vai na frase de cada cartão. */}
      <p className="text-sm text-[var(--muted-foreground)]">
        Preço médio pago neste período contra o de {textoAnterior}.{" "}
        {produtosComCompra === 0
          ? "Nenhuma compra recebida neste período."
          : `${produtosComCompra} produtos comprados; entram os que também foram comprados antes.`}
      </p>
      {tabela(TrendingUp, "Maiores altas", altas)}
      {tabela(TrendingDown, "Maiores quedas", quedas)}
    </div>
  );
}
