import { ChevronLeft, ChevronRight, Circle, CircleCheck } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { IconeNav } from "@/components/icone-nav";
import { SelectQueEnvia } from "@/components/select-que-envia";
import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { itensDaAgenda } from "@/lib/agenda";
import {
  ASSUNTOS,
  ehAssunto,
  gradeDoMes,
  mesAnterior,
  porDia,
  proximoMes,
  type Assunto,
  type ItemDaAgenda,
} from "@/lib/agenda-regras";
import { getSettings, toDateOnly, todayInTimezone } from "@/lib/availability";
import { somarDias } from "@/lib/escala";
import { formatDayAndMonth } from "@/lib/format";
import { getCurrentUser } from "@/lib/permissions";
import { can } from "@/lib/roles";


export const dynamic = "force-dynamic";
export const metadata = { title: "Programação" };

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/**
 * A Agenda da casa: o mês em grade, com a cor de cada assunto, e embaixo o
 * dia escolhido e os seis seguintes. Junta o que cada módulo tem com data
 * (`lib/agenda.ts`), só dos módulos que a pessoa abre.
 */
export default async function AgendaPage({ searchParams }: PageProps<"/admin/agenda">) {
  const [user, { capacity }, q] = await Promise.all([getCurrentUser(), getSettings(), searchParams]);
  if (!user) redirect((await cookies()).has("atalho") ? "/atalhos" : "/admin/login");
  if (user.atalho) redirect("/atalhos");

  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  const dia = typeof q.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.dia) ? q.dia : hoje;
  const mes = typeof q.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes) ? q.mes : dia.slice(0, 7);
  const assuntos = (Object.keys(ASSUNTOS) as Assunto[]).filter((a) => can(user, ASSUNTOS[a].modulo));
  const ver = ehAssunto(q.ver) && assuntos.includes(q.ver) ? q.ver : null;

  const grade = gradeDoMes(mes);
  const fimDaLista = somarDias(dia, 6);
  const de = grade[0][0] < dia ? grade[0][0] : dia;
  const ultimo = grade[grade.length - 1][6];
  const ate = ultimo > fimDaLista ? ultimo : fimDaLista;
  const todos = await itensDaAgenda(user, de, ate, hoje, tz);
  const dias = porDia(ver ? todos.filter((i) => i.assunto === ver) : todos);

  const endereco = (o: { mes?: string; dia?: string }) => {
    const p = new URLSearchParams();
    p.set("mes", o.mes ?? mes);
    if (o.dia ?? q.dia) p.set("dia", o.dia ?? dia);
    if (ver) p.set("ver", ver);
    return `/admin/agenda?${p}`;
  };
  const proximos = Array.from({ length: 6 }, (_, i) => somarDias(dia, i + 1)).filter((d) => (dias.get(d)?.length ?? 0) > 0);

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina titulo="Programação" />
      <form method="get" className="flex items-center gap-2">
        <input type="hidden" name="mes" value={mes} />
        <input type="hidden" name="dia" value={dia} />
        <SelectQueEnvia
            name="ver"
            rotulo="Mostrar na agenda"
            atual={ver ?? ""}
            opcoes={[{ valor: "", texto: "Tudo" }, ...assuntos.map((a) => ({ valor: a, texto: ASSUNTOS[a].nome }))]}
            className="field h-10 min-w-0 py-0 text-sm"
          />
      </form>

      {/* O mês: ‹ Outubro 2026 › e a volta para hoje. */}
      <section aria-label="Calendário do mês" className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 sm:p-3">
        <div className="mb-2 flex items-center gap-1">
          <Link href={endereco({ mes: mesAnterior(mes) })} aria-label="Mês anterior" className="flex size-10 items-center justify-center rounded-lg hover:bg-[var(--muted)]">
            <ChevronLeft aria-hidden className="size-5" />
          </Link>
          <p className="flex-1 text-center font-semibold">
            {MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}
          </p>
          <Link href={endereco({ mes: proximoMes(mes) })} aria-label="Próximo mês" className="flex size-10 items-center justify-center rounded-lg hover:bg-[var(--muted)]">
            <ChevronRight aria-hidden className="size-5" />
          </Link>
          {(dia !== hoje || mes !== hoje.slice(0, 7)) && (
            <Link href={endereco({ mes: hoje.slice(0, 7), dia: hoje })} className="ml-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--muted)]">
              Hoje
            </Link>
          )}
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-[var(--muted-foreground)] uppercase">
          {SEMANA.map((s) => (
            <span key={s} className="py-1">
              {s}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--border)]">
          {grade.flat().map((d) => (
            <Celula key={d} data={d} itens={dias.get(d) ?? []} doMes={d.startsWith(mes)} hoje={d === hoje} escolhido={d === dia} href={endereco({ dia: d, mes })} />
          ))}
        </div>
        {/* A legenda: a cor de cada assunto que a pessoa vê. */}
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-[var(--muted-foreground)]">
          {assuntos.map((a) => (
            <li key={a} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: ASSUNTOS[a].cor }} />
              {ASSUNTOS[a].nome}
            </li>
          ))}
        </ul>
      </section>

      <Dia titulo={capitalizar(formatDayAndMonth(toDateOnly(dia), "UTC"))} itens={dias.get(dia) ?? []} destaque />

      {proximos.length > 0 && (
        <section className="space-y-4">
          <h2 className="section-label">Próximos dias</h2>
          {proximos.map((d) => (
            <Dia key={d} titulo={capitalizar(formatDayAndMonth(toDateOnly(d), "UTC"))} itens={dias.get(d)!} />
          ))}
        </section>
      )}
    </Pagina>
  );
}

