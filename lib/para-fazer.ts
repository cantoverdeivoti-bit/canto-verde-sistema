import { toDateOnly, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { diaDaSemanaHoje, formatMoney } from "@/lib/format";
import type { NomeDoIcone } from "@/lib/modules";
import { inicioDeHoje } from "@/lib/requisicao";
import { can, type CurrentUser } from "@/lib/roles";
import { SEM_SITUACAO, situacaoDasRotinas } from "@/lib/rotina-de-hoje";
import { situacaoDoPrazo } from "@/lib/tarefas-labels";
import { quadrosVisiveis } from "@/lib/tarefas-consulta";

/**
 * O que a pessoa tem para fazer hoje, de todos os módulos que ela abre: as
 * tarefas dela (ou do setor dela) com prazo até hoje, e o que os outros
 * módulos pedem no dia (a rotina de compra, a entrega, a conta, o evento).
 *
 * Nada aqui é gravado: cada item é lido da origem na hora e fica "feito"
 * sozinho quando a coisa acontece lá (o pedido enviado, a conta paga). A
 * Agenda vai ler estas mesmas origens para os outros dias.
 */
export type ItemParaFazer = {
  chave: string;
  icone: NomeDoIcone;
  titulo: string;
  detalhe: string | null;
  href: string;
  feito: boolean;
  atrasado: boolean;
};

export async function paraFazerHoje(user: CurrentUser, timezone: string): Promise<ItemParaFazer[]> {
  const inicio = inicioDeHoje(timezone);
  const fim = new Date(inicio.getTime() + 86_400_000);
  const hoje = todayInTimezone(timezone);
  const dia = toDateOnly(hoje);

  const [tarefas, rotinas, entregas, contas, eventos] = await Promise.all([
    can(user, "tarefas") ? tarefasDoDia(user, fim, inicio, timezone) : [],
    can(user, "compras") ? rotinasDoDia(user, timezone) : [],
    can(user, "compras") ? entregasDoDia(dia) : [],
    can(user, "financeiro") ? contasDoDia(dia) : [],
    can(user, "eventos") ? eventosDoDia(dia, inicio) : [],
  ]);
  // O que falta primeiro (atrasado na frente), o que já foi feito no fim.
  return [...tarefas, ...rotinas, ...entregas, ...contas, ...eventos].sort(
    (a, b) => Number(a.feito) - Number(b.feito) || Number(b.atrasado) - Number(a.atrasado),
  );
}

/** As tarefas da pessoa ou do setor dela, abertas com prazo até hoje, e as que ela fechou hoje. */
async function tarefasDoDia(user: CurrentUser, fim: Date, inicio: Date, timezone: string): Promise<ItemParaFazer[]> {
  const agora = new Date();
  const lista = await prisma.tarefa.findMany({
    where: {
      excluidoEm: null,
      projeto: { arquivadoEm: null, ...quadrosVisiveis(user) },
      prazo: { lt: fim },
      AND: [
        { OR: [{ responsavelId: user.id }, { setorResponsavel: { pessoas: { some: { id: user.id } } } }] },
        { OR: [{ status: "ABERTA" }, { status: "CONCLUIDA", concluidoEm: { gte: inicio } }] },
      ],
    },
    orderBy: [{ prazo: "asc" }, { id: "asc" }],
    take: 40,
    select: { id: true, titulo: true, status: true, prazo: true, prazoDiaInteiro: true, projeto: { select: { nome: true } } },
  });
  return lista.map((t) => {
    const prazo = situacaoDoPrazo(t.prazo, t.prazoDiaInteiro, timezone, agora);
    const feito = t.status === "CONCLUIDA";
    return {
      chave: `tarefa-${t.id}`,
      icone: "tarefas",
      titulo: t.titulo,
      detalhe: feito ? t.projeto.nome : [t.projeto.nome, prazo?.texto].filter(Boolean).join(" · "),
      href: `/admin/tarefas/t/${t.id}`,
      feito,
      atrasado: !feito && (prazo?.atrasada ?? false),
    };
  });
}

/**
 * As compras de rotina de hoje, no passo em que estão: contar, terminar de
 * contar, mandar o pedido (só quem compra) ou feito. Para o estoquista, a
 * contagem finalizada já é a parte dele.
 */
async function rotinasDoDia(user: CurrentUser, timezone: string): Promise<ItemParaFazer[]> {
  const deHoje = { diaSemana: diaDaSemanaHoje(timezone), ativa: true };
  const [listas, situacao] = await Promise.all([
    prisma.listaCompra.findMany({ where: deHoje, select: { id: true, nome: true, fornecedor: { select: { name: true, apelido: true } } } }),
    situacaoDasRotinas(deHoje, timezone),
  ]);
  const comprador = can(user, "compras", { configure: true });
  return listas.map((l) => {
    const { contagem, pedido } = situacao.get(l.id) ?? SEM_SITUACAO;
    const quem = l.fornecedor.apelido ?? l.fornecedor.name;
    const base = { chave: `rotina-${l.id}`, icone: "listas" as const, atrasado: false };
    if (pedido?.enviado) {
      return { ...base, titulo: `Comprar de ${quem}`, detalhe: "pedido enviado", href: `/admin/compras/pedidos/${pedido.id}`, feito: true };
    }
    if (pedido) {
      return comprador
        ? { ...base, titulo: `Enviar o pedido de ${quem}`, detalhe: "contagem feita, falta mandar", href: `/admin/compras/pedidos/${pedido.id}`, feito: false }
        : { ...base, titulo: `Contar ${quem}`, detalhe: "contagem feita, o pedido está com o comprador", href: `/admin/compras/listas/${l.id}`, feito: true };
    }
    if (contagem) {
      return {
        ...base,
        titulo: `Terminar a contagem de ${quem}`,
        detalhe: `${contagem.feitos} de ${contagem.total} contados`,
        href: `/estoquista/contagem/${contagem.token}`,
        feito: false,
      };
    }
    return { ...base, titulo: `Contar e pedir: ${quem}`, detalhe: l.nome, href: `/admin/compras/listas/${l.id}`, feito: false };
  });
}

/** Os pedidos que o fornecedor disse que chegam hoje. */
async function entregasDoDia(dia: Date): Promise<ItemParaFazer[]> {
  const pedidos = await prisma.pedidoCompra.findMany({
    where: { estatus: { not: "CANCELADO" }, dataEntregaPrevista: { gte: dia, lt: new Date(dia.getTime() + 86_400_000) } },
    orderBy: { id: "asc" },
    take: 30,
    select: { id: true, entregaConfirmada: true, fornecedor: { select: { name: true, apelido: true } } },
  });
  return pedidos.map((p) => ({
    chave: `entrega-${p.id}`,
    icone: "recebimentos",
    titulo: `Receber o pedido de ${p.fornecedor.apelido ?? p.fornecedor.name}`,
    detalhe: p.entregaConfirmada ? "recebido" : `pedido #${p.id}`,
    href: `/admin/compras/pedidos/${p.id}`,
    feito: p.entregaConfirmada,
    atrasado: false,
  }));
}

/**
 * As contas que vencem hoje (e as pagas hoje que venciam hoje, como feitas).
 * As que já venceram antes viram uma linha só, para não encher o cartão.
 */
async function contasDoDia(dia: Date): Promise<ItemParaFazer[]> {
  const [deHoje, vencidas] = await Promise.all([
    prisma.lancamento.findMany({
      where: { vencimento: dia, status: { not: "CANCELADO" } },
      orderBy: [{ tipo: "asc" }, { valor: "desc" }],
      take: 20,
      select: { id: true, tipo: true, descricao: true, valor: true, status: true },
    }),
    prisma.lancamento.groupBy({ by: ["tipo"], where: { status: "ABERTO", vencimento: { lt: dia } }, _count: { _all: true } }),
  ]);
  const itens: ItemParaFazer[] = deHoje.map((l) => ({
    chave: `conta-${l.id}`,
    icone: l.tipo === "PAGAR" ? "pagar" : "receber",
    titulo: `${l.tipo === "PAGAR" ? "Pagar" : "Receber"}: ${l.descricao}`,
    detalhe: formatMoney(l.valor.toNumber()),
    href: l.tipo === "PAGAR" ? "/admin/financeiro/pagar" : "/admin/financeiro/receber",
    feito: l.status === "PAGO",
    atrasado: false,
  }));
  for (const v of vencidas) {
    const n = v._count._all;
    const pagar = v.tipo === "PAGAR";
    itens.push({
      chave: `vencidas-${v.tipo}`,
      icone: pagar ? "pagar" : "receber",
      titulo: `${n} ${n === 1 ? "conta" : "contas"} ${pagar ? "a pagar" : "a receber"} ${n === 1 ? "vencida" : "vencidas"}`,
      detalhe: null,
      href: pagar ? "/admin/financeiro/pagar" : "/admin/financeiro/receber",
      feito: false,
      atrasado: true,
    });
  }
  return itens;
}

/** O evento confirmado de hoje, o checklist com prazo até hoje e o cliente para retornar. */
async function eventosDoDia(dia: Date, inicio: Date): Promise<ItemParaFazer[]> {
  const [eventos, checklist, clientes] = await Promise.all([
    prisma.evento.findMany({
      where: { data: dia, status: "CONFIRMADO" },
      orderBy: { horaInicio: "asc" },
      select: { id: true, titulo: true, horaInicio: true, convidados: true },
    }),
    prisma.eventoChecklistItem.findMany({
      where: {
        prazo: { lte: dia },
        evento: { status: { in: ["ENVIADO", "CONFIRMADO"] } },
        OR: [{ feito: false }, { feitoEm: { gte: inicio } }],
      },
      orderBy: { prazo: "asc" },
      take: 20,
      select: { id: true, texto: true, prazo: true, feito: true, evento: { select: { id: true, titulo: true } } },
    }),
    prisma.clienteEvento.findMany({
      where: { proximoContato: { lte: dia } },
      orderBy: { proximoContato: "asc" },
      take: 10,
      select: { id: true, nome: true, proximoContato: true },
    }),
  ]);
  return [
    ...eventos.map((e) => ({
      chave: `evento-${e.id}`,
      icone: "eventos" as const,
      titulo: `Evento: ${e.titulo}`,
      detalhe: [e.horaInicio, `${e.convidados} convidados`].filter(Boolean).join(" · "),
      href: `/admin/eventos/orcamentos/${e.id}`,
      feito: false,
      atrasado: false,
    })),
    ...checklist.map((c) => ({
      chave: `checklist-${c.id}`,
      icone: "checklist" as const,
      titulo: c.texto,
      detalhe: c.evento.titulo,
      href: `/admin/eventos/orcamentos/${c.evento.id}`,
      feito: c.feito,
      atrasado: !c.feito && c.prazo !== null && c.prazo < dia,
    })),
    ...clientes.map((c) => ({
      chave: `cliente-${c.id}`,
      icone: "pessoas" as const,
      titulo: `Retornar para ${c.nome}`,
      detalhe: null,
      href: `/admin/eventos/clientes/${c.id}`,
      feito: false,
      atrasado: c.proximoContato !== null && c.proximoContato < dia,
    })),
  ];
}
