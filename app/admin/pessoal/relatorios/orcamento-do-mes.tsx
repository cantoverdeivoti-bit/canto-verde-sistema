import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { contaDaMaoDeObra } from "@/lib/cmo-do-banco";
import { diasDoMes } from "@/lib/cmo-orcamento";
import { custoDaSemana, segundaDaSemana } from "@/lib/escala";
import { carregarSemana } from "@/lib/escala-do-banco";
import { formatMoney } from "@/lib/format";

const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const arred = (n: number) => Math.round(n * 100) / 100;

/** "2026-10" ± n meses. */
function outroMes(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * O orçamento do CMO num mês, semana a semana: a meta vezes o faturamento do
 * mês, dividido pelos dias, contra o custo da escala de cada dia (com
 * encargos e benefícios). A semana que vira o mês entra só com os dias dele.
 */
export async function OrcamentoDoMes({ mes, hoje }: { mes: string; hoje: string }) {
  const dias = Array.from({ length: diasDoMes(mes) }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
  const segundas = [...new Set(dias.map(segundaDaSemana))];
  const [conta, ...semanas] = await Promise.all([contaDaMaoDeObra(hoje, dias), ...segundas.map((s) => carregarSemana(s))]);

  const custoDe = new Map<string, number>();
  for (const { semana, postos, pessoas } of semanas) {
    const c = custoDaSemana(semana, postos, pessoas, conta.custos);
    semana.dias.forEach((d, i) => custoDe.set(d, c.porDia[i].total));
  }
  const orcamentoDe = new Map(dias.map((d, i) => [d, conta.orcamentos[i]]));
  const linhas = segundas.map((seg) => {
    const doMes = dias.filter((d) => segundaDaSemana(d) === seg);
    const orcamentos = doMes.map((d) => orcamentoDe.get(d) ?? null);
    const orcamento = orcamentos.every((o) => o !== null) ? arred(orcamentos.reduce((s, o) => s + o!, 0)) : null;
    const custo = arred(doMes.reduce((s, d) => s + (custoDe.get(d) ?? 0), 0));
    return { seg, de: doMes[0], ate: doMes[doMes.length - 1], orcamento, custo, atual: doMes.includes(hoje) };
  });
  const orcamento = linhas.every((l) => l.orcamento !== null) ? arred(linhas.reduce((s, l) => s + l.orcamento!, 0)) : null;
  const custo = arred(linhas.reduce((s, l) => s + l.custo, 0));
  const faturamento = conta.faturamentoDe(mes);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-label">Orçamento do CMO · {MES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}</h2>
        <div className="flex items-center gap-1">
          <Link
            href={`/admin/pessoal/relatorios?mes=${outroMes(mes, -1)}`}
            aria-label="Mês anterior"
            className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]"
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
          <Link
            href={`/admin/pessoal/relatorios?mes=${outroMes(mes, 1)}`}
            aria-label="Próximo mês"
            className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]"
          >
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>

      {orcamento === null ? (
        <p className="msg-warn text-sm">
          {conta.meta === null
            ? "Sem meta do CMO: defina a meta abaixo, em CMO x faturamento, para ter o orçamento."
            : "Sem faturamento para este mês: digite o faturamento abaixo, em CMO x faturamento."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Cartao rotulo="Orçamento" valor={formatMoney(orcamento)} />
          <Cartao rotulo="Escala do mês" valor={formatMoney(custo)} />
          <Cartao
            rotulo={custo <= orcamento ? "Sobra" : "Passa"}
            valor={formatMoney(Math.abs(arred(orcamento - custo)))}
            cor={custo <= orcamento ? "var(--ok-strong)" : "var(--destructive)"}
          />
        </div>
      )}
      {orcamento !== null && faturamento !== null && (
        <p className="hint">
          Meta de {conta.meta!.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% sobre {formatMoney(faturamento)} de faturamento
          {conta.digitado(mes) ? " (digitado)" : " (média dos últimos meses)"}.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-2 py-2 sm:px-3 font-medium">Semana</th>
              <th className="px-2 py-2 text-right font-medium">Orçamento</th>
              <th className="px-2 py-2 text-right font-medium">Escala</th>
              <th className="px-2 py-2 sm:px-3 text-right font-medium">Sobra</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {linhas.map((l) => {
              const sobra = l.orcamento === null ? null : arred(l.orcamento - l.custo);
              return (
                <tr key={l.seg} className={l.atual ? "bg-[var(--primary-soft)]" : undefined}>
                  <td className="px-2 py-2 whitespace-nowrap sm:px-3">
                    <Link href={`/admin/pessoal?semana=${l.seg}`} className="underline-offset-4 hover:underline">
                      {l.de.slice(8, 10)} a {ddmm(l.ate)}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.orcamento === null ? "—" : formatMoney(l.orcamento)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatMoney(l.custo)}</td>
                  <td
                    className="px-2 py-2 sm:px-3 text-right font-semibold tabular-nums"
                    style={sobra === null ? undefined : { color: sobra >= 0 ? "var(--ok-strong)" : "var(--destructive)" }}
                  >
                    {sobra === null ? "—" : sobra >= 0 ? formatMoney(sobra) : `−${formatMoney(-sobra)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Cartao({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-2 py-2 sm:px-3.5">
      <p className="text-xs text-[var(--muted-foreground)]">{rotulo}</p>
      <p className="font-semibold tabular-nums" style={cor ? { color: cor } : undefined}>
        {valor}
      </p>
    </div>
  );
}
