import { Calculator, Scale } from "lucide-react";
import Link from "next/link";

import { CartaoDeSecao } from "@/components/pagina";
import { SelectQueEnvia } from "@/components/select-que-envia";
import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { UNIT_LABEL, formatAmount, formatMoney, plural } from "@/lib/format";
import { ultimoCustoPorProduto } from "@/lib/historico";
import { atalhosDePeriodo } from "@/lib/periodo";
import { periodoDaPagina } from "@/lib/periodo-da-pagina";
import { balancoDeEstoque, instantesDoPeriodo } from "@/lib/relatorios-compras";

import { COLUNAS_NA_BORDA, NumeroGrande } from "../pecas";
import { FiltroDePeriodo } from "../periodo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Balanço — Relatórios" };

function texto(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

/**
 * Contagem inicial + entradas − contagem final = consumo, produto a produto.
 *
 * É o consumo de verdade: o que saiu da despensa entre duas contagens, e não
 * o que foi comprado. O custo é o consumo pelo último preço pago de cada item.
 */
export default async function BalancoPage({ searchParams }: PageProps<"/admin/compras/relatorios/balanco">) {
  await guardModule("compras");
  const { capacity } = await getSettings();
  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  const q = await searchParams;
  // Sem período escolhido, 90 dias: balanço precisa de duas contagens, e o
  // mês corrente no dia 2 não tem nenhuma.
  const noventa = atalhosDePeriodo(hoje).find((a) => a.chave === "90")!;
  const { de, ate } = periodoDaPagina("/admin/compras/relatorios/balanco", q, hoje, {
    de: noventa.de,
    ate: noventa.ate,
  });
  const categoria = texto(q.categoria);
  const { inicio, fim } = instantesDoPeriodo(de, ate, tz);

  const { linhas, umaContagem } = await balancoDeEstoque(inicio, fim);
  const custos = await ultimoCustoPorProduto(linhas.map((l) => l.produtoId));
  const comCusto = linhas.map((l) => {
    const preco = custos.get(l.produtoId)?.valor ?? null;
    return { ...l, custo: preco === null ? null : Math.max(l.consumo, 0) * preco };
  });
  const categorias = [...new Set(comCusto.map((l) => l.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const visiveis = comCusto
    .filter((l) => !categoria || l.categoria === categoria)
    .sort((a, b) => (b.custo ?? -1) - (a.custo ?? -1) || b.consumo - a.consumo);

  const custoTotal = visiveis.reduce((s, l) => s + (l.custo ?? 0), 0);
  const naoFecham = visiveis.filter((l) => l.consumo < 0).length;
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: tz });
  const extras: Record<string, string> = categoria ? { categoria } : {};

  return (
    <div className="space-y-5">
      {/* O cartão de busca: o período e, embaixo, a categoria, que filtra ao
          trocar (sem botão de Filtrar). */}
      <FiltroDePeriodo caminho="/admin/compras/relatorios/balanco" de={de} ate={ate} hoje={hoje} extras={extras}>
        <form method="get">
          <input type="hidden" name="de" value={de} />
          <input type="hidden" name="ate" value={ate} />
          <SelectQueEnvia
            name="categoria"
            rotulo="Categoria"
            atual={categoria}
            opcoes={[{ valor: "", texto: "Todas as categorias" }, ...categorias.map((c) => ({ valor: c, texto: c }))]}
          />
        </form>
      </FiltroDePeriodo>

      <CartaoDeSecao icone={Calculator} titulo="Resumo" frase="O consumo de verdade, entre a primeira e a última contagem.">
        <div className="grid gap-3 sm:grid-cols-3">
          <NumeroGrande rotulo="Custo do consumo" valor={formatMoney(custoTotal)} detalhe="pelo último preço pago" />
          <NumeroGrande rotulo="Produtos no balanço" valor={String(visiveis.length)} detalhe="com duas contagens ou mais" />
          <NumeroGrande
            rotulo="Contas que não fecham"
            valor={String(naoFecham)}
            detalhe={naoFecham > 0 ? "consumo negativo: conferir" : "nenhuma"}
          />
        </div>
      </CartaoDeSecao>

      <CartaoDeSecao icone={Scale} titulo="Consumo por produto" frase="Inicial + entradas − final = consumo.">
        {visiveis.length === 0 ? (
          <p className="msg-warn">
            Nenhum produto com duas contagens neste período. O balanço precisa de uma contagem no
            começo e outra no fim. Escolha um período maior.
          </p>
        ) : (
          // De ponta a ponta do cartão, colada no título e fechada por um fio
          // antes das explicações: uma caixa com borda aqui seria cartão no cartão.
          <div className="-mx-4 -mt-4 border-b border-[var(--border)]">
            {/* Celular: o produto e o consumo em cima, a conta embaixo. A tabela
                de seis colunas rolava para o lado. */}
            <ul className="divide-y divide-[var(--border)] text-sm md:hidden">
              {visiveis.map((l) => {
                const un = UNIT_LABEL[l.unidade];
                return (
                  <li key={l.produtoId} className={`px-4 py-2.5 ${l.consumo < 0 ? "bg-[var(--danger-soft)]" : ""}`}>
                    <div className="flex items-baseline gap-3">
                      <Link
                        href={`/admin/compras/relatorios/estoque?produto=${l.produtoId}&de=${de}&ate=${ate}`}
                        className="min-w-0 flex-1 font-medium leading-snug underline-offset-4 hover:underline"
                      >
                        {l.nome}
                      </Link>
                      <span className="num-display shrink-0 font-semibold">
                        {formatAmount(l.consumo)} {un}
                      </span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap justify-between gap-x-3 text-xs text-[var(--muted-foreground)]">
                      <span className="tabular-nums">
                        {formatAmount(l.inicial)} ({dia(l.inicialEm)}) + {formatAmount(l.entradas)} −{" "}
                        {formatAmount(l.final)} ({dia(l.finalEm)})
                      </span>
                      <span className="tabular-nums">{l.custo === null ? "—" : formatMoney(l.custo)}</span>
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">{l.categoria}</p>
                  </li>
                );
              })}
            </ul>
            <div className={`hidden overflow-x-auto md:block ${COLUNAS_NA_BORDA}`}>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Produto</th>
                    <th className="px-2 py-1.5 text-right font-medium">Inicial</th>
                    <th className="px-2 py-1.5 text-right font-medium">+ Entradas</th>
                    <th className="px-2 py-1.5 text-right font-medium">− Final</th>
                    <th className="px-2 py-1.5 text-right font-medium">= Consumo</th>
                    <th className="px-2 py-1.5 text-right font-medium">Custo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {visiveis.map((l) => (
                    <tr key={l.produtoId} className={l.consumo < 0 ? "bg-[var(--danger-soft)]" : ""}>
                      <td className="px-2 py-1.5">
                        <Link
                          href={`/admin/compras/relatorios/estoque?produto=${l.produtoId}&de=${de}&ate=${ate}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {l.nome}
                        </Link>
                        <span className="block text-xs text-[var(--muted-foreground)]">{l.categoria}</span>
                      </td>
                      <td className="num-display px-2 py-1.5 text-right whitespace-nowrap">
                        {formatAmount(l.inicial)}
                        <span className="block text-[10px] text-[var(--muted-foreground)]">{dia(l.inicialEm)}</span>
                      </td>
                      <td className="num-display px-2 py-1.5 text-right whitespace-nowrap">{formatAmount(l.entradas)}</td>
                      <td className="num-display px-2 py-1.5 text-right whitespace-nowrap">
                        {formatAmount(l.final)}
                        <span className="block text-[10px] text-[var(--muted-foreground)]">{dia(l.finalEm)}</span>
                      </td>
                      <td className="num-display px-2 py-1.5 text-right font-semibold whitespace-nowrap">
                        {formatAmount(l.consumo)} {UNIT_LABEL[l.unidade]}
                      </td>
                      <td className="num-display px-2 py-1.5 text-right whitespace-nowrap">
                        {l.custo === null ? "—" : formatMoney(l.custo)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* A conta em si está na frase do cartão; aqui, de onde vem cada parte. */}
        <p className="hint">
          Inicial e final são a primeira e a última contagem do produto no período; entradas, o que foi
          recebido entre elas.
          {umaContagem.length > 0 && (
            <>
              {" "}
              {plural(umaContagem.length, "produto teve", "produtos tiveram")} só uma contagem no período e
              ficaram fora do balanço.
            </>
          )}
        </p>
      </CartaoDeSecao>
    </div>
  );
}
