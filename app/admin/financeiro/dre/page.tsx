import { Fragment } from "react";
import { Download } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { todayInTimezone } from "@/lib/availability";
import { mesCurto } from "@/lib/financeiro";
import { somarMeses, type LinhaDaDre } from "@/lib/financeiro-calculo";
import { centrosDeCusto, dreDoMes } from "@/lib/financeiro-dados";
import { FUSO_DA_CASA, formatMoney } from "@/lib/format";

import { mesDoEndereco, SeletorDeMes } from "../_comum/seletor-de-mes";

export const dynamic = "force-dynamic";
export const metadata = { title: "DRE · Financeiro" };

const pct = (n: number | null) => (n === null ? "" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

/**
 * O resultado do mês, de cima para baixo: o que vendeu, o que custou e o que
 * sobrou. Pela competência: a conta de luz de setembro entra em setembro,
 * mesmo paga em outubro. Ao lado, os dois meses anteriores para comparar;
 * no celular eles saem, e fica o mês escolhido com o % da receita.
 *
 * `?centro=` recorta um centro de custo (ou `sem`, o que ficou sem centro);
 * `?ver=centros` põe os centros lado a lado no mês escolhido.
 */
export default async function DrePage({ searchParams }: PageProps<"/admin/financeiro/dre">) {
  const q = await searchParams;
  const atual = todayInTimezone(FUSO_DA_CASA).slice(0, 7);
  const mes = mesDoEndereco(q.mes, atual);
  const meses = [somarMeses(mes, -2), somarMeses(mes, -1), mes];
  const porCentro = q.ver === "centros";
  // undefined = a casa toda; null = o que ficou sem centro. Os meses saem
  // junto com a lista de centros, pelo centro do endereço; só um id que não
  // existe (link velho) faz a conta de novo, para a casa toda.
  const pedido = q.centro === "sem" ? null : typeof q.centro === "string" && /^\d+$/.test(q.centro) ? Number(q.centro) : undefined;
  const [centros, dresPedidos] = await Promise.all([centrosDeCusto(), Promise.all(meses.map((m) => dreDoMes(m, pedido)))]);
  const escolhido = centros.find((c) => c.id === pedido);
  const centro = q.centro === "sem" ? null : escolhido?.id;
  const dres = centro === pedido ? dresPedidos : await Promise.all(meses.map((m) => dreDoMes(m, centro)));
  const [, , dre] = dres;
  const link = (extra: string) => `/admin/financeiro/dre?mes=${mes}${extra}`;
  const recortes = [
    { chave: "casa", nome: "Casa toda", href: link(""), ativo: !porCentro && centro === undefined },
    ...centros
      .filter((c) => c.ativo || c.id === escolhido?.id)
      .map((c) => ({ chave: String(c.id), nome: c.nome, href: link(`&centro=${c.id}`), ativo: !porCentro && centro === c.id })),
    { chave: "sem", nome: "Sem centro", href: link("&centro=sem"), ativo: !porCentro && centro === null },
    { chave: "lado", nome: "Por centro", href: link("&ver=centros"), ativo: porCentro },
  ];

  const valorEm = (i: number, chave: string) => dres[i].linhas.find((l) => l.chave === chave);
  const vazio = dres.every((d) => d.linhas.every((l) => l.valor === 0) && d.foraDoResultado.valor === 0);

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo="DRE"
        acoes={
          <Button asChild size="sm" className="gap-1.5">
            <a href={`/admin/financeiro/dre/planilha?mes=${mes}${centro === undefined ? "" : `&centro=${centro ?? "sem"}`}`}>
              <Download aria-hidden className="size-4" />
              Planilha
            </a>
          </Button>
        }
      />
      <SeletorDeMes caminho="/admin/financeiro/dre" mes={mes} atual={atual} />

      <nav aria-label="Centro de custo" className="flex flex-wrap gap-1.5">
        {recortes.map((r) => (
          <Link
            key={r.chave}
            href={r.href}
            aria-current={r.ativo ? "page" : undefined}
            className={`chip px-3 py-1.5 text-sm ${r.ativo ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--surface)]" : ""}`}
          >
            {r.nome}
          </Link>
        ))}
      </nav>

      {porCentro ? (
        <PorCentro mes={mes} centros={centros.filter((c) => c.ativo)} />
      ) : vazio ? (
        <Vazio>Nada lançado nestes meses. A DRE se monta sozinha com os fechamentos do dia e as contas a pagar.</Vazio>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full text-sm sm:min-w-[34rem]">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                <th className="px-3 py-2 text-left font-medium" />
                {meses.map((m, i) => (
                  <th key={m} className={`px-3 py-2 text-right font-medium ${i === 2 ? "text-[var(--foreground)]" : "hidden sm:table-cell"}`}>
                    {mesCurto(m)}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">% receita</th>
              </tr>
            </thead>
            <tbody>
              {dre.linhas.map((l) => (
                <Bloco key={l.chave} linha={l} anteriores={[valorEm(0, l.chave), valorEm(1, l.chave)]} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!porCentro && dre.foraDoResultado.categorias.length > 0 && (
        <section>
          <h2 className="section-label mb-2">Fora do resultado em {mesCurto(mes)}</h2>
          <Lista className="text-sm">
            {dre.foraDoResultado.categorias.map((c) => (
              <li key={`${c.subgrupo}-${c.nome}`} className="flex items-center justify-between px-3 py-2">
                <span>
                  {c.nome} <span className="text-xs text-[var(--muted-foreground)]">· {c.subgrupo}</span>
                </span>
                <span className="num-display">{formatMoney(c.valor)}</span>
              </li>
            ))}
          </Lista>
          <p className="hint">Mexe no caixa, mas não é lucro nem prejuízo: retirada de sócio, investimento, empréstimo.</p>
        </section>
      )}
    </Pagina>
  );
}

function Bloco({ linha, anteriores }: { linha: LinhaDaDre; anteriores: (LinhaDaDre | undefined)[] }) {
  const total = linha.tipo === "total";
  const resultado = linha.chave === "resultado";
  if (!total && linha.valor === 0 && anteriores.every((a) => !a || a.valor === 0)) return null;
  // Os subgrupos e as categorias dos três meses: o que só apareceu no mês
  // passado também precisa de linha, senão a comparação esconde o que sumiu.
  const meses = [linha, ...anteriores];
  const subgrupos = [...new Set(meses.flatMap((l) => l?.subgrupos.map((s) => s.nome) ?? []))];
  const subDe = (l: LinhaDaDre | undefined, sub: string) => l?.subgrupos.find((s) => s.nome === sub);
  const cor = (n: number) => (total && n < 0 ? { color: "var(--destructive)" } : undefined);
  return (
    <>
      <tr className={`border-b border-[var(--border)] ${total ? "bg-[var(--muted)] font-semibold" : "font-medium"} ${resultado ? "text-base" : ""}`}>
        <td className="px-3 py-2">{linha.rotulo}</td>
        {anteriores.map((a, i) => (
          <td key={i} className="num-display hidden whitespace-nowrap px-3 py-2 text-right text-[var(--muted-foreground)] sm:table-cell">
            {a ? formatMoney(a.valor) : ""}
          </td>
        ))}
        <td className="num-display whitespace-nowrap px-3 py-2 text-right" style={cor(linha.valor)}>
          {formatMoney(linha.valor)}
        </td>
        <td className="num-display px-3 py-2 text-right text-[var(--muted-foreground)]">{pct(linha.pct)}</td>
      </tr>
      {subgrupos.map((sub) => {
        const s = subDe(linha, sub);
        const nomes = [...new Set(meses.flatMap((l) => subDe(l, sub)?.categorias.map((c) => c.nome) ?? []))];
        return (
          <Fragment key={sub}>
            <tr className="border-b border-[var(--border)]">
              <td className="py-1.5 pr-3 pl-6 text-sm">{sub}</td>
              {anteriores.map((a, i) => (
                <td key={i} className="num-display hidden whitespace-nowrap px-3 py-1.5 text-right text-[var(--muted-foreground)] sm:table-cell">
                  {subDe(a, sub) ? formatMoney(subDe(a, sub)!.valor) : ""}
                </td>
              ))}
              <td className="num-display whitespace-nowrap px-3 py-1.5 text-right">{formatMoney(s?.valor ?? 0)}</td>
              <td className="num-display px-3 py-1.5 text-right text-[var(--muted-foreground)]">{s ? pct(s.pct) : ""}</td>
            </tr>
            {nomes.map((nome) => {
              const c = s?.categorias.find((x) => x.nome === nome);
              return (
                <tr key={nome} className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  <td className="py-1 pr-3 pl-10">{nome}</td>
                  {anteriores.map((a, i) => {
                    const antes = subDe(a, sub)?.categorias.find((x) => x.nome === nome);
                    return (
                      <td key={i} className="num-display hidden whitespace-nowrap px-3 py-1 text-right sm:table-cell">
                        {antes ? formatMoney(antes.valor) : ""}
                      </td>
                    );
                  })}
                  <td className="num-display whitespace-nowrap px-3 py-1 text-right">{formatMoney(c?.valor ?? 0)}</td>
                  <td className="num-display px-3 py-1 text-right">{c ? pct(c.pct) : ""}</td>
                </tr>
              );
            })}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * Os centros lado a lado no mês: uma coluna por centro, mais "sem centro" e a
 * casa toda. Só as linhas da DRE, sem as categorias, para caber na tela.
 */
async function PorCentro({ mes, centros }: { mes: string; centros: { id: number; nome: string }[] }) {
  const colunas = [
    ...centros.map((c) => ({ nome: c.nome, filtro: c.id as number | null | undefined })),
    { nome: "Sem centro", filtro: null },
    { nome: "Casa toda", filtro: undefined },
  ];
  const dres = await Promise.all(colunas.map((c) => dreDoMes(mes, c.filtro)));
  // A coluna "sem centro" vazia só ocupa espaço.
  const semCentroVazio = dres[colunas.length - 2].linhas.every((l) => l.valor === 0);
  const visiveis = colunas.map((c, i) => ({ ...c, dre: dres[i] })).filter((c) => !(c.filtro === null && semCentroVazio));
  const linhas = dres[dres.length - 1].linhas.filter((l) => l.tipo === "total" || visiveis.some((c) => c.dre.linhas.find((x) => x.chave === l.chave)?.valor));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
              <th className="sticky left-0 bg-[var(--card)] px-3 py-2 text-left font-medium" />
              {visiveis.map((c) => (
                <th key={c.nome} className="px-3 py-2 text-right font-medium">
                  {c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const total = l.tipo === "total";
              return (
                <tr key={l.chave} className={`border-b border-[var(--border)] last:border-0 ${total ? "bg-[var(--muted)] font-semibold" : ""}`}>
                  <td className={`sticky left-0 px-3 py-2 ${total ? "bg-[var(--muted)]" : "bg-[var(--card)]"}`}>{l.rotulo}</td>
                  {visiveis.map((c) => {
                    const valor = c.dre.linhas.find((x) => x.chave === l.chave)?.valor ?? 0;
                    return (
                      <td key={c.nome} className="num-display whitespace-nowrap px-3 py-2 text-right" style={total && valor < 0 ? { color: "var(--destructive)" } : undefined}>
                        {formatMoney(valor)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        O Administrativo é o custo comum da casa e não é dividido entre os outros: o resultado de cada centro é o que ele sobra para pagar essa coluna.
      </p>
    </div>
  );
}
