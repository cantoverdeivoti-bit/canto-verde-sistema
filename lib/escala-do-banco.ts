import { dateOnlyToString, toDateOnly } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { montarSemana, somarDias, type PessoaDaEscala, type Posto, type TerceirizadoDaEscala } from "@/lib/escala";
import { nomeNaEscala } from "@/lib/pessoal";

/**
 * Carrega do banco o que `montarSemana` precisa e monta a semana. A tela da
 * escala e a folha de imprimir usam a mesma, para as duas nunca discordarem.
 */
export async function carregarSemana(segunda: string) {
  const domingo = somarDias(segunda, 6);
  const [todosOsPostos, fixa, doDia, ferias, colaboradores, empresas] = await Promise.all([
    prisma.postoDaEscala.findMany({ orderBy: [{ area: "asc" }, { ordem: "asc" }, { id: "asc" }] }),
    prisma.escalaFixa.findMany({ select: { postoId: true, diaSemana: true, colaboradorId: true, terceirizadoId: true } }),
    prisma.escalaDoDia.findMany({
      where: { data: { gte: toDateOnly(segunda), lte: toDateOnly(domingo) } },
      select: { data: true, postoId: true, colaboradorId: true, terceirizadoId: true, fechado: true },
    }),
    prisma.ferias.findMany({
      where: { inicio: { lte: toDateOnly(domingo) }, fim: { gte: toDateOnly(segunda) } },
      select: { colaboradorId: true, inicio: true, fim: true },
    }),
    prisma.colaborador.findMany({
      where: { pendente: false },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        apelido: true,
        tipo: true,
        area: true,
        ativo: true,
        diaria: true,
        diariasDoDia: { select: { diaSemana: true, valor: true } },
        salario: true,
        diasDeTrabalho: true,
      },
    }),
    prisma.terceirizado.findMany({
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, ativo: true, valorPorPessoa: true, area: true },
    }),
  ]);

  const postos: Posto[] = todosOsPostos.filter((p) => p.ativo);
  const pessoas: PessoaDaEscala[] = colaboradores.map((c) => ({
    id: c.id,
    nome: nomeNaEscala(c),
    tipo: c.tipo,
    area: c.area,
    ativo: c.ativo,
    diaria: c.diaria?.toNumber() ?? null,
    diariasPorDia: Object.fromEntries(c.diariasDoDia.map((d) => [d.diaSemana, d.valor.toNumber()])),
    salario: c.salario?.toNumber() ?? null,
    diasDeTrabalho: c.diasDeTrabalho,
  }));
  const terceirizados: (TerceirizadoDaEscala & { area: Posto["area"] | null })[] = empresas.map((t) => ({
    id: t.id,
    nome: t.nome,
    ativo: t.ativo,
    valorPorPessoa: t.valorPorPessoa?.toNumber() ?? null,
    area: t.area,
  }));
  const semana = montarSemana({
    segunda,
    postos,
    fixa,
    doDia: doDia.map((d) => ({ ...d, data: dateOnlyToString(d.data) })),
    ferias: ferias.map((f) => ({ ...f, inicio: dateOnlyToString(f.inicio), fim: dateOnlyToString(f.fim) })),
    pessoas,
    terceirizados,
  });
  return { semana, postos, todosOsPostos, pessoas, terceirizados };
}
