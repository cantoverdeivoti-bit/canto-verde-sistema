import Link from "next/link";

import { CabecalhoDaPagina, Pagina, Vazio } from "@/components/pagina";
import { todayInTimezone } from "@/lib/availability";
import { custoKgTexto, ddmm, TOM_DA_SITUACAO } from "@/lib/buffet";
import { cardapioEscolhido, configuracaoDoBuffet, diasReais, gruposDoBuffet, painelDaSemana, semanaDoCardapio, type DiaReal } from "@/lib/buffet-dados";
import { custoPorCategoria, DIAS_DA_SEMANA, diaDaSemanaBuffet, type Classe } from "@/lib/buffet-regras";
import { formatMoney, FUSO_DA_CASA, plural } from "@/lib/format";

import { EscolherCardapio } from "./escolher-cardapio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Painel · Cardápio buffet" };

const TOM_DA_CLASSE: Record<Classe, string> = { A: "var(--destructive)", B: "var(--warn)", C: "var(--muted-foreground)" };

/**
 * O custo do buffet da semana do modelo: a média do custo/kg de cada dia e de
 * cada grupo contra a meta, como o 5. DASHBOARD da planilha. Sem quantidade a
 * produzir (decisão do dono), é média simples do custo/kg dos pratos.
 */
export default async function PainelDoBuffetPage({ searchParams }: PageProps<"/admin/buffet">) {
  const q = await searchParams;
  const hoje = todayInTimezone(FUSO_DA_CASA);
  // O que não depende do cardápio escolhido sai junto com a lista de cardápios.
  const independentes = Promise.all([gruposDoBuffet(), configuracaoDoBuffet(), diasReais(7)]);
  independentes.catch(() => {});
  const { todos, id, vigenteHoje } = await cardapioEscolhido(q.cardapio, hoje);

  if (id === null)
    return (
      <Pagina largura="larga">
        <CabecalhoDaPagina titulo="Painel do buffet" />
        <Vazio>
          Nenhum cardápio ainda. <Link href="/admin/buffet/cardapio" className="underline">Monte o cardápio da semana</Link> e o
          custo aparece aqui.
        </Vazio>
      </Pagina>
    );

  const [semana, [grupos, config, reais]] = await Promise.all([semanaDoCardapio(id), independentes]);
  if (!semana) return null;
  const dias = painelDaSemana(semana, grupos, config);
  const diaDeHoje = id === vigenteHoje ? diaDaSemanaBuffet(hoje) : null;
  const pedido = Number(q.dia);
  const diaAberto = pedido >= 1 && pedido <= 7 ? pedido : (diaDeHoje ?? 1);
  const aberto = dias[diaAberto - 1];
  const link = (dia: number) => `/admin/buffet?cardapio=${id}&dia=${dia}`;
  const categoriasDaSemana = q.cat === "semana";
  const categorias = custoPorCategoria(
    semana.itens.filter((i) => categoriasDaSemana || i.diaSemana === diaAberto).map((i) => ({ categoria: i.prato.categoria, custoKg: i.prato.custoKg })),
  );

  const semCusto = new Set(semana.itens.filter((i) => i.prato.custoKg === null).map((i) => i.prato.id)).size;
  const acima = dias.reduce((s, d) => s + d.porGrupo.reduce((t, g) => t + g.pratos.filter((p) => p.acimaDaMeta).length, 0), 0);

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo="Painel do buffet"
        subtitulo={
          <>
            {semana.nome}, de {ddmm(semana.inicio)} a {ddmm(semana.fim)}. Custo médio por kg: a média simples do custo/kg dos pratos de cada
            dia.
          </>
        }
      />

      <EscolherCardapio todos={todos} atual={id} vigenteHoje={vigenteHoje} base="/admin/buffet" />
      {vigenteHoje === null && <p className="msg-warn">Nenhum cardápio vale hoje. Este é o mais recente.</p>}

      <CustoPorCategoria
        linhas={categorias}
        titulo={categoriasDaSemana ? "a semana inteira" : `${DIAS_DA_SEMANA[diaAberto - 1].toLowerCase()}${aberto.tema ? ` · ${aberto.tema}` : ""}`}
        linkDia={link(diaAberto)}
        linkSemana={`${link(diaAberto)}&cat=semana`}
        daSemana={categoriasDaSemana}
      />

      {(semCusto > 0 || acima > 0) && (
        <p className="text-sm">
          {semCusto > 0 && <>{plural(semCusto, "prato", "pratos")} do cardápio sem custo/kg (fica fora da média). </>}
          {acima > 0 && <>{plural(acima, "vez", "vezes")} um prato passa da meta do grupo na semana.</>}
        </p>
      )}

      {/* A semana: um cartão por dia, que abre o dia embaixo. */}
      <nav aria-label="Dias da semana" className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {dias.map((d) => (
          <Link
            key={d.dia}
            href={link(d.dia)}
            aria-current={d.dia === diaAberto ? "page" : undefined}
            className="card block p-3 transition hover:border-[var(--primary)] aria-[current=page]:border-[var(--primary)] aria-[current=page]:ring-1 aria-[current=page]:ring-[var(--primary)]"
          >
            <p className="flex items-baseline justify-between gap-1 text-xs text-[var(--muted-foreground)]">
              <span className="font-semibold text-[var(--foreground)]">{DIAS_DA_SEMANA[d.dia - 1]}</span>
              {d.dia === diaDeHoje && <span>hoje</span>}
            </p>
            <p className="truncate text-xs text-[var(--muted-foreground)]">{d.tema ?? "sem tema"}</p>
            <p className="num-display mt-1 text-lg">{d.media === null ? "–" : custoKgTexto(d.media).replace("/kg", "")}</p>
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {plural(d.quantidade, "prato")}
              {d.semCusto > 0 && ` · ${d.semCusto} sem custo`}
            </p>
            <div className="mt-2 flex gap-1" aria-hidden>
              {d.porGrupo.map((g) => (
                <span
                  key={g.grupo.id}
                  className="h-1.5 flex-1 rounded-full"
                  style={{ background: g.situacao ? TOM_DA_SITUACAO[g.situacao].cor : "var(--border)" }}
                />
              ))}
            </div>
          </Link>
        ))}
      </nav>

      {reais.length > 0 && <DiasReais dias={reais} />}

      {/* Grupo contra a meta, dia a dia: a tabela do DASHBOARD. */}
      <section>
        <h2 className="section-label mb-2">Média por grupo (R$/kg)</h2>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
                <th className="px-3 py-2 font-medium">Grupo</th>
                <th className="px-2 py-2 text-right font-medium">Meta</th>
                {dias.map((d) => (
                  <th key={d.dia} className="px-2 py-2 text-right font-medium">
                    {DIAS_DA_SEMANA[d.dia - 1].slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {grupos.map((g, gi) => (
                <tr key={g.id}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    <span className="mr-1.5 inline-block size-2.5 rounded-full align-middle" style={{ background: g.cor }} aria-hidden />
                    {g.nome}
                  </th>
                  <td className="px-2 py-2 text-right tabular-nums text-[var(--muted-foreground)]">
                    {g.metaCustoKg === null ? "–" : g.metaCustoKg.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </td>
                  {dias.map((d) => {
                    const c = d.porGrupo[gi];
                    const tom = c.situacao ? TOM_DA_SITUACAO[c.situacao] : null;
                    return (
                      <td key={d.dia} className="px-1 py-1 text-right">
                        <span
                          className="block rounded-md px-1.5 py-1 tabular-nums"
                          style={tom ? { background: tom.fundo, color: tom.cor } : undefined}
                          title={tom?.texto}
                        >
                          {c.media === null ? "–" : c.media.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
          {Object.values(TOM_DA_SITUACAO).map((t) => (
            <span key={t.texto} className="inline-flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: t.cor }} aria-hidden />
              {t.texto}
            </span>
          ))}
        </p>
      </section>

      {/* O dia aberto, prato a prato. */}
      <section>
        <h2 className="section-label mb-2">
          {DIAS_DA_SEMANA[aberto.dia - 1]}
          {aberto.tema && ` · ${aberto.tema}`}
        </h2>
        <p className="mb-3 text-xs text-[var(--muted-foreground)]">
          Classe A: o prato pesa {Math.round(config.limiteClasseA * 100)}% ou mais na soma do custo/kg do dia. Classe B: de{" "}
          {Math.round(config.limiteClasseB * 100)}% até a A. Classe C: o resto.
        </p>
        <div className="grid gap-3 lg:grid-cols-2">
          {aberto.porGrupo.map((g) => (
            <div key={g.grupo.id} className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2" style={{ borderTop: `3px solid ${g.grupo.cor}` }}>
                <p className="min-w-0 flex-1 font-semibold">{g.grupo.nome}</p>
                <p className="text-right text-xs tabular-nums">
                  {g.media === null ? "sem custo" : custoKgTexto(g.media)}
                  {g.grupo.metaCustoKg !== null && (
                    <span className="block text-[var(--muted-foreground)]">meta {custoKgTexto(g.grupo.metaCustoKg)}</span>
                  )}
                </p>
                {g.situacao && (
                  <span className="selo shrink-0" style={{ color: TOM_DA_SITUACAO[g.situacao].cor }}>
                    {g.situacao === "ok" ? "ok" : g.situacao === "atencao" ? "atenção" : "acima"}
                  </span>
                )}
              </div>
              {g.pratos.length === 0 ? (
                <p className="px-3 py-3 text-sm text-[var(--muted-foreground)]">Nenhum prato neste dia.</p>
              ) : (
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {g.pratos.map((p) => (
                    <li key={p.posicao} className="flex items-center gap-2 px-3 py-1.5">
                      <span className="w-6 shrink-0 text-right text-xs tabular-nums text-[var(--muted-foreground)]">{p.posicao}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{p.nome}</span>
                        {(p.acimaDaMeta || p.repetido) && (
                          <span className="block text-[11px]" style={{ color: "var(--destructive)" }}>
                            {[p.acimaDaMeta && "acima da meta do grupo", p.repetido && "repetido no dia"].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right text-xs tabular-nums">{p.custoKg === null ? "sem custo" : custoKgTexto(p.custoKg)}</span>
                      <span className="w-5 shrink-0 text-center text-xs font-semibold" style={{ color: p.classe ? TOM_DA_CLASSE[p.classe] : undefined }}>
                        {p.classe ?? ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </Pagina>
  );
}

const kg = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
const reaisKg = (n: number | null) => (n === null ? "–" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/**
 * O que a cozinha pesou: o custo real de cada dia lançado na Produção do dia,
 * a média ponderada (o arroz pesa o que saiu de arroz) ao lado da simples, e
 * a sobra. Embaixo, o que mais sobrou no dia mais recente.
 */
function DiasReais({ dias }: { dias: DiaReal[] }) {
  const ultimo = dias[0];
  return (
    <section>
      <h2 className="section-label mb-1">Dia real (peso lançado)</h2>
      <p className="mb-2 text-xs text-[var(--muted-foreground)]">
        Custo do que foi feito, pelo kg lançado na Produção do dia. A média ponderada é o custo de 1 kg do buffet daquele dia; a simples é a
        conta do planejamento.
      </p>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--muted-foreground)]">
              <th className="px-3 py-2 font-medium">Dia</th>
              <th className="px-2 py-2 text-right font-medium">Custo</th>
              <th className="px-2 py-2 text-right font-medium">R$/kg real</th>
              <th className="px-2 py-2 text-right font-medium">R$/kg simples</th>
              <th className="px-2 py-2 text-right font-medium">Sobra</th>
              <th className="px-2 py-2 text-right font-medium">Clientes</th>
              <th className="px-3 py-2 text-right font-medium">R$/cliente</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] tabular-nums">
            {dias.map((d) => (
              <tr key={d.data}>
                <th scope="row" className="px-3 py-2 text-left font-medium">
                  {DIAS_DA_SEMANA[diaDaSemanaBuffet(d.data) - 1].slice(0, 3)} {ddmm(d.data)}
                  {d.semCusto > 0 && <span className="block text-[11px] font-normal text-[var(--warn)]">{d.semCusto} sem custo</span>}
                </th>
                <td className="px-2 py-2 text-right">{formatMoney(d.custo)}</td>
                <td className="px-2 py-2 text-right font-semibold">{reaisKg(d.mediaPonderada)}</td>
                <td className="px-2 py-2 text-right text-[var(--muted-foreground)]">{reaisKg(d.mediaSimples)}</td>
                <td className="px-2 py-2 text-right">
                  {kg(d.kgSobra)}
                  <span className="block text-[11px] text-[var(--muted-foreground)]">
                    {formatMoney(d.custoSobra)}
                    {d.desperdicioPct !== null && ` · ${d.desperdicioPct.toLocaleString("pt-BR")}%`}
                  </span>
                </td>
                <td className="px-2 py-2 text-right">{d.clientes ?? "–"}</td>
                <td className="px-3 py-2 text-right">{d.porCliente === null ? "–" : formatMoney(d.porCliente)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ultimo.sobras.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold">
            O que mais sobrou em {DIAS_DA_SEMANA[diaDaSemanaBuffet(ultimo.data) - 1].toLowerCase()}, {ddmm(ultimo.data)}
          </p>
          <ul className="card divide-y divide-[var(--border)] text-sm">
            {ultimo.sobras.slice(0, 5).map((x) => (
              <li key={x.pratoId} className="flex items-center gap-2 px-3 py-1.5">
                <span className="min-w-0 flex-1 truncate">{x.nome}</span>
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted-foreground)]">
                  {kg(x.kg)} · {x.pct}% do feito
                </span>
                <span className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums">{formatMoney(x.reais)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * O custo por categoria do prato, no topo do painel: onde está o dinheiro do
 * buffet. A barra é o peso da categoria na soma do custo/kg (do dia aberto ou
 * da semana inteira), a mesma conta da classe A/B/C.
 */
function CustoPorCategoria({
  linhas,
  titulo,
  linkDia,
  linkSemana,
  daSemana,
}: {
  linhas: ReturnType<typeof custoPorCategoria>;
  titulo: string;
  linkDia: string;
  linkSemana: string;
  daSemana: boolean;
}) {
  const maior = Math.max(...linhas.map((l) => l.pct ?? 0), 1);
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">
          Custo por categoria <span className="font-normal text-[var(--muted-foreground)]">· {titulo}</span>
        </h2>
        <nav aria-label="Período do relatório" className="flex gap-1">
          <Link href={linkDia} aria-current={!daSemana ? "page" : undefined} className="chip px-2.5 py-1 text-xs">
            Dia
          </Link>
          <Link href={linkSemana} aria-current={daSemana ? "page" : undefined} className="chip px-2.5 py-1 text-xs">
            Semana
          </Link>
        </nav>
      </div>
      {linhas.length === 0 ? (
        <p className="px-3 py-3 text-sm text-[var(--muted-foreground)]">Nenhum prato neste dia.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--muted-foreground)]">
                <th className="px-3 py-1.5 font-medium">Categoria</th>
                <th className="px-2 py-1.5 text-right font-medium">Pratos</th>
                <th className="px-2 py-1.5 text-right font-medium">R$/kg</th>
                <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">Faixa</th>
                <th className="w-[30%] px-3 py-1.5 font-medium">Peso no custo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] tabular-nums">
              {linhas.map((l) => (
                <tr key={l.categoria}>
                  <th scope="row" className="px-3 py-1.5 text-left font-medium">
                    {l.categoria}
                  </th>
                  <td className="px-2 py-1.5 text-right">
                    {l.pratos}
                    {l.semCusto > 0 && <span className="block text-[11px] text-[var(--warn)]">{l.semCusto} sem custo</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold">{l.media === null ? "–" : l.media.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                  <td className="hidden px-2 py-1.5 text-right text-xs text-[var(--muted-foreground)] sm:table-cell">
                    {l.minimo === null ? "–" : l.minimo === l.maximo ? l.minimo.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : `${l.minimo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} a ${l.maximo!.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--muted)]">
                        <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${((l.pct ?? 0) / maior) * 100}%` }} />
                      </div>
                      <span className="w-10 shrink-0 text-right text-xs">{l.pct === null ? "–" : `${l.pct.toLocaleString("pt-BR")}%`}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
