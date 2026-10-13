import { dateOnlyToString } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { custoPorPessoa, producaoDoEvento, resumoDoEvento, situacaoDoPagamento } from "@/lib/eventos-calculo";
import { receituarioComCustos } from "@/lib/receituario-dados";
import type { Prisma } from "@/generated/prisma/client";

/**
 * As leituras do módulo Eventos que mais de uma tela faz.
 *
 * Tudo sai daqui em número e texto, sem `Decimal` nem `Date`: é o que
 * atravessa para os componentes cliente.
 */

const num = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());

/** A configuração do módulo. Nasce com os padrões do schema na primeira leitura. */
export async function configuracaoEventos() {
  const c =
    (await prisma.configuracaoEventos.findUnique({ where: { id: 1 } })) ??
    (await prisma.configuracaoEventos.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }));
  return {
    margemAlvoPct: c.margemAlvoPct.toNumber(),
    impostoPct: c.impostoPct.toNumber(),
    taxaServicoPct: c.taxaServicoPct.toNumber(),
    sinalPct: c.sinalPct.toNumber(),
    validadeDias: c.validadeDias,
    capacidadeSentados: c.capacidadeSentados,
    capacidadeEmPe: c.capacidadeEmPe,
    valorLocacao: num(c.valorLocacao),
    condicoes: c.condicoes,
  };
}

export type ConfiguracaoEventos = Awaited<ReturnType<typeof configuracaoEventos>>;

const ITENS_DO_CARDAPIO = {
  orderBy: [{ ordem: "asc" }, { id: "asc" }],
  select: {
    id: true,
    etapa: true,
    porcoesPorPessoa: true,
    ficha: { select: { id: true, codigo: true, nome: true, categoria: true, ativo: true } },
  },
} satisfies Prisma.Cardapio$itensArgs;

/**
 * Os cardápios com o custo por pessoa de hoje. O custo da porção vem da ficha
 * do Receituário: da conta dos ingredientes, ou do custo digitado na ficha
 * que ainda não tem ingrediente lançado.
 */
export async function cardapiosComCusto(where: Prisma.CardapioWhereInput = {}) {
  const [cardapios, { custoDasFichas }] = await Promise.all([
    prisma.cardapio.findMany({
      where,
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: { id: true, nome: true, descricao: true, precoPorPessoa: true, ativo: true, itens: ITENS_DO_CARDAPIO },
    }),
    receituarioComCustos(),
  ]);
  return cardapios.map((c) => {
    const itens = c.itens.map((i) => {
      const custo = custoDasFichas.get(i.ficha.id);
      return {
        id: i.id,
        etapa: i.etapa,
        porcoesPorPessoa: i.porcoesPorPessoa.toNumber(),
        ficha: {
          ...i.ficha,
          custoPorcao: custo?.porPorcao ?? 0,
          // Insumo sem preço deixa a porção mais barata do que é.
          semPreco: custo?.semPreco ?? 0,
        },
      };
    });
    return {
      id: c.id,
      nome: c.nome,
      descricao: c.descricao,
      ativo: c.ativo,
      precoPorPessoa: num(c.precoPorPessoa),
      itens,
      custoPorPessoa: custoPorPessoa(itens.map((i) => ({ custoPorcao: i.ficha.custoPorcao, porcoesPorPessoa: i.porcoesPorPessoa }))),
      semPreco: itens.filter((i) => i.ficha.semPreco > 0).length,
    };
  });
}

export type CardapioComCusto = Awaited<ReturnType<typeof cardapiosComCusto>>[number];

/** O evento como as listas mostram: com o total, o que entrou e o que falta. */
export const RESUMO_DO_EVENTO = {
  id: true,
  titulo: true,
  tipo: true,
  status: true,
  data: true,
  horaInicio: true,
  convidados: true,
  taxaServicoPct: true,
  impostoPct: true,
  validoAte: true,
  cliente: { select: { id: true, nome: true, telefone: true } },
  linhas: { select: { quantidade: true, custoUnitario: true, precoUnitario: true } },
  pagamentos: { select: { valor: true } },
} satisfies Prisma.EventoSelect;

export function resumirEvento(e: Prisma.EventoGetPayload<{ select: typeof RESUMO_DO_EVENTO }>) {
  const resumo = resumoDoEvento(
    e.linhas.map((l) => ({
      quantidade: l.quantidade.toNumber(),
      custoUnitario: l.custoUnitario.toNumber(),
      precoUnitario: l.precoUnitario.toNumber(),
    })),
    { convidados: e.convidados, taxaServicoPct: e.taxaServicoPct.toNumber(), impostoPct: e.impostoPct.toNumber() },
  );
  const pagamento = situacaoDoPagamento(
    resumo.totalCliente,
    e.pagamentos.map((p) => p.valor.toNumber()),
  );
  return {
    id: e.id,
    titulo: e.titulo,
    tipo: e.tipo,
    status: e.status,
    data: dateOnlyToString(e.data),
    horaInicio: e.horaInicio,
    convidados: e.convidados,
    validoAte: e.validoAte ? dateOnlyToString(e.validoAte) : null,
    cliente: e.cliente,
    totalCliente: resumo.totalCliente,
    lucro: resumo.lucro,
    margemPct: resumo.margemPct,
    ...pagamento,
  };
}

export type EventoResumido = ReturnType<typeof resumirEvento>;

/** Os eventos confirmados de uma data, menos o próprio: dois eventos no mesmo salão na mesma noite pedem atenção. */
export async function outrosEventosNaData(data: Date, menosId?: number) {
  return prisma.evento.findMany({
    where: { data, status: "CONFIRMADO", ...(menosId ? { id: { not: menosId } } : {}) },
    select: { id: true, titulo: true, horaInicio: true },
  });
}

/**
 * A produção do evento: o cardápio dele aberto até o insumo, para os
 * convidados de agora. Usa o cardápio como está hoje no Receituário (as
 * linhas do orçamento são cópia só dos números de preço).
 */
export async function producaoDoCardapio(cardapioId: number, convidados: number) {
  const [itens, { fichas, insumos }] = await Promise.all([
    prisma.cardapioItem.findMany({ where: { cardapioId }, orderBy: [{ ordem: "asc" }, { id: "asc" }], select: { fichaId: true, porcoesPorPessoa: true } }),
    receituarioComCustos(),
  ]);
  const p = producaoDoEvento(
    itens.map((i) => ({ fichaId: i.fichaId, porcoes: i.porcoesPorPessoa.toNumber() * convidados })),
    new Map(
      fichas.map((f) => [
        f.id,
        {
          id: f.id,
          codigo: f.codigo,
          nome: f.nome,
          porcoes: f.porcoes,
          rendimentoTotal: num(f.rendimentoTotal),
          unidadeRendimento: f.unidadeRendimento,
          ingredientes: f.ingredientes.map((l) => ({ insumoId: l.insumoId, subFichaId: l.subFichaId, quantidade: l.quantidade.toNumber(), unidade: l.unidade })),
        },
      ]),
    ),
    new Map(insumos.map((i) => [i.id, { nome: i.nome, unidadeUso: i.unidadeUso, rendimento: i.rendimento.toNumber() }])),
  );
  return p;
}

export type ProducaoDoEvento = Awaited<ReturnType<typeof producaoDoCardapio>>;
