import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { dateOnlyToString, getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { NOME_DA_AREA, somarDias } from "@/lib/escala";
import { cruzam, diasDe, situacaoDeFerias, type SituacaoDeFerias } from "@/lib/ferias";
import { formatDiaNumericoString, plural } from "@/lib/format";
import { nomeNaEscala } from "@/lib/pessoal";
import { TIPO } from "@/lib/tipos-de-contrato";

import { FeriasMarcadas, MarcarFerias } from "./marcar-ferias";

export const dynamic = "force-dynamic";
export const metadata = { title: "Férias · Departamento pessoal" };

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** "2026-10" + n meses -> "2027-01". */
function somarMeses(mes: string, n: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

const SELO: Record<SituacaoDeFerias["estado"], { texto: string; cor: string; fundo: string }> = {
  "em-dia": { texto: "em dia", cor: "var(--ok-strong)", fundo: "var(--ok-soft)" },
  "perto-do-prazo": { texto: "prazo perto", cor: "var(--warn)", fundo: "var(--warn-soft)" },
  vencida: { texto: "vencida", cor: "var(--destructive)", fundo: "var(--danger-soft)" },
  "primeiro-ano": { texto: "1º ano", cor: "var(--muted-foreground)", fundo: "var(--muted)" },
  "sem-admissao": { texto: "sem data", cor: "var(--warn)", fundo: "var(--warn-soft)" },
};

/**
 * As férias de quem ganha por mês (CLT e fixo sem registro, que a casa
 * trata igual): a situação de cada um pela regra geral da CLT, a linha
 * do tempo de 12 meses e o formulário de marcar. Free lancer não tem férias.
 */
export default async function FeriasPage({ searchParams }: PageProps<"/admin/pessoal/ferias">) {
  await guardModule("pessoal");
  const { capacity } = await getSettings();
  const hoje = todayInTimezone(capacity.timezone);
  const q = await searchParams;
  const primeiroMes = typeof q.inicio === "string" && /^\d{4}-\d{2}$/.test(q.inicio) ? q.inicio : hoje.slice(0, 7);
  const inicioJanela = `${primeiroMes}-01`;
  const fimJanela = somarDias(`${somarMeses(primeiroMes, 12)}-01`, -1);

  const [pessoas, todas] = await Promise.all([
    prisma.colaborador.findMany({
      where: { ativo: true, tipo: { in: ["CLT", "FIXO"] } },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, apelido: true, area: true, comecouEm: true, admissao: true, tipo: true },
    }),
    prisma.ferias.findMany({ orderBy: { inicio: "asc" }, select: { id: true, colaboradorId: true, inicio: true, fim: true, observacao: true } }),
  ]);
  const ferias = todas.map((f) => ({ ...f, inicio: dateOnlyToString(f.inicio), fim: dateOnlyToString(f.fim) }));
  const porPessoa = (id: number) => ferias.filter((f) => f.colaboradorId === id);

  // As férias contam da carteira assinada no CLT; o fixo é sem registro e
  // conta do dia em que começou.
  const baseDasFerias = (p: (typeof pessoas)[number]) => {
    const d = p.tipo === "CLT" ? p.admissao : p.comecouEm;
    return d ? dateOnlyToString(d) : null;
  };
  const linhas = pessoas.map((p) => ({
    id: p.id,
    nome: nomeNaEscala(p),
    tipo: p.tipo,
    area: p.area,
    situacao: situacaoDeFerias(baseDasFerias(p), hoje, porPessoa(p.id)),
    pedacos: porPessoa(p.id).filter((f) => f.fim >= inicioJanela && f.inicio <= fimJanela),
  }));

  // Conflitos: duas pessoas da mesma equipe fora ao mesmo tempo.
  const conflitos: string[] = [];
  const futuras = ferias.filter((f) => f.fim >= hoje);
  futuras.forEach((a, i) => {
    for (const b of futuras.slice(i + 1)) {
      const pa = pessoas.find((p) => p.id === a.colaboradorId);
      const pb = pessoas.find((p) => p.id === b.colaboradorId);
      if (!pa || !pb || pa.id === pb.id || !pa.area || pa.area !== pb.area || !cruzam(a, b)) continue;
      const de = a.inicio > b.inicio ? a.inicio : b.inicio;
      conflitos.push(`${nomeNaEscala(pa)} e ${nomeNaEscala(pb)} (${NOME_DA_AREA[pa.area]}) fora juntos a partir de ${dataBR(de)}.`);
    }
  });

  const totalDias = diasDe({ inicio: inicioJanela, fim: fimJanela });
  const pos = (d: string) => ((diasDe({ inicio: inicioJanela, fim: d }) - 1) / totalDias) * 100;
  const meses = Array.from({ length: 12 }, (_, i) => somarMeses(primeiroMes, i));
  const hojeNaJanela = hoje >= inicioJanela && hoje <= fimJanela ? pos(hoje) : null;

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo="Férias"
        subtitulo={
          <>
            {plural(pessoas.length, "pessoa ativa", "pessoas ativas")} entre CLT e fixo sem registro. Regra geral da CLT,
            confirme com a contabilidade.
          </>
        }
      />

      <MarcarFerias
        pessoas={linhas.map((l) => ({ id: l.id, nome: l.nome, area: l.area }))}
        ferias={futuras.map((f) => ({ colaboradorId: f.colaboradorId, inicio: f.inicio, fim: f.fim }))}
        hoje={hoje}
      />

      {conflitos.length > 0 && (
        <ul className="msg-warn space-y-0.5">
          {conflitos.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}

      {/* ---- A situação de cada um ---- */}
      <section>
        <h2 className="section-label mb-2">Situação de cada um</h2>
        {linhas.length === 0 ? (
          <Vazio>
            Nenhum CLT ou fixo ativo.{" "}
            <Link href="/admin/pessoal/colaboradores/novo" className="text-[var(--primary)] underline underline-offset-4">
              Cadastrar
            </Link>
          </Vazio>
        ) : (
          <Lista>
            {linhas.map((l) => {
              const s = l.situacao;
              const selo = SELO[s.estado];
              return (
                <li key={l.id} className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/pessoal/colaboradores/${l.id}`}
                      className="min-w-0 flex-1 truncate font-semibold underline-offset-4 hover:underline"
                    >
                      {l.nome}
                    </Link>
                    {l.tipo === "FIXO" && (
                      <span className="selo shrink-0" style={TIPO.FIXO.selo}>
                        {TIPO.FIXO.curto}
                      </span>
                    )}
                    <span className="selo shrink-0" style={{ color: selo.cor, background: selo.fundo }}>
                      {selo.texto}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
                    {s.estado === "sem-admissao"
                      ? l.tipo === "CLT"
                        ? "Sem a data da carteira assinada no cadastro: não dá para contar o prazo."
                        : "Sem o dia em que começou no cadastro: não dá para contar o prazo."
                      : s.estado === "primeiro-ano"
                        ? `Ainda no primeiro ano. Direito a 30 dias a partir de ${dataBR(s.direitoEm)}.`
                        : `${s.marcados} de 30 dias marcados · tirar até ${dataBR(s.prazo)}${
                            s.estado === "vencida"
                              ? `, venceu há ${plural(-s.diasAtePrazo, "dia", "dias")}`
                              : s.faltam > 0
                                ? `, faltam ${s.diasAtePrazo} dias`
                                : ""
                          }`}
                  </p>
                  {"divisao" in s && s.divisao.length > 0 && (
                    <p className="text-xs" style={{ color: "var(--warn)" }}>
                      {s.divisao.join(" ")}
                    </p>
                  )}
                </li>
              );
            })}
          </Lista>
        )}
      </section>

      {/* ---- Linha do tempo de 12 meses ---- */}
      {linhas.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="section-label">
              {MES[Number(primeiroMes.slice(5, 7)) - 1]}/{primeiroMes.slice(2, 4)} a{" "}
              {MES[Number(meses[11].slice(5, 7)) - 1]}/{meses[11].slice(2, 4)}
            </h2>
            <div className="flex gap-1">
              <Link
                href={`/admin/pessoal/ferias?inicio=${somarMeses(primeiroMes, -1)}`}
                aria-label="Um mês antes"
                className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)]"
              >
                <ChevronLeft aria-hidden className="size-4" />
              </Link>
              <Link
                href={`/admin/pessoal/ferias?inicio=${somarMeses(primeiroMes, 1)}`}
                aria-label="Um mês depois"
                className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)]"
              >
                <ChevronRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 sm:grid-cols-[8rem_1fr]">
              <span />
              <div className="grid grid-cols-12 text-[10px] text-[var(--muted-foreground)] uppercase">
                {/* No celular, só a inicial: três letras em doze colunas se encavalavam. */}
                {meses.map((m) => (
                  <span key={m} className="border-l border-[var(--border)] pl-0.5">
                    <span className="sm:hidden">{MES[Number(m.slice(5, 7)) - 1][0]}</span>
                    <span className="hidden sm:inline">{MES[Number(m.slice(5, 7)) - 1]}</span>
                  </span>
                ))}
              </div>
              {linhas.map((l) => (
                <div key={l.id} className="contents">
                  <span className="truncate py-1.5 text-sm">{l.nome}</span>
                  <div className="relative my-1.5 h-5 rounded bg-[var(--muted)]">
                    {hojeNaJanela !== null && (
                      <span
                        aria-hidden
                        className="absolute inset-y-[-3px] w-px bg-[var(--primary)]"
                        style={{ left: `${hojeNaJanela}%` }}
                      />
                    )}
                    {l.pedacos.map((f) => {
                      const ini = f.inicio < inicioJanela ? inicioJanela : f.inicio;
                      const fim = f.fim > fimJanela ? fimJanela : f.fim;
                      return (
                        <span
                          key={f.id}
                          title={`${dataBR(f.inicio)} a ${dataBR(f.fim)} · ${diasDe(f)} dias`}
                          className="absolute inset-y-0 rounded bg-[var(--primary)]"
                          style={{ left: `${pos(ini)}%`, width: `${Math.max(pos(somarDias(fim, 1)) - pos(ini), 0.8)}%` }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---- As marcadas, para conferir e apagar ---- */}
      <FeriasMarcadas
        itens={futuras.map((f) => ({
          id: f.id,
          nome: linhas.find((l) => l.id === f.colaboradorId)?.nome ?? "Desligado",
          quando: `${formatDiaNumericoString(f.inicio)} a ${formatDiaNumericoString(f.fim)}`,
          dias: diasDe(f),
          observacao: f.observacao,
        }))}
      />
    </Pagina>
  );
}
