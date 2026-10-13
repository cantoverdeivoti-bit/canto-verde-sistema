import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { salvarFaturamentoDoMes, salvarMetaCmo } from "@/lib/actions/pessoal";
import { percentualDoCmo, situacaoDaMeta } from "@/lib/cmo";
import { dadosDoCmo, hojeDaCasa, registrarCmoDoMes } from "@/lib/cmo-do-banco";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { can } from "@/lib/roles";
import { TIPO, type TipoContrato } from "@/lib/tipos-de-contrato";

import { COR_DA_META } from "./cores-da-meta";
import { EditarValor } from "./editar-valor";
import { OrcamentoDoMes } from "./orcamento-do-mes";
import { ProjecaoDoCmo } from "./projecao-do-cmo";
import { Rotatividade } from "./rotatividade";

export const dynamic = "force-dynamic";
export const metadata = { title: "Relatórios · Departamento pessoal" };

const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (m: string) => `${MES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * O CMO (custo de mão de obra) como projeção de um mês padrão, com a equipe e
 * a escala fixa de hoje, e o registro do valor de cada mês. A conta mora em
 * `lib/cmo.ts`; a simulação roda na tela, sem mexer em cadastro.
 */
export default async function RelatoriosDoPessoalPage({ searchParams }: PageProps<"/admin/pessoal/relatorios">) {
  const user = await guardModule("pessoal");
  if (!can(user, "pessoal", { configure: true })) {
    return (
      <Pagina largura="larga">
        <CabecalhoDaPagina titulo="Relatórios" />
        <p className="text-sm text-[var(--muted-foreground)]">
          O CMO mostra salários. Só quem configura o Departamento pessoal vê este relatório.
        </p>
      </Pagina>
    );
  }

  // Abrir o relatório também registra o mês: assim ele nunca fica sem valor.
  await registrarCmoDoMes();
  const hoje = await hojeDaCasa();
  const [{ pessoas, itens, meta, faturamentoMensal, fonte }, registros, digitados] = await Promise.all([
    dadosDoCmo(hoje),
    prisma.cmoDoMes.findMany({ orderBy: { mes: "desc" }, take: 24 }),
    prisma.faturamentoDoMes.findMany({ select: { mes: true, valor: true } }),
  ]);
  const atual = hoje.slice(0, 7);
  const pedido = (await searchParams).mes;
  const mesDoOrcamento = typeof pedido === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : atual;
  const faturamentos = new Map(digitados.map((f) => [f.mes, f.valor.toNumber()]));
  // A régua das barras: vai um pouco além da meta e do maior %, para a marca da meta caber.
  const percentuais = registros
    .map((r) => percentualDoCmo(r.total.toNumber(), faturamentos.get(r.mes) ?? null))
    .filter((x): x is number => x !== null);
  const escala = Math.max(...percentuais, meta ?? 0, 1) * 1.15;

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina titulo="Relatórios" subtitulo="CMO (custo de mão de obra): orçamento, projeção e meses. E a rotatividade da equipe." />

      <OrcamentoDoMes mes={mesDoOrcamento} hoje={hoje} />

      <ProjecaoDoCmo
        pessoas={pessoas}
        itens={itens}
        faturamentoMensal={faturamentoMensal}
        fonte={fonte}
        meta={meta}
      />

      {/* ---- CMO x faturamento, mês a mês ---- */}
      <section>
        <h2 className="section-label mb-2">CMO x faturamento</h2>
        <div className="mb-3 text-sm">
          <EditarValor
            rotulo="Meta do CMO, em % do faturamento"
            mostrado={
              meta === null ? null : (
                <span>
                  Meta: CMO até <strong className="tabular-nums">{pct(meta)}</strong> do faturamento.
                </span>
              )
            }
            inicial={meta === null ? "" : String(meta).replace(".", ",")}
            vazio="Definir a meta do CMO"
            placeholder="ex.: 30"
            largura="w-24"
            ajuda="Verde até a meta, amarelo até 10% acima dela, vermelho passando disso. Vazio tira a meta."
            salvar={salvarMetaCmo}
          />
        </div>
        {registros.length === 0 ? (
          <Vazio>Nenhum mês registrado ainda.</Vazio>
        ) : (
          <Lista>
            {registros.map((r) => {
              const cmo = r.total.toNumber();
              const fat = faturamentos.get(r.mes) ?? null;
              const percentual = percentualDoCmo(cmo, fat);
              const situacao = situacaoDaMeta(percentual, meta);
              const cor = situacao ? COR_DA_META[situacao] : null;
              const linhas = r.pessoas as { id: number; nome: string; tipo: TipoContrato; total: number }[];
              const itensDoMes = r.itens as { nome: string; natureza: "ENCARGO" | "BENEFICIO"; total: number }[];
              return (
                <li key={r.mes} className="px-3 py-3">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold capitalize">{nomeDoMes(r.mes)}</span>
                      {r.mes === atual && <span className="text-xs text-[var(--muted-foreground)]"> em andamento</span>}
                    </span>
                    {percentual !== null && (
                      <span
                        className="selo shrink-0 tabular-nums"
                        style={cor ? { color: cor.cor, background: cor.fundo } : undefined}
                      >
                        {pct(percentual)}
                      </span>
                    )}
                  </div>
                  <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-sm">
                    <dt className="text-[var(--muted-foreground)]">CMO</dt>
                    <dd className="tabular-nums">{formatMoney(cmo)}</dd>
                    <dt className="text-[var(--muted-foreground)]">Faturamento</dt>
                    <dd>
                      <EditarValor
                        rotulo={`Faturamento de ${nomeDoMes(r.mes)}`}
                        mostrado={fat === null ? null : <span className="tabular-nums">{formatMoney(fat)}</span>}
                        inicial={fat === null ? "" : fat.toFixed(2).replace(".", ",")}
                        vazio="Digitar"
                        placeholder="R$ 0,00"
                        ajuda={r.mes === atual ? "O mês ainda não fechou: o % muda até o último dia." : undefined}
                        salvar={salvarFaturamentoDoMes.bind(null, r.mes)}
                      />
                    </dd>
                  </dl>
                  {percentual !== null && (
                    <div className="relative mt-2 h-2 rounded-full bg-[var(--muted)]" aria-hidden>
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${Math.min((percentual / escala) * 100, 100)}%`, background: cor?.cor ?? "var(--primary)" }}
                      />
                      {meta !== null && (
                        <span
                          className="absolute inset-y-[-3px] w-0.5 bg-[var(--foreground)]"
                          style={{ left: `${(meta / escala) * 100}%` }}
                        />
                      )}
                    </div>
                  )}
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-xs text-[var(--muted-foreground)]">
                      Por pessoa{itensDoMes.length > 0 ? " e encargos e benefícios" : ""}
                    </summary>
                    <ul className="mt-1.5 space-y-0.5 text-sm">
                      {linhas.map((l) => (
                        <li key={l.id} className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate">{l.nome}</span>
                          <span className="selo shrink-0" style={TIPO[l.tipo].selo}>
                            {TIPO[l.tipo].curto}
                          </span>
                          <span className="w-24 text-right tabular-nums">{formatMoney(l.total)}</span>
                        </li>
                      ))}
                    </ul>
                    {itensDoMes.length > 0 && (
                      <ul className="mt-2 space-y-0.5 border-t border-[var(--border)] pt-2 text-sm">
                        {itensDoMes.map((i) => (
                          <li key={i.nome} className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate">{i.nome}</span>
                            <span className="text-xs text-[var(--muted-foreground)]">
                              {i.natureza === "ENCARGO" ? "encargo" : "benefício"}
                            </span>
                            <span className="w-24 text-right tabular-nums">{formatMoney(i.total)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </li>
              );
            })}
          </Lista>
        )}
        <p className="hint mt-1.5">
          O CMO de cada mês é a projeção como estava no fim dele. O mês em andamento se atualiza a cada mudança na equipe,
          nos valores, na escala fixa ou nos encargos. O faturamento é o que você digita.
        </p>
      </section>

      {/* ---- Encargos e como a conta é feita ---- */}
      <section className="space-y-3">
        <details className="text-sm text-[var(--muted-foreground)]">
          <summary className="cursor-pointer font-medium text-[var(--foreground)]">Como a conta é feita</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>CLT e fixo sem registro: o salário do cadastro.</li>
            <li>
              Free lancer: a diária de cada dia em que ele está na escala fixa (a daquele dia, ou a de sempre) × 4,35 semanas (365 ÷ 12 ÷ 7). As
              exceções de um dia não entram: o mês é o padrão.
            </li>
            <li>
              Na projeção, o % compara com a média dos últimos 3 meses de faturamento digitados. Sem nenhum digitado, usa a
              média das últimas semanas do orçamento de Compras × 4,35.
            </li>
            <li>
              Encargos e benefícios (Cadastros): cada item entra para os tipos marcados, com a exceção de cada pessoa. O %
              é sobre o salário; o valor por dia usa os dias da escala fixa × 4,35.
            </li>
            <li>No CMO x faturamento, cada mês compara o CMO registrado com o faturamento que você digitou.</li>
            <li>A simulação liga e desliga pessoas só nesta tela. O cadastro não muda.</li>
          </ul>
        </details>
      </section>

      <Rotatividade hoje={hoje} />
    </Pagina>
  );
}
