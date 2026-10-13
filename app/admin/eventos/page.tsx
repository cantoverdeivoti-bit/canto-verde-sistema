import { Plus } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Lista, Pagina, Vazio } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { dateOnlyToString, toDateOnly, todayInTimezone } from "@/lib/availability";
import { corDoTom } from "@/lib/cotacao-labels";
import { prisma } from "@/lib/db";
import { STATUS_EVENTO, TIPO_EVENTO } from "@/lib/eventos";
import { resumirEvento, RESUMO_DO_EVENTO } from "@/lib/eventos-dados";
import { FUSO_DA_CASA, formatDiaCurtoString, formatMoney, plural } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Próximos eventos · Eventos" };

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * O que vem pela frente: eventos confirmados e orçamentos em aberto por data,
 * e o que pede alguém agora (retorno a clientes, tarefas atrasadas, evento
 * que já passou e não foi fechado).
 */
export default async function AgendaDeEventosPage() {
  const hoje = todayInTimezone(FUSO_DA_CASA);
  const diaDeHoje = toDateOnly(hoje);

  const [proximos, passados, vencidos, tarefas, retornar] = await Promise.all([
    prisma.evento.findMany({
      where: { status: { in: ["RASCUNHO", "ENVIADO", "CONFIRMADO"] }, data: { gte: diaDeHoje } },
      orderBy: [{ data: "asc" }, { horaInicio: "asc" }],
      select: { ...RESUMO_DO_EVENTO, checklist: { select: { feito: true } } },
    }),
    prisma.evento.findMany({
      where: { status: "CONFIRMADO", data: { lt: diaDeHoje } },
      orderBy: { data: "asc" },
      select: { id: true, titulo: true, data: true },
    }),
    prisma.evento.findMany({
      where: { status: "ENVIADO", validoAte: { lt: diaDeHoje }, data: { gte: diaDeHoje } },
      orderBy: { validoAte: "asc" },
      select: { id: true, titulo: true, validoAte: true, cliente: { select: { nome: true } } },
    }),
    prisma.eventoChecklistItem.findMany({
      where: { feito: false, prazo: { lte: diaDeHoje }, evento: { status: "CONFIRMADO" } },
      orderBy: { prazo: "asc" },
      take: 12,
      select: { id: true, texto: true, prazo: true, evento: { select: { id: true, titulo: true } } },
    }),
    prisma.clienteEvento.findMany({
      where: { proximoContato: { lte: diaDeHoje } },
      orderBy: { proximoContato: "asc" },
      select: { id: true, nome: true, proximoContato: true },
    }),
  ]);

  const eventos = proximos.map((e) => {
    const r = resumirEvento(e);
    return { ...r, tarefas: e.checklist.length, feitas: e.checklist.filter((t) => t.feito).length };
  });
  const confirmados = eventos.filter((e) => e.status === "CONFIRMADO");
  const emAberto = eventos.filter((e) => e.status !== "CONFIRMADO");
  const porData = new Map<string, number>();
  for (const e of confirmados) porData.set(e.data, (porData.get(e.data) ?? 0) + 1);

  const meses = new Map<string, typeof eventos>();
  for (const e of eventos) {
    const chave = e.data.slice(0, 7);
    meses.set(chave, [...(meses.get(chave) ?? []), e]);
  }
  const atencao = passados.length + vencidos.length + tarefas.length + retornar.length;

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        titulo="Próximos eventos"
        acoes={
          <Button asChild>
            <Link href="/admin/eventos/orcamentos/novo">
              <Plus aria-hidden className="size-4" />
              Novo orçamento
            </Link>
          </Button>
        }
      />

      <section aria-label="Números" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Confirmados pela frente" valor={String(confirmados.length)} />
        <Numero rotulo="A receber deles" valor={formatMoney(confirmados.reduce((s, e) => s + e.saldo, 0))} />
        <Numero rotulo="Orçamentos em aberto" valor={String(emAberto.length)} />
        <Numero rotulo="Valor em negociação" valor={formatMoney(emAberto.reduce((s, e) => s + e.totalCliente, 0))} />
      </section>

      {atencao > 0 && (
        <section>
          <h2 className="section-label mb-2">Pede atenção</h2>
          <Lista className="text-sm">
            {passados.map((e) => (
              <Aviso key={`p${e.id}`} href={`/admin/eventos/orcamentos/${e.id}`} texto={`${e.titulo}: a data passou (${formatDiaCurtoString(dateOnlyToString(e.data))}). Marque como realizado.`} />
            ))}
            {vencidos.map((e) => (
              <Aviso key={`v${e.id}`} href={`/admin/eventos/orcamentos/${e.id}`} texto={`${e.titulo} (${e.cliente.nome}): a validade do orçamento venceu. Hora de retomar a conversa.`} />
            ))}
            {retornar.map((c) => (
              <Aviso key={`c${c.id}`} href={`/admin/eventos/clientes/${c.id}`} texto={`Retornar para ${c.nome}${c.proximoContato && dateOnlyToString(c.proximoContato) < hoje ? `, desde ${formatDiaCurtoString(dateOnlyToString(c.proximoContato))}` : " hoje"}.`} />
            ))}
            {tarefas.map((t) => (
              <Aviso
                key={`t${t.id}`}
                href={`/admin/eventos/orcamentos/${t.evento.id}`}
                texto={`${t.evento.titulo}: ${t.texto}${t.prazo && dateOnlyToString(t.prazo) < hoje ? ` (atrasada desde ${formatDiaCurtoString(dateOnlyToString(t.prazo))})` : " (hoje)"}`}
              />
            ))}
          </Lista>
        </section>
      )}

      <section>
        <h2 className="section-label mb-2">Pela frente</h2>
        {eventos.length === 0 ? (
          <Vazio>Nenhum evento nem orçamento com data pela frente.</Vazio>
        ) : (
          [...meses.entries()].map(([mes, lista]) => (
            <div key={mes} className="mb-4">
              <p className="mb-1 text-sm font-semibold capitalize">
                {MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}
              </p>
              <Lista>
                {lista.map((e) => {
                  const confirmado = e.status === "CONFIRMADO";
                  const choque = (porData.get(e.data) ?? 0) > (confirmado ? 1 : 0);
                  return (
                    <li key={e.id} className={confirmado ? "" : "opacity-75"}>
                      <Link href={`/admin/eventos/orcamentos/${e.id}`} className="flex min-h-16 items-center gap-3 px-3 py-2 hover:bg-[var(--muted)]">
                        <div className="num-display w-14 shrink-0 text-center text-sm leading-tight">
                          {e.data.slice(8, 10)}
                          <span className="block text-[11px] font-normal text-[var(--muted-foreground)]">{formatDiaCurtoString(e.data).split(",")[0]}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{e.titulo}</p>
                          <p className="truncate text-xs text-[var(--muted-foreground)]">
                            {[
                              e.horaInicio,
                              e.cliente.nome,
                              TIPO_EVENTO[e.tipo],
                              plural(e.convidados, "convidado"),
                              confirmado && e.tarefas > 0 ? `checklist ${e.feitas}/${e.tarefas}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          {choque && <p className="text-xs font-semibold" style={{ color: "var(--destructive)" }}>Outro evento confirmado nesta data</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="selo" style={{ color: corDoTom(STATUS_EVENTO[e.status].tom) }}>
                            {STATUS_EVENTO[e.status].texto}
                          </span>
                          <p className="num-display mt-1 text-sm">{formatMoney(e.totalCliente)}</p>
                          {confirmado && e.saldo > 0 && <p className="text-[11px] text-[var(--muted-foreground)]">falta {formatMoney(e.saldo)}</p>}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </Lista>
            </div>
          ))
        )}
      </section>
    </Pagina>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="card p-3">
      <p className="text-xs text-[var(--muted-foreground)]">{rotulo}</p>
      <p className="num-display text-lg">{valor}</p>
    </div>
  );
}

function Aviso({ href, texto }: { href: string; texto: string }) {
  return (
    <li>
      <Link href={href} className="block px-3 py-2.5 hover:bg-[var(--muted)]">
        {texto}
      </Link>
    </li>
  );
}
