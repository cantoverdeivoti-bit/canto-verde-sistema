import { formatInTimeZone } from "date-fns-tz";

import { aniversariosNoPeriodo, ASSUNTOS, diasNaSemana, type Assunto, type ItemDaAgenda } from "@/lib/agenda-regras";
import { dateOnlyToString, toDateOnly, toInstant } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { somarDias } from "@/lib/escala";
import { formatMoney, plural } from "@/lib/format";
import { can, type CurrentUser } from "@/lib/roles";
import { quadrosVisiveis } from "@/lib/tarefas-consulta";

/**
 * A Agenda: o que acontece em cada dia, lido na hora de cada módulo que a
 * pessoa abre. Nada é copiado: o evento marcado, a férias lançada ou a conta
 * nova aparecem aqui sozinhos. Módulo novo entra com mais uma fonte na lista
 * de `itensDaAgenda`.
 *
 * Todas as fontes saem juntas e sempre presas ao período (README, Desempenho).
 */
export async function itensDaAgenda(user: CurrentUser, de: string, ate: string, hoje: string, timezone: string): Promise<ItemDaAgenda[]> {
  const fontes: [Assunto, (p: Periodo) => Promise<ItemDaAgenda[]>][] = [
    ["eventos", eventos],
    ["reservas", reservas],
    ["pessoal", pessoal],
    ["compras", compras],
    ["financeiro", financeiro],
    ["tarefas", (p) => tarefas(p, user)],
  ];
  const periodo: Periodo = { de, ate, hoje, timezone };
  const listas = await Promise.all(fontes.filter(([a]) => can(user, ASSUNTOS[a].modulo)).map(([, f]) => f(periodo)));
  return listas.flat();
}

type Periodo = { de: string; ate: string; hoje: string; timezone: string };

const entre = (p: Periodo) => ({ gte: toDateOnly(p.de), lte: toDateOnly(p.ate) });
/** O dia na casa de um instante (pedido, tarefa): no fuso, e não em UTC. */
const diaNoFuso = (d: Date, tz: string) => formatInTimeZone(d, tz, "yyyy-MM-dd");
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Eventos e orçamentos enviados na data, o checklist com prazo e o cliente para retornar. */
async function eventos(p: Periodo): Promise<ItemDaAgenda[]> {
  const [lista, checklist, clientes] = await Promise.all([
    prisma.evento.findMany({
      where: { data: entre(p), status: { in: ["ENVIADO", "CONFIRMADO"] } },
      select: { id: true, titulo: true, status: true, data: true, horaInicio: true, convidados: true },
    }),
    prisma.eventoChecklistItem.findMany({
      where: { prazo: entre(p), evento: { status: { in: ["ENVIADO", "CONFIRMADO"] } } },
      take: 200,
      select: { id: true, texto: true, prazo: true, feito: true, evento: { select: { id: true, titulo: true } } },
    }),
    prisma.clienteEvento.findMany({
      where: { proximoContato: entre(p) },
      take: 100,
      select: { id: true, nome: true, proximoContato: true },
    }),
  ]);
  return [
    ...lista.map((e) => ({
      chave: `evento-${e.id}`,
      data: dateOnlyToString(e.data),
      hora: e.horaInicio,
      assunto: "eventos" as const,
      titulo: `${e.status === "CONFIRMADO" ? "Evento" : "Orçamento"}: ${e.titulo}`,
      detalhe: plural(e.convidados, "convidado", "convidados"),
      href: `/admin/eventos/orcamentos/${e.id}`,
      feito: false,
      atrasado: false,
    })),
    ...checklist.map((c) => {
      const data = dateOnlyToString(c.prazo!);
      return {
        chave: `checklist-${c.id}`,
        data,
        hora: null,
        assunto: "eventos" as const,
        titulo: c.texto,
        detalhe: c.evento.titulo,
        href: `/admin/eventos/orcamentos/${c.evento.id}`,
        feito: c.feito,
        atrasado: !c.feito && data < p.hoje,
      };
    }),
    ...clientes.map((c) => {
      const data = dateOnlyToString(c.proximoContato!);
      return {
        chave: `cliente-${c.id}`,
        data,
        hora: null,
        assunto: "eventos" as const,
        titulo: `Retornar para ${c.nome}`,
        detalhe: null,
        href: `/admin/eventos/clientes/${c.id}`,
        feito: false,
        atrasado: data < p.hoje,
      };
    }),
  ];
}

