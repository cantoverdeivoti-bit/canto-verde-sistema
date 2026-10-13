import { ChartColumn, Truck } from "lucide-react";

import { CartaoDeSecao } from "@/components/pagina";
import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { formatMoney, plural } from "@/lib/format";
import { periodoDaPagina } from "@/lib/periodo-da-pagina";
import {
  desempenhoDosFornecedores,
  extrasDosFornecedores,
  instantesDoPeriodo,
  type DesempenhoDoFornecedor,
  type ExtrasDoFornecedor,
} from "@/lib/relatorios-compras";

import { Barras, COLUNAS_NA_BORDA, pctTexto } from "../pecas";
import { FiltroDePeriodo } from "../periodo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fornecedores — Relatórios" };

/** "3 faltas · 1 avaria", ou nulo sem problema nenhum. */
function problemas(d: DesempenhoDoFornecedor): string | null {
  const partes = [
    d.naoEntregue > 0 && plural(d.naoEntregue, "não entregue", "não entregues"),
    d.falta > 0 && plural(d.falta, "falta", "faltas"),
    d.devolvido > 0 && plural(d.devolvido, "devolvido", "devolvidos"),
    d.avaria > 0 && plural(d.avaria, "avaria", "avarias"),
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** "★ 4,2 (7)" ou nulo sem avaliação. */
function estrelasTexto(e: ExtrasDoFornecedor | undefined): string | null {
  if (!e?.estrelas) return null;
  return `★ ${e.estrelas.media.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} (${e.estrelas.n})`;
}

/** "8%" dos itens pedidos que ele avisou em falta, ou nulo sem pedido. */
function faltaTexto(e: ExtrasDoFornecedor | undefined): string | null {
  if (!e || e.itensPedidos === 0) return null;
  return pctTexto((e.itensEmFalta / e.itensPedidos) * 100);
}

/** "5 h" ou "2 dias", ou nulo sem cotação respondida. */
function respostaTexto(e: ExtrasDoFornecedor | undefined): string | null {
  if (!e || e.respostaHoras === null) return null;
  if (e.respostaHoras < 48) return `${Math.max(1, Math.round(e.respostaHoras))} h`;
  return `${Math.round(e.respostaHoras / 24)} dias`;
}

/**
 * Como cada fornecedor atendeu no período: quanto a casa gastou com ele, se
 * entregou no dia prometido, o que veio com falta, devolução ou avaria, e se
 * cobrou diferente do combinado. É a régua para decidir de quem continuar
 * comprando — o preço da cotação sozinho não mostra quem atrasa ou falha.
 *
 * Vermelho só onde há problema; o resto fica na cor do texto.
 */
export default async function FornecedoresRelatorioPage({
  searchParams,
}: PageProps<"/admin/compras/relatorios/fornecedores">) {
  await guardModule("compras");
  const { capacity } = await getSettings();
  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  const q = await searchParams;
  const { de, ate } = periodoDaPagina("/admin/compras/relatorios/fornecedores", q, hoje);
  const { inicio, fim } = instantesDoPeriodo(de, ate, tz);
  const [linhas, extras] = await Promise.all([desempenhoDosFornecedores(inicio, fim, tz), extrasDosFornecedores(inicio, fim)]);

  const vermelho = { color: "var(--destructive)" } as const;
  const totalGasto = linhas.reduce((s, d) => s + d.gasto, 0);

  return (
    <div className="space-y-5">
      <FiltroDePeriodo caminho="/admin/compras/relatorios/fornecedores" de={de} ate={ate} hoje={hoje} />

      {linhas.length === 0 ? (
        <p className="msg-warn">
          Nenhum pedido recebido neste período. O relatório conta o que chegou
          e foi conferido em Recebimentos.
        </p>
      ) : (
        <>
          {totalGasto > 0 && (
            <CartaoDeSecao icone={ChartColumn} titulo="Gasto por fornecedor" frase="O que chegou no período, pelo preço pago.">
              <Barras
                linhas={linhas
                  .filter((d) => d.gasto > 0)
                  .map((d) => {
                    const pct = (d.gasto / totalGasto) * 100;
                    const prazo = d.comPrevisao > 0 ? `${pctTexto((d.noPrazo / d.comPrevisao) * 100)} no prazo` : null;
                    return {
                      rotulo: d.nome,
                      pct,
                      valor: `${formatMoney(d.gasto)} · ${pctTexto(pct)}`,
                      dica: `${d.nome}: ${formatMoney(d.gasto)}, ${pctTexto(pct)} do gasto` + (prazo ? ` · ${prazo}` : ""),
                    };
                  })}
              />
            </CartaoDeSecao>
          )}

          <CartaoDeSecao icone={Truck} titulo="Desempenho" frase="Prazo, problemas e preço contra o combinado.">
            {/* De ponta a ponta do cartão, colada no título e fechada por um fio
                antes da explicação: cartões ou tabela com borda aqui dentro
                seriam caixa dentro de caixa. */}
            <div className="-mx-4 -mt-4 border-b border-[var(--border)]">
              {/* Celular: um bloco por fornecedor. */}
              <ul className="divide-y divide-[var(--border)] md:hidden">
                {linhas.map((d) => {
                  const prob = problemas(d);
                  return (
                    <li key={d.fornecedorId} className="px-4 py-3">
                      <div className="flex items-baseline gap-2">
                        <p className="min-w-0 flex-1 font-semibold">{d.nome}</p>
                        <p className="num-display shrink-0 font-semibold">{formatMoney(d.gasto)}</p>
                      </div>
                      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {d.pedidos === 0 ? "nada recebido" : plural(d.pedidos, "pedido recebido", "pedidos recebidos")}
                        {d.comPrevisao > 0 && (
                          <>
                            {" · "}
                            <span style={d.noPrazo < d.comPrevisao ? vermelho : undefined}>
                              {pctTexto((d.noPrazo / d.comPrevisao) * 100)} no prazo
                              {d.atrasoMedio !== null && ` (atraso médio ${String(d.atrasoMedio).replace(".", ",")} dia${d.atrasoMedio === 1 ? "" : "s"})`}
                              {d.semChegar > 0 && ` · ${plural(d.semChegar, "atrasado sem chegar", "atrasados sem chegar")}`}
                            </span>
                          </>
                        )}
                      </p>
                      {(() => {
                        const e = extras.get(d.fornecedorId);
                        const partes = [
                          estrelasTexto(e),
                          faltaTexto(e) && `${faltaTexto(e)} em falta`,
                          respostaTexto(e) && `responde em ${respostaTexto(e)}`,
                        ].filter(Boolean);
                        return (
                          <>
                            {partes.length > 0 && (
                              <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{partes.join(" · ")}</p>
                            )}
                            {e && e.creditos > 0 && (
                              <p className="mt-0.5 text-sm font-semibold" style={{ color: "var(--warn)" }}>
                                {formatMoney(e.creditos)} de crédito a receber
                              </p>
                            )}
                            {e && e.bonificacao > 0 && (
                              <p className="mt-0.5 text-sm" style={{ color: "var(--ok-strong)" }}>
                                {formatMoney(e.bonificacao)} em bonificação
                              </p>
                            )}
                          </>
                        );
                      })()}
                      {(prob || Math.abs(d.diferencaPreco) >= 0.01) && (
                        <p className="mt-0.5 text-sm">
                          {prob && <span style={vermelho}>{prob}</span>}
                          {prob && Math.abs(d.diferencaPreco) >= 0.01 && " · "}
                          {Math.abs(d.diferencaPreco) >= 0.01 && (
                            <span style={d.diferencaPreco > 0 ? vermelho : { color: "var(--ok-strong)" }}>
                              {d.diferencaPreco > 0 ? "pagou " : "economizou "}
                              {formatMoney(Math.abs(d.diferencaPreco))} {d.diferencaPreco > 0 ? "acima" : "abaixo"} do combinado
                            </span>
                          )}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Computador: tabela. */}
              <div className={`hidden overflow-x-auto md:block ${COLUNAS_NA_BORDA}`}>
                <table className="w-full text-sm tabular-nums">
                  <thead className="bg-[var(--surface)] text-xs text-[var(--muted-foreground)]">
                    <tr className="text-right">
                      <th className="px-3 py-2 text-left font-medium">Fornecedor</th>
                      <th className="px-3 py-2 font-medium">Gasto</th>
                      <th className="px-3 py-2 font-medium">Pedidos</th>
                      <th className="px-3 py-2 font-medium">No prazo</th>
                      <th className="px-3 py-2 font-medium">Atraso médio</th>
                      <th className="px-3 py-2 text-left font-medium">Problemas</th>
                      <th className="px-3 py-2 font-medium">Pago × combinado</th>
                      <th className="px-3 py-2 font-medium">Qualidade</th>
                      <th className="px-3 py-2 font-medium">Em falta</th>
                      <th className="px-3 py-2 font-medium">Responde em</th>
                      <th className="px-3 py-2 font-medium">Crédito</th>
                      <th className="px-3 py-2 font-medium">Bonificação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {linhas.map((d) => {
                      const prob = problemas(d);
                      return (
                        <tr key={d.fornecedorId} className="text-right">
                          <td className="px-3 py-2 text-left font-medium">{d.nome}</td>
                          <td className="px-3 py-2 font-semibold">{formatMoney(d.gasto)}</td>
                          <td className="px-3 py-2">{d.pedidos}</td>
                          <td className="px-3 py-2" style={d.comPrevisao > 0 && d.noPrazo < d.comPrevisao ? vermelho : undefined}>
                            {d.comPrevisao > 0 ? `${d.noPrazo} de ${d.comPrevisao}` : "—"}
                            {d.semChegar > 0 && (
                              <span className="block text-xs">{d.semChegar} sem chegar</span>
                            )}
                          </td>
                          <td className="px-3 py-2" style={d.atrasoMedio !== null ? vermelho : undefined}>
                            {d.atrasoMedio !== null
                              ? `${String(d.atrasoMedio).replace(".", ",")} dia${d.atrasoMedio === 1 ? "" : "s"}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-left" style={prob ? vermelho : undefined}>
                            {prob ?? "—"}
                          </td>
                          <td
                            className="px-3 py-2"
                            style={
                              d.diferencaPreco > 0.005
                                ? vermelho
                                : d.diferencaPreco < -0.005
                                  ? { color: "var(--ok-strong)" }
                                  : undefined
                            }
                          >
                            {Math.abs(d.diferencaPreco) >= 0.01
                              ? `${d.diferencaPreco > 0 ? "+" : "−"}${formatMoney(Math.abs(d.diferencaPreco))}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2">{estrelasTexto(extras.get(d.fornecedorId)) ?? "—"}</td>
                          <td className="px-3 py-2">{faltaTexto(extras.get(d.fornecedorId)) ?? "—"}</td>
                          <td className="px-3 py-2">{respostaTexto(extras.get(d.fornecedorId)) ?? "—"}</td>
                          <td
                            className="px-3 py-2"
                            style={(extras.get(d.fornecedorId)?.creditos ?? 0) > 0 ? { color: "var(--warn)" } : undefined}
                          >
                            {(extras.get(d.fornecedorId)?.creditos ?? 0) > 0
                              ? formatMoney(extras.get(d.fornecedorId)!.creditos)
                              : "—"}
                          </td>
                          <td
                            className="px-3 py-2"
                            style={(extras.get(d.fornecedorId)?.bonificacao ?? 0) > 0 ? { color: "var(--ok-strong)" } : undefined}
                          >
                            {(extras.get(d.fornecedorId)?.bonificacao ?? 0) > 0
                              ? formatMoney(extras.get(d.fornecedorId)!.bonificacao)
                              : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* O que cada coluna quer dizer, curto. O "gasto" já está na frase
                do cartão de cima. */}
            <p className="hint">
              No prazo: chegou até o dia previsto; passou do dia sem chegar é atraso. Pago × combinado: a nota
              contra o preço combinado. Qualidade: as estrelas do recebimento. Em falta: o que ele avisou não ter.
              Responde em: do convite da cotação à resposta. Crédito: combinado (em divergência ou bonificação) e
              ainda não abatido. Bonificação:
              mercadoria pelo último custo; desconto e crédito pelo valor combinado.
            </p>
          </CartaoDeSecao>
        </>
      )}
    </div>
  );
}
