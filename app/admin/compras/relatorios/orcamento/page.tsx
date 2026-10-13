import { CalendarRange, Wallet } from "lucide-react";

import { CartaoDeSecao } from "@/components/pagina";
import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { formatMoney } from "@/lib/format";
import { orcamentosSemanais } from "@/lib/orcamento";
import { compararSemana, totaisDoComparativo, type SemanaComparada } from "@/lib/orcamento-comparativo";
import { periodoDaPagina } from "@/lib/periodo-da-pagina";

import { COLUNAS_NA_BORDA, pctTexto } from "../pecas";
import { FiltroDePeriodo } from "../periodo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Orçamento — Relatórios" };

/** "2026-09-21" → "21/09". */
const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** Verde dentro (ou igual), vermelho acima. Sem um dos dois, sem cor. */
const corDoLimite = (valor: number | null, limite: number | null) =>
  valor === null || limite === null ? undefined : valor <= limite ? "var(--ok-strong)" : "var(--destructive)";

/**
 * Orçamento × pedido × recebido, semana a semana, e o CMV pelas compras. A
 * pergunta é "o que eu recebi ficou dentro do orçamento?": o orçamento é o
 * faturamento da semana anterior × a meta de CMV; o pedido, o que foi pedido
 * na semana; o recebido, o que chegou, pelo preço pago. O CMV pelas compras é
 * o recebido sobre o faturamento da própria semana, e sai sem contagem.
 */
export default async function OrcamentoPage({ searchParams }: PageProps<"/admin/compras/relatorios/orcamento">) {
  await guardModule("compras");
  const [{ capacity }, q] = await Promise.all([getSettings(), searchParams]);
  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  const { de, ate } = periodoDaPagina("/admin/compras/relatorios/orcamento", q, hoje);
  const semanas = (await orcamentosSemanais(de, ate, tz)).map(compararSemana);
  const t = totaisDoComparativo(semanas);
  const usoDoOrcamento = t.orcamento ? (t.recebidoComOrcamento / t.orcamento) * 100 : null;

  return (
    <div className="space-y-5">
      <FiltroDePeriodo caminho="/admin/compras/relatorios/orcamento" de={de} ate={ate} hoje={hoje} />

      {/* O período inteiro, em quatro números. */}
      <CartaoDeSecao icone={Wallet} titulo="Resumo do período" frase="O que chegou contra o orçamento das semanas.">
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 xl:grid-cols-4">
          <Numero rotulo="Orçamento" valor={t.orcamento === null ? "—" : formatMoney(t.orcamento)} />
          <Numero
            rotulo="Pedido"
            valor={formatMoney(t.pedido)}
            detalhe={t.orcamento ? `${pctTexto((t.pedido / t.orcamento) * 100)} do orçamento` : undefined}
          />
          <Numero
            rotulo="Recebido"
            valor={formatMoney(t.recebido)}
            cor={corDoLimite(t.recebidoComOrcamento, t.orcamento)}
            detalhe={usoDoOrcamento === null ? undefined : `${pctTexto(usoDoOrcamento)} do orçamento`}
            barra={usoDoOrcamento}
          />
          <Numero
            rotulo="CMV pelas compras"
            valor={t.cmvCompras === null ? "—" : pctTexto(t.cmvCompras)}
            cor={corDoLimite(t.cmvCompras, t.metaCmv)}
            detalhe={t.metaCmv === null ? "sem faturamento digitado" : `meta ${pctTexto(t.metaCmv)}`}
          />
        </div>

        {t.sobra !== null && (
          <p
            className="rounded-lg px-3 py-2 text-sm font-semibold"
            style={{
              color: t.sobra >= 0 ? "var(--ok-strong)" : "var(--destructive)",
              background: t.sobra >= 0 ? "var(--ok-soft)" : "var(--danger-soft)",
            }}
          >
            {t.sobra >= 0
              ? `Recebido dentro do orçamento: sobrou ${formatMoney(t.sobra)}.`
              : `Recebido acima do orçamento: estourou ${formatMoney(-t.sobra)}.`}
            {t.cmvPedido !== null && (
              <span className="font-normal">
                {" "}
                Pelo pedido, o CMV daria {pctTexto(t.cmvPedido)}.
              </span>
            )}
          </p>
        )}
      </CartaoDeSecao>

      <CartaoDeSecao icone={CalendarRange} titulo="Semana a semana" frase="O recebido de cada semana contra o orçamento dela.">
        {semanas.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Nenhuma semana no período.</p>
        ) : (
          // De ponta a ponta do cartão, colada no título e fechada por um fio
          // antes da explicação: uma caixa com borda aqui seria cartão no cartão.
          <div className="-mx-4 -mt-4 border-b border-[var(--border)]">
            <SemanasNoCelular semanas={semanas} />
            <SemanasNaTabela semanas={semanas} />
          </div>
        )}

        <p className="hint">
          Orçamento = faturamento da semana anterior × meta de CMV. Pedido é o que foi pedido na semana (sem preço,
          pelo último custo); recebido é o que chegou na semana, pelo preço pago. CMV pelas compras = recebido ÷
          faturamento da mesma semana, que é digitado na segunda seguinte: até lá, a semana fica sem CMV. O CMV pelo
          consumo (contagem inicial + entradas − contagem final) aparece quando há duas contagens na semana.
        </p>
      </CartaoDeSecao>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  detalhe,
  cor,
  barra,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  cor?: string;
  /** % de uso, para a barra embaixo (verde até 100, vermelho acima). */
  barra?: number | null;
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-lg px-3 py-3"
      style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)" }}
    >
      <span className="text-xs font-medium text-[var(--muted-foreground)]">{rotulo}</span>
      <span className="num-display text-2xl leading-none" style={{ color: cor ?? "var(--primary)" }}>
        {valor}
      </span>
      {barra !== undefined && barra !== null && <Barra pct={barra} />}
      {detalhe && <span className="text-xs text-[var(--muted-foreground)]">{detalhe}</span>}
    </div>
  );
}