/** As reservas de cada dia, somadas (sem nome de cliente), e o dia fechado ou com horário especial. */
async function reservas(p: Periodo): Promise<ItemDaAgenda[]> {
  const [porDia, especiais] = await Promise.all([
    prisma.reservation.groupBy({
      by: ["serviceDate"],
      where: { serviceDate: entre(p), status: { in: ["CONFIRMED", "PENDING"] } },
      _count: { _all: true },
      _sum: { partySize: true },
    }),
    prisma.specialDate.findMany({ where: { date: entre(p) }, select: { date: true, isClosed: true, opensAt: true, closesAt: true, note: true } }),
  ]);
  return [
    ...porDia.map((r) => {
      const data = dateOnlyToString(r.serviceDate);
      return {
        chave: `reservas-${data}`,
        data,
        hora: null,
        assunto: "reservas" as const,
        titulo: plural(r._count._all, "reserva", "reservas"),
        detalhe: plural(r._sum.partySize ?? 0, "pessoa", "pessoas"),
        href: `/admin/comercial?date=${data}`,
        feito: false,
        atrasado: false,
      };
    }),
    ...especiais.map((s) => {
      const data = dateOnlyToString(s.date);
      return {
        chave: `especial-${data}`,
        data,
        hora: null,
        assunto: "reservas" as const,
        titulo: s.isClosed ? "Casa fechada" : `Horário especial ${s.opensAt ?? ""}–${s.closesAt ?? ""}`,
        detalhe: s.note,
        href: "/admin/comercial/configuracoes",
        feito: false,
        atrasado: false,
      };
    }),
  ];
}

/** Quem sai e quem volta de férias, os aniversários e o tempo de casa. */
async function pessoal(p: Periodo): Promise<ItemDaAgenda[]> {
  const [ferias, pessoas] = await Promise.all([
    prisma.ferias.findMany({
      // Começa no período, ou a volta (dia seguinte ao fim) cai nele.
      where: { OR: [{ inicio: entre(p) }, { fim: { gte: toDateOnly(somarDias(p.de, -1)), lte: toDateOnly(somarDias(p.ate, -1)) } }] },
      select: { id: true, inicio: true, fim: true, colaborador: { select: { nome: true, apelido: true } } },
    }),
    prisma.colaborador.findMany({
      where: { ativo: true, pendente: false, OR: [{ nascimento: { not: null } }, { comecouEm: { not: null } }, { admissao: { not: null } }] },
      select: { id: true, nome: true, apelido: true, nascimento: true, comecouEm: true, admissao: true },
    }),
  ]);
  const itens: ItemDaAgenda[] = [];
  const base = { hora: null, assunto: "pessoal" as const, feito: false, atrasado: false };
  for (const f of ferias) {
    const quem = f.colaborador.apelido ?? f.colaborador.nome;
    const [inicio, fim] = [dateOnlyToString(f.inicio), dateOnlyToString(f.fim)];
    const volta = somarDias(fim, 1);
    if (inicio >= p.de && inicio <= p.ate) {
      itens.push({ ...base, chave: `ferias-${f.id}`, data: inicio, titulo: `Férias: ${quem}`, detalhe: `até ${ddmm(fim)}`, href: "/admin/pessoal/ferias" });
    }
    if (volta >= p.de && volta <= p.ate) {
      itens.push({ ...base, chave: `volta-${f.id}`, data: volta, titulo: `${quem} volta das férias`, detalhe: null, href: "/admin/pessoal/ferias" });
    }
  }
  for (const c of pessoas) {
    const quem = c.apelido ?? c.nome;
    const href = `/admin/pessoal/colaboradores/${c.id}`;
    if (c.nascimento) {
      for (const a of aniversariosNoPeriodo(dateOnlyToString(c.nascimento), p.de, p.ate)) {
        itens.push({ ...base, chave: `aniversario-${c.id}-${a.data}`, data: a.data, titulo: `Aniversário: ${quem}`, detalhe: `${a.anos} anos`, href });
      }
    }
    const casa = c.comecouEm ?? c.admissao;
    if (casa) {
      for (const a of aniversariosNoPeriodo(dateOnlyToString(casa), p.de, p.ate)) {
        itens.push({ ...base, chave: `casa-${c.id}-${a.data}`, data: a.data, titulo: `${plural(a.anos, "ano", "anos")} de casa: ${quem}`, detalhe: null, href });
      }
    }
  }
  return itens;
}

