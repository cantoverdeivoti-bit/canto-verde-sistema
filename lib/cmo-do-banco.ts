import { dateOnlyToString, getSettings, toDateOnly, todayInTimezone } from "@/lib/availability";
import {
  projecaoDoMes,
  SEMANAS_POR_MES,
  type FonteDoFaturamento,
  type ItemDeCusto,
  type PessoaDoCmo,
  type ProjecaoDoCmo,
} from "@/lib/cmo";
import { custoDiarioDaPessoa, orcamentoDoDia } from "@/lib/cmo-orcamento";
import { prisma } from "@/lib/db";
import { segundaDaSemana } from "@/lib/escala";
import { Prisma } from "@/generated/prisma/client";

/** Quantas semanas de faturamento de Compras entram na média, quando não há mês digitado. */
const SEMANAS_DA_MEDIA = 4;
/** Quantos meses digitados entram na média do faturamento da projeção. */
const MESES_DA_MEDIA = 3;

export async function hojeDaCasa(): Promise<string> {
  const { capacity } = await getSettings();
  return todayInTimezone(capacity.timezone);
}

/** A meta do CMO em % do faturamento, ou nulo. */
export async function metaDoCmo(): Promise<number | null> {
  const c = await prisma.configuracaoPessoal.findUnique({ where: { id: 1 }, select: { metaCmo: true } });
  return c?.metaCmo?.toNumber() ?? null;
}

/** Os encargos e benefícios do cadastro, encargos primeiro, na ordem em que foram criados. */
export async function itensDeCusto(): Promise<ItemDeCusto[]> {
  const itens = await prisma.itemDeCusto.findMany({ orderBy: [{ natureza: "asc" }, { id: "asc" }] });
  return itens.map((i) => ({
    id: i.id,
    nome: i.nome,
    natureza: i.natureza,
    forma: i.forma,
    valor: i.valor.toNumber(),
    tipos: i.tipos,
    ativo: i.ativo,
  }));
}

/**
 * Tudo o que a projeção precisa: as pessoas (ativas e desligadas, para a
 * simulação) com as exceções de cada uma, os dias de escala fixa, os
 * encargos e benefícios, a meta e o faturamento de um mês.
 */
export async function dadosDoCmo(hoje: string) {
  const [colaboradores, fixa, itens, meta, orcamentos, meses, excecoes] = await Promise.all([
    prisma.colaborador.findMany({
      where: { pendente: false },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        apelido: true,
        tipo: true,
        ativo: true,
        salario: true,
        diaria: true,
        diariasDoDia: { select: { diaSemana: true, valor: true } },
        desligadoEm: true,
      },
    }),
    // Só os postos ligados: posto desligado não entra na escala. A empresa
    // terceirizada fica fora da projeção: ela cobre faltas, e o custo dela
    // aparece na semana em que foi chamada (o custo da escala).
    prisma.escalaFixa.findMany({
      where: { posto: { ativo: true }, colaboradorId: { not: null } },
      select: { colaboradorId: true, diaSemana: true },
    }),
    itensDeCusto(),
    metaDoCmo(),
    // O orçamento da semana S guarda o faturamento da semana anterior a S.
    prisma.orcamentoSemana.findMany({
      where: { semana: { lte: toDateOnly(segundaDaSemana(hoje)) } },
      orderBy: { semana: "desc" },
      take: SEMANAS_DA_MEDIA,
      select: { faturamentoAnterior: true },
    }),
    // Os últimos meses fechados com faturamento digitado (o corrente ainda não fechou).
    prisma.faturamentoDoMes.findMany({
      where: { mes: { lt: hoje.slice(0, 7) } },
      orderBy: { mes: "desc" },
      take: MESES_DA_MEDIA,
      select: { valor: true },
    }),
    prisma.itemDoColaborador.findMany({ select: { colaboradorId: true, itemId: true, recebe: true, valor: true } }),
  ]);

  const dias = new Map<number, Set<number>>();
  for (const f of fixa) {
    if (f.colaboradorId === null) continue;
    if (!dias.has(f.colaboradorId)) dias.set(f.colaboradorId, new Set());
    dias.get(f.colaboradorId)!.add(f.diaSemana);
  }

  const pessoas: (PessoaDoCmo & { desligadoEm: string | null })[] = colaboradores.map((c) => ({
    id: c.id,
    nome: c.apelido ?? c.nome,
    tipo: c.tipo,
    ativo: c.ativo,
    salario: c.salario?.toNumber() ?? null,
    diaria: c.diaria?.toNumber() ?? null,
    diariasPorDia: Object.fromEntries(c.diariasDoDia.map((d) => [d.diaSemana, d.valor.toNumber()])),
    diasPorSemana: dias.get(c.id)?.size ?? 0,
    diasDaSemana: [...(dias.get(c.id) ?? [])],
    excecoes: Object.fromEntries(excecoes.filter((e) => e.colaboradorId === c.id).map((e) => [e.itemId, e.recebe])),
    valores: Object.fromEntries(
      excecoes.filter((e) => e.colaboradorId === c.id && e.valor !== null).map((e) => [e.itemId, e.valor!.toNumber()]),
    ),
    desligadoEm: c.desligadoEm ? dateOnlyToString(c.desligadoEm) : null,
  }));

  // O faturamento de um mês para a projeção: a média dos meses digitados; sem
  // nenhum, a média semanal do orçamento de Compras vezes as semanas do mês.
  const media = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
  const mensais = meses.map((m) => m.valor.toNumber());
  const semanais = orcamentos.map((o) => o.faturamentoAnterior.toNumber());
  const [faturamentoMensal, fonte]: [number | null, FonteDoFaturamento] =
    mensais.length > 0
      ? [media(mensais), { de: "meses", quantos: mensais.length }]
      : semanais.length > 0
        ? [media(semanais) * SEMANAS_POR_MES, { de: "semanas", quantos: semanais.length }]
        : [null, null];

  return { pessoas, itens, meta, faturamentoMensal, fonte };
}

