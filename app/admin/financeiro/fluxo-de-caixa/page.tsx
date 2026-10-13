import Link from "next/link";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { todayInTimezone } from "@/lib/availability";
import { agruparPorSemana, pontoMaisBaixo, somar, somarDias } from "@/lib/financeiro-calculo";
import { fluxoDoPeriodo, gerarRecorrenciasDoDia } from "@/lib/financeiro-dados";
import { FUSO_DA_CASA, formatDiaCurtoString, formatMoney } from "@/lib/format";

import { Numero } from "../_comum/numero";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fluxo de caixa · Financeiro" };

const PRAZOS = [30, 60, 90] as const;

/** "segunda, 05/10" vira "seg 05/10": cabe na coluna estreita do celular. */
const diaCurto = (iso: string) => {
  const [semana, data] = formatDiaCurtoString(iso).split(", ");
  return `${semana.slice(0, 3)} ${data}`;
};

/**
 * O valor da tabela. No celular sai o "R$": as quatro colunas só cabem em
 * 390 px sem ele, e o cabeçalho já diz que é dinheiro.
 */
function Dinheiro({ valor }: { valor: number }) {
  const numero = Math.abs(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <>
      {valor < 0 ? "-" : ""}
      <span className="max-sm:hidden">R$&nbsp;</span>
      {numero}
    </>
  );
}

/**
 * Quanto vai ter em caixa nos próximos dias, somando o que está para entrar
 * e para sair. A última semana aparece como foi; dali em diante, como deve
 * ser. É a tela que responde "dá para pagar isso na sexta?".
 */
export default async function FluxoDeCaixaPage({ searchParams }: PageProps<"/admin/financeiro/fluxo-de-caixa">) {
  const q = await searchParams;
  const hoje = todayInTimezone(FUSO_DA_CASA);
  const dias = PRAZOS.find((p) => String(p) === q.dias) ?? 30;
  const porSemana = q.ver === "semana" || (q.ver !== "dia" && dias > 30);
  await gerarRecorrenciasDoDia(hoje);

  const de = somarDias(hoje, -7);
  const fluxo = await fluxoDoPeriodo(de, somarDias(hoje, dias), hoje);
  const futuro = fluxo.filter((d) => d.data >= hoje);
  const baixo = pontoMaisBaixo(futuro);
  const saldoHoje = fluxo.find((d) => d.data === hoje)?.saldo ?? 0;
  const final = fluxo[fluxo.length - 1]?.saldo ?? 0;
  const link = (d: number, ver: "dia" | "semana") => `/admin/financeiro/fluxo-de-caixa?dias=${d}&ver=${ver}`;

  const linhas = porSemana
    ? agruparPorSemana(fluxo).map((s) => ({
        chave: s.de,
        rotulo: `${formatDiaCurtoString(s.de).split(", ")[1]} a ${formatDiaCurtoString(s.ate).split(", ")[1]}`,
        entradas: s.entradas,
        saidas: s.saidas,
        saldo: s.saldo,
        previsto: s.previsto,
        hoje: s.de <= hoje && hoje <= s.ate,
      }))
    : fluxo.map((d) => ({
        chave: d.data,
        rotulo: d.data === hoje ? "hoje" : diaCurto(d.data),
        entradas: d.entradas,
        saidas: d.saidas,
        saldo: d.saldo,
        previsto: d.previsto,
        hoje: d.data === hoje,
      }));

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo="Fluxo de caixa"
        subtitulo="Quanto vai ter em caixa nos próximos dias."
        ajuda="Até hoje, o que foi baixado; depois de hoje (em cinza), o que está em aberto pelo vencimento. Conta vencida e não paga entra em hoje. Recebível de cartão entra já sem a taxa. Transferência entre contas da casa não muda o total."
      />
      <nav aria-label="Período" className="flex flex-wrap gap-1.5">
        {PRAZOS.map((p) => (
          <Link key={p} href={link(p, porSemana ? "semana" : "dia")} aria-current={p === dias ? "page" : undefined} className={`chip px-3 py-1.5 text-sm ${p === dias ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--surface)]" : ""}`}>
            {p} dias
          </Link>
        ))}
        <Link href={link(dias, porSemana ? "dia" : "semana")} className="chip px-3 py-1.5 text-sm">
          {porSemana ? "ver por dia" : "ver por semana"}
        </Link>
      </nav>

      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Saldo hoje" valor={formatMoney(saldoHoje)} tom={saldoHoje < 0 ? "alerta" : undefined} />
        <Numero rotulo={`Entra em ${dias} dias`} valor={formatMoney(somar(futuro.filter((d) => d.data > hoje).map((d) => d.entradas)))} />
        <Numero rotulo={`Sai em ${dias} dias`} valor={formatMoney(somar(futuro.filter((d) => d.data > hoje).map((d) => d.saidas)))} />
        <Numero rotulo={`Saldo em ${dias} dias`} valor={formatMoney(final)} tom={final < 0 ? "alerta" : undefined} />
      </section>

      {baixo && baixo.saldo < 0 && (
        <p className="msg-error">
          O caixa fica negativo em {formatDiaCurtoString(baixo.data)}: {formatMoney(baixo.saldo)}. Dá tempo de adiar uma conta ou antecipar um recebimento.
        </p>
      )}

      {/* No celular, letra menor e menos folga: as quatro colunas cabem em
          390 px, e o saldo, que é a coluna que importa, não some para o lado.
          A rolagem fica só como rede. */}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-xs sm:min-w-[28rem] sm:text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
              <th className="px-2 py-2 font-medium sm:px-3">{porSemana ? "Semana" : "Dia"}</th>
              <th className="px-2 py-2 text-right font-medium sm:px-3">Entradas</th>
              <th className="px-2 py-2 text-right font-medium sm:px-3">Saídas</th>
              <th className="px-2 py-2 text-right font-medium sm:px-3">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr
                key={l.chave}
                className={`border-b border-[var(--border)] last:border-0 ${l.previsto ? "text-[var(--muted-foreground)]" : ""} ${l.hoje ? "bg-[var(--muted)] font-semibold" : ""}`}
              >
                <td className="whitespace-nowrap px-2 py-2 sm:px-3">{l.rotulo}</td>
                <td className="num-display whitespace-nowrap px-2 py-2 text-right sm:px-3">{l.entradas > 0 ? <Dinheiro valor={l.entradas} /> : ""}</td>
                <td className="num-display whitespace-nowrap px-2 py-2 text-right sm:px-3">{l.saidas > 0 ? <Dinheiro valor={l.saidas} /> : ""}</td>
                <td className="num-display whitespace-nowrap px-2 py-2 text-right sm:px-3" style={l.saldo < 0 ? { color: "var(--destructive)" } : undefined}>
                  <Dinheiro valor={l.saldo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