/** A compra de rotina em cada dia da semana dela e as entregas previstas. */
async function compras(p: Periodo): Promise<ItemDaAgenda[]> {
  const [listas, pedidos] = await Promise.all([
    prisma.listaCompra.findMany({
      where: { ativa: true },
      select: { id: true, nome: true, diaSemana: true, fornecedor: { select: { name: true, apelido: true } } },
    }),
    prisma.pedidoCompra.findMany({
      where: {
        estatus: { not: "CANCELADO" },
        dataEntregaPrevista: { gte: toInstant(p.de, "00:00", p.timezone), lt: toInstant(somarDias(p.ate, 1), "00:00", p.timezone) },
      },
      take: 300,
      select: { id: true, dataEntregaPrevista: true, entregaConfirmada: true, fornecedor: { select: { name: true, apelido: true } } },
    }),
  ]);
  return [
    ...listas.flatMap((l) =>
      diasNaSemana(l.diaSemana, p.de, p.ate).map((data) => ({
        chave: `rotina-${l.id}-${data}`,
        data,
        hora: null,
        assunto: "compras" as const,
        titulo: `Comprar de ${l.fornecedor.apelido ?? l.fornecedor.name}`,
        // O nome da lista é o fornecedor e o dia ("Nativus · segunda"): repetiria
        // o título e o dia que a agenda já mostra.
        detalhe: null,
        href: `/admin/compras/listas/${l.id}`,
        feito: false,
        atrasado: false,
      })),
    ),
    ...pedidos.map((e) => ({
      chave: `entrega-${e.id}`,
      data: diaNoFuso(e.dataEntregaPrevista!, p.timezone),
      hora: null,
      assunto: "compras" as const,
      titulo: `Entrega: ${e.fornecedor.apelido ?? e.fornecedor.name}`,
      detalhe: e.entregaConfirmada ? "recebido" : `pedido #${e.id}`,
      href: `/admin/compras/pedidos/${e.id}`,
      feito: e.entregaConfirmada,
      atrasado: false,
    })),
  ];
}

/** As contas de cada dia, somadas por pagar e receber: o dia vira uma linha, e não vinte. */
async function financeiro(p: Periodo): Promise<ItemDaAgenda[]> {
  const grupos = await prisma.lancamento.groupBy({
    by: ["vencimento", "tipo", "status"],
    where: { vencimento: entre(p), status: { not: "CANCELADO" } },
    _count: { _all: true },
    _sum: { valor: true },
  });
  const dias = new Map<string, { data: string; tipo: "PAGAR" | "RECEBER"; n: number; abertas: number; total: number }>();
  for (const g of grupos) {
    const data = dateOnlyToString(g.vencimento);
    const chave = `${data}-${g.tipo}`;
    const d = dias.get(chave) ?? { data, tipo: g.tipo, n: 0, abertas: 0, total: 0 };
    d.n += g._count._all;
    if (g.status === "ABERTO") d.abertas += g._count._all;
    d.total += g._sum.valor?.toNumber() ?? 0;
    dias.set(chave, d);
  }
  return [...dias.values()].map((d) => {
    const pagar = d.tipo === "PAGAR";
    return {
      chave: `contas-${d.data}-${d.tipo}`,
      data: d.data,
      hora: null,
      assunto: "financeiro" as const,
      titulo: `${plural(d.n, "conta", "contas")} a ${pagar ? "pagar" : "receber"}`,
      detalhe: formatMoney(d.total) + (d.abertas > 0 && d.abertas < d.n ? ` · ${d.abertas} em aberto` : ""),
      href: pagar ? "/admin/financeiro/pagar" : "/admin/financeiro/receber",
      feito: d.abertas === 0,
      atrasado: d.abertas > 0 && d.data < p.hoje,
    };
  });
}

/** As tarefas da pessoa ou do setor dela com prazo no período. */
async function tarefas(p: Periodo, user: CurrentUser): Promise<ItemDaAgenda[]> {
  const lista = await prisma.tarefa.findMany({
    where: {
      excluidoEm: null,
      status: { in: ["ABERTA", "CONCLUIDA"] },
      projeto: { arquivadoEm: null, ...quadrosVisiveis(user) },
      prazo: { gte: toInstant(p.de, "00:00", p.timezone), lt: toInstant(somarDias(p.ate, 1), "00:00", p.timezone) },
      OR: [{ responsavelId: user.id }, { setorResponsavel: { pessoas: { some: { id: user.id } } } }],
    },
    take: 300,
    select: { id: true, titulo: true, status: true, prazo: true, prazoDiaInteiro: true, projeto: { select: { nome: true } } },
  });
  return lista.map((t) => {
    const data = diaNoFuso(t.prazo!, p.timezone);
    const feito = t.status === "CONCLUIDA";
    return {
      chave: `tarefa-${t.id}`,
      data,
      hora: t.prazoDiaInteiro ? null : formatInTimeZone(t.prazo!, p.timezone, "HH:mm"),
      assunto: "tarefas" as const,
      titulo: t.titulo,
      detalhe: t.projeto.nome,
      href: `/admin/tarefas/t/${t.id}`,
      feito,
      atrasado: !feito && data < p.hoje,
    };
  });
}