function Barra({ pct }: { pct: number }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? "var(--destructive)" : "var(--ok-strong)" }}
      />
    </span>
  );
}

const sinal = (n: number, dinheiro: (v: number) => string = formatMoney) =>
  `${n > 0 ? "+" : n < 0 ? "−" : ""}${dinheiro(Math.abs(n))}`;
/** Na tabela o "R$" fica só no título, para as colunas caberem. */
const reais = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Celular: um cartão por semana. */
function SemanasNoCelular({ semanas }: { semanas: SemanaComparada[] }) {
  return (
    <ul className="divide-y divide-[var(--border)] text-sm tabular-nums md:hidden">
      {semanas.map((s) => {
        const uso = s.orcamento ? (s.recebido / s.orcamento) * 100 : null;
        return (
          <li key={s.semana} className="space-y-1.5 px-4 py-2.5">
            <div className="flex items-center gap-3">
              <p className="min-w-0 flex-1 font-semibold">Semana de {diaMes(s.semana)}</p>
              <Sobra sobra={s.sobra} />
            </div>
            {uso !== null && <Barra pct={uso} />}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-[var(--muted-foreground)]">Orçamento</dt>
              <dd className="text-right">{s.orcamento === null ? "—" : formatMoney(s.orcamento)}</dd>
              <dt className="text-[var(--muted-foreground)]">Pedido</dt>
              <dd className="text-right">{formatMoney(s.pedido)}</dd>
              <dt className="text-[var(--muted-foreground)]">Recebido</dt>
              <dd className="text-right font-medium" style={{ color: corDoLimite(s.recebido, s.orcamento) }}>
                {formatMoney(s.recebido)}
                {uso !== null && <span className="font-normal text-[var(--muted-foreground)]"> ({pctTexto(uso)})</span>}
              </dd>
              <dt className="text-[var(--muted-foreground)]">Recebido − pedido</dt>
              <dd className="text-right">{sinal(s.diferenca)}</dd>
              <dt className="text-[var(--muted-foreground)]">Faturamento</dt>
              <dd className="text-right">{s.faturamentoDaSemana ? formatMoney(s.faturamentoDaSemana) : "—"}</dd>
              <dt className="text-[var(--muted-foreground)]">CMV compras (meta)</dt>
              <dd className="text-right font-medium" style={{ color: corDoLimite(s.cmvCompras, s.metaCmv) }}>
                {s.cmvCompras === null ? "—" : pctTexto(s.cmvCompras)}
                <span className="font-normal text-[var(--muted-foreground)]">
                  {" "}
                  ({s.metaCmv === null ? "—" : pctTexto(s.metaCmv)})
                </span>
              </dd>
              <dt className="text-[var(--muted-foreground)]">CMV pelo pedido</dt>
              <dd className="text-right">{s.cmvPedido === null ? "—" : pctTexto(s.cmvPedido)}</dd>
              {s.cmvReal !== null && (
                <>
                  <dt className="text-[var(--muted-foreground)]">CMV pelo consumo</dt>
                  <dd className="text-right">{pctTexto(s.cmvReal)}</dd>
                </>
              )}
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

function Sobra({ sobra }: { sobra: number | null }) {
  if (sobra === null) return <span className="text-xs text-[var(--muted-foreground)]">sem orçamento</span>;
  return (
    <span
      className="selo shrink-0"
      style={
        sobra >= 0
          ? { color: "var(--ok-strong)", background: "var(--ok-soft)" }
          : { color: "var(--destructive)", background: "var(--danger-soft)" }
      }
    >
      {sobra >= 0 ? `sobrou ${formatMoney(sobra)}` : `estourou ${formatMoney(-sobra)}`}
    </span>
  );
}

/** Computador: a tabela inteira. */
function SemanasNaTabela({ semanas }: { semanas: SemanaComparada[] }) {
  return (
    <div className={`hidden overflow-x-auto md:block ${COLUNAS_NA_BORDA}`}>
      <table className="w-full min-w-[42rem] text-sm tabular-nums">
        <thead className="bg-[var(--surface)] text-xs text-[var(--muted-foreground)]">
          <tr className="text-right">
            <th className="px-2.5 py-2 text-left font-medium">Semana</th>
            <th className="px-2.5 py-2 font-medium">Orçamento (R$)</th>
            <th className="px-2.5 py-2 font-medium">Pedido</th>
            <th className="px-2.5 py-2 font-medium">Recebido</th>
            <th className="px-2.5 py-2 font-medium">Receb. − pedido</th>
            <th className="px-2.5 py-2 font-medium">Sobra</th>
            <th className="px-2.5 py-2 font-medium">Faturamento</th>
            <th className="px-2.5 py-2 font-medium">CMV compras</th>
            <th className="px-2.5 py-2 font-medium">CMV pedido</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)] whitespace-nowrap">
          {semanas.map((s) => {
            const uso = s.orcamento ? (s.recebido / s.orcamento) * 100 : null;
            return (
              <tr key={s.semana} className="text-right">
                <td className="px-2.5 py-2 text-left whitespace-nowrap">{diaMes(s.semana)}</td>
                <td className="px-2.5 py-2">{s.orcamento === null ? "—" : reais(s.orcamento)}</td>
                <td className="px-2.5 py-2">{reais(s.pedido)}</td>
                <td className="px-2.5 py-2">
                  <span className="font-medium" style={{ color: corDoLimite(s.recebido, s.orcamento) }}>
                    {reais(s.recebido)}
                  </span>
                  {uso !== null && <span className="block text-xs text-[var(--muted-foreground)]">{pctTexto(uso)}</span>}
                </td>
                <td className="px-2.5 py-2">{sinal(s.diferenca, reais)}</td>
                <td
                  className="px-2.5 py-2 font-medium"
                  style={{ color: s.sobra === null ? undefined : s.sobra >= 0 ? "var(--ok-strong)" : "var(--destructive)" }}
                >
                  {s.sobra === null ? "—" : sinal(s.sobra, reais)}
                </td>
                <td className="px-2.5 py-2">{s.faturamentoDaSemana ? reais(s.faturamentoDaSemana) : "—"}</td>
                <td className="px-2.5 py-2 font-medium" style={{ color: corDoLimite(s.cmvCompras, s.metaCmv) }}>
                  {s.cmvCompras === null ? "—" : pctTexto(s.cmvCompras)}
                  {s.metaCmv !== null && (
                    <span className="block text-xs font-normal text-[var(--muted-foreground)]">meta {pctTexto(s.metaCmv)}</span>
                  )}
                </td>
                <td className="px-2.5 py-2">{s.cmvPedido === null ? "—" : pctTexto(s.cmvPedido)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