/**
 * Um dia na grade. No celular, pontos com a cor de cada assunto; no
 * computador, os primeiros compromissos escritos em etiquetas coloridas.
 */
function Celula({
  data,
  itens,
  doMes,
  hoje,
  escolhido,
  href,
}: {
  data: string;
  itens: ItemDaAgenda[];
  doMes: boolean;
  hoje: boolean;
  escolhido: boolean;
  href: string;
}) {
  const cores = [...new Set(itens.map((i) => i.assunto))];
  const atrasado = itens.some((i) => i.atrasado);
  return (
    <Link
      href={href}
      aria-label={`${data.slice(8, 10)}/${data.slice(5, 7)}: ${itens.length === 0 ? "nada" : `${itens.length} na agenda`}`}
      aria-current={escolhido ? "date" : undefined}
      className={`flex min-h-14 flex-col gap-1 p-1 sm:min-h-24 sm:p-1.5 ${doMes ? "bg-[var(--card)]" : "bg-[var(--muted)]"} ${
        escolhido ? "outline-2 -outline-offset-2 outline-[var(--primary)]" : ""
      } hover:bg-[var(--muted)]`}
    >
      <span
        className={`flex size-6 items-center justify-center self-center rounded-full text-xs tabular-nums sm:self-start ${
          hoje ? "bg-[var(--primary)] font-bold text-[var(--primary-foreground)]" : doMes ? "font-medium" : "text-[var(--muted-foreground)]"
        }`}
        style={atrasado && !hoje ? { color: "var(--destructive)", fontWeight: 700 } : undefined}
      >
        {Number(data.slice(8, 10))}
      </span>
      {/* Celular: um ponto por assunto. */}
      {cores.length > 0 && (
        <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
          {cores.map((a) => (
            <span key={a} aria-hidden className="size-1.5 rounded-full" style={{ background: ASSUNTOS[a].cor }} />
          ))}
        </span>
      )}
      {/* Computador: as três primeiras escritas, e quantas faltam. */}
      <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
        {itens.slice(0, 3).map((i) => (
          <span
            key={i.chave}
            className={`truncate rounded px-1 text-[10px] leading-4 font-medium ${i.feito ? "line-through opacity-60" : ""}`}
            style={{ background: `color-mix(in srgb, ${ASSUNTOS[i.assunto].cor} 16%, transparent)`, color: ASSUNTOS[i.assunto].cor }}
          >
            {i.titulo}
          </span>
        ))}
        {itens.length > 3 && <span className="px-1 text-[10px] text-[var(--muted-foreground)]">+{itens.length - 3}</span>}
      </span>
    </Link>
  );
}

/**
 * "Segunda-feira, 12 de outubro" com o dia da semana em destaque (negrito,
 * maior) e a data ao lado, mais apagada: é pelo dia da semana que a casa se
 * organiza ("o que tem na quinta?").
 */
function TituloDoDia({ titulo, destaque }: { titulo: string; destaque: boolean }) {
  const [semana, ...resto] = titulo.split(", ");
  return (
    <h2 className="mb-2 flex flex-wrap items-baseline gap-x-2">
      <span className={`font-bold text-[var(--foreground)] ${destaque ? "text-lg" : "text-base"}`}>{semana}</span>
      {resto.length > 0 && <span className="text-sm text-[var(--muted-foreground)]">{resto.join(", ")}</span>}
    </h2>
  );
}

/** A lista de um dia: hora, assunto pela cor, o que é, e tocar leva à tela de origem. */
function Dia({ titulo, itens, destaque = false }: { titulo: string; itens: ItemDaAgenda[]; destaque?: boolean }) {
  return (
    <section>
      <TituloDoDia titulo={titulo} destaque={destaque} />
      {itens.length === 0 ? (
        <Vazio>Nada programado neste dia.</Vazio>
      ) : (
        <Lista>
          {itens.map((i) => (
            <li key={i.chave}>
              <Link href={i.href} className="flex items-center gap-3 py-2.5 pr-3 hover:bg-[var(--muted)]">
                <span aria-hidden className="w-1 self-stretch rounded-r" style={{ background: ASSUNTOS[i.assunto].cor }} />
                {i.hora && <span className="w-10 shrink-0 text-xs font-semibold tabular-nums">{i.hora}</span>}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-medium ${i.feito ? "text-[var(--muted-foreground)] line-through" : ""}`}>{i.titulo}</span>
                  {(i.detalhe || i.atrasado) && (
                    <span className="block truncate text-xs text-[var(--muted-foreground)]">
                      {i.atrasado && (
                        <span className="font-semibold" style={{ color: "var(--destructive)" }}>
                          atrasado{i.detalhe ? " · " : ""}
                        </span>
                      )}
                      {i.detalhe}
                    </span>
                  )}
                </span>
                {i.feito ? (
                  <CircleCheck aria-label="feito" className="size-4 shrink-0" style={{ color: "var(--ok-strong)" }} />
                ) : i.atrasado ? (
                  <Circle aria-label="atrasado" className="size-4 shrink-0" style={{ color: "var(--destructive)" }} />
                ) : (
                  <span style={{ color: ASSUNTOS[i.assunto].cor }}>
                    <IconeNav nome={ASSUNTOS[i.assunto].icone} className="size-4" />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </Lista>
      )}
    </section>
  );
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