/**
 * Grava a projeção de hoje como o registro do mês corrente. Chamada a cada
 * mudança que mexe no custo (cadastro, escala fixa, posto, encargos e
 * benefícios) e ao
 * abrir a escala ou o relatório; virado o mês, o registro dele fica com o
 * último valor. Nunca derruba quem chamou: registrar é secundário.
 */
export async function registrarCmoDoMes(): Promise<ProjecaoDoCmo | null> {
  try {
    const hoje = await hojeDaCasa();
    const { pessoas, itens, faturamentoMensal } = await dadosDoCmo(hoje);
    const p = projecaoDoMes({ pessoas, itens, faturamentoMensal });
    const dados = {
      total: new Prisma.Decimal(p.total),
      clt: new Prisma.Decimal(p.clt.total),
      fixo: new Prisma.Decimal(p.fixo.total),
      free: new Prisma.Decimal(p.free.total),
      faturamento: p.faturamento === null ? null : new Prisma.Decimal(p.faturamento),
      percentual: p.percentual === null ? null : new Prisma.Decimal(p.percentual),
      itens: p.itens.map((i) => ({ nome: i.nome, natureza: i.natureza, total: i.total })),
      pessoas: p.linhas.map((l) => ({ id: l.id, nome: l.nome, tipo: l.tipo, total: l.total })),
    };
    const mes = hoje.slice(0, 7);
    await prisma.cmoDoMes.upsert({ where: { mes }, create: { mes, ...dados }, update: dados });
    return p;
  } catch (error) {
    console.error("[registrarCmoDoMes] falha:", error);
    return null;
  }
}

/** Registra o mês corrente se ele ainda não tem registro. Barato para chamar em toda abertura da escala. */
export async function garantirRegistroDoMes(): Promise<void> {
  const mes = (await hojeDaCasa()).slice(0, 7);
  const tem = await prisma.cmoDoMes.findUnique({ where: { mes }, select: { mes: true } });
  if (!tem) await registrarCmoDoMes();
}

/**
 * O que a Escala e o orçamento do CMO precisam para uns dias: o custo por dia
 * de cada pessoa (com encargos e benefícios) e o orçamento de cada dia. O
 * faturamento de um mês é o digitado para ele; sem digitado, a média que a
 * projeção do CMO usa.
 */
export async function contaDaMaoDeObra(hoje: string, dias: string[]) {
  const meses = [...new Set(dias.map((d) => d.slice(0, 7)))];
  const [{ pessoas, itens, meta, faturamentoMensal }, digitados] = await Promise.all([
    dadosDoCmo(hoje),
    prisma.faturamentoDoMes.findMany({ where: { mes: { in: meses } }, select: { mes: true, valor: true } }),
  ]);
  const doMes = new Map(digitados.map((f) => [f.mes, f.valor.toNumber()]));
  const faturamentoDe = (mes: string) => doMes.get(mes) ?? faturamentoMensal;
  return {
    custos: new Map(pessoas.map((p) => [p.id, custoDiarioDaPessoa(p, itens)])),
    orcamentos: dias.map((d) => orcamentoDoDia(d, meta, faturamentoDe)),
    meta,
    faturamentoDe,
    /** Se o faturamento do mês foi digitado ou é a média dos meses anteriores. */
    digitado: (mes: string) => doMes.has(mes),
  };
}
