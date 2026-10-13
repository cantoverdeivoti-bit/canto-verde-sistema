import { dateOnlyToString, toDateOnly } from "@/lib/availability";
import {
  cardapioDoDia,
  classeDoPrato,
  custoDoDia,
  custoMedio,
  custoPorCliente,
  diaDaSemanaBuffet,
  repetidosNoDia,
  situacaoDoGrupo,
  type Classe,
  type SituacaoDaMeta,
} from "@/lib/buffet-regras";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

/**
 * As leituras do Cardápio buffet. As contas moram em `lib/buffet-regras.ts`.
 */

const num = (d: { toNumber(): number } | null | undefined) => (d ? d.toNumber() : null);

export async function gruposDoBuffet() {
  const g = await prisma.grupoBuffet.findMany({ orderBy: [{ ordem: "asc" }, { id: "asc" }] });
  return g.map((x) => ({ ...x, metaCustoKg: num(x.metaCustoKg) }));
}
export type GrupoDoBuffet = Awaited<ReturnType<typeof gruposDoBuffet>>[number];

export async function configuracaoDoBuffet() {
  // Lê, e só cria na primeira vez: o upsert de antes era uma escrita (com
  // transação) em toda abertura do painel.
  const c =
    (await prisma.configuracaoBuffet.findUnique({ where: { id: 1 } })) ??
    (await prisma.configuracaoBuffet.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} }));
  return { ...c, limiteClasseA: c.limiteClasseA.toNumber(), limiteClasseB: c.limiteClasseB.toNumber() };
}

export async function cardapiosDoBuffet() {
  const c = await prisma.cardapioBuffet.findMany({
    orderBy: [{ inicio: "desc" }, { id: "desc" }],
    select: { id: true, nome: true, inicio: true, fim: true, _count: { select: { itens: true } } },
  });
  return c.map((x) => ({ id: x.id, nome: x.nome, inicio: dateOnlyToString(x.inicio), fim: dateOnlyToString(x.fim), itens: x._count.itens }));
}

const PRATO_NO_CARDAPIO = {
  id: true,
  nome: true,
  categoria: true,
  custoKg: true,
  corForno: true,
  alertaCusto: true,
  ativo: true,
} as const;

/** O modelo inteiro: os 7 dias, com o tema e os pratos de cada posição. */
export async function semanaDoCardapio(cardapioId: number) {
  const [cardapio, itens] = await Promise.all([
    prisma.cardapioBuffet.findUnique({ where: { id: cardapioId }, include: { dias: true } }),
    prisma.cardapioBuffetItem.findMany({
      where: { cardapioId },
      select: { diaSemana: true, grupoId: true, posicao: true, prato: { select: PRATO_NO_CARDAPIO } },
    }),
  ]);
  if (!cardapio) return null;
  return {
    id: cardapio.id,
    nome: cardapio.nome,
    inicio: dateOnlyToString(cardapio.inicio),
    fim: dateOnlyToString(cardapio.fim),
    temas: Object.fromEntries(cardapio.dias.map((d) => [d.diaSemana, d.tema])) as Record<number, string | null>,
    itens: itens.map((i) => ({ ...i, prato: { ...i.prato, custoKg: num(i.prato.custoKg) } })),
  };
}
export type SemanaDoCardapio = NonNullable<Awaited<ReturnType<typeof semanaDoCardapio>>>;

/** Os pratos ligados, para escolher no cardápio, por grupo e nome. */
export async function pratosParaEscolher() {
  const p = await prisma.pratoBuffet.findMany({
    where: { ativo: true },
    orderBy: [{ grupoId: "asc" }, { nome: "asc" }],
    select: { id: true, nome: true, grupoId: true, categoria: true, custoKg: true, corForno: true },
  });
  return p.map((x) => ({ ...x, custoKg: num(x.custoKg) }));
}
export type PratoParaEscolher = Awaited<ReturnType<typeof pratosParaEscolher>>[number];

export type PratoNoPainel = { id: number; nome: string; custoKg: number | null; classe: Classe | null; acimaDaMeta: boolean; repetido: boolean };

/**
 * O painel da semana do modelo: por dia, o custo médio por kg, cada grupo
 * contra a meta, a classe de cada prato e o que pede atenção.
 */
export function painelDaSemana(
  semana: SemanaDoCardapio,
  grupos: GrupoDoBuffet[],
  limites: { limiteClasseA: number; limiteClasseB: number },
) {
  return [1, 2, 3, 4, 5, 6, 7].map((dia) => {
    const doDia = semana.itens.filter((i) => i.diaSemana === dia);
    const soma = doDia.reduce((s, i) => s + (i.prato.custoKg ?? 0), 0);
    const repetidos = repetidosNoDia(doDia.map((i) => ({ grupoId: i.grupoId, posicao: i.posicao, pratoId: i.prato.id })));
    const porGrupo = grupos.map((g) => {
      const doGrupo = doDia.filter((i) => i.grupoId === g.id).sort((a, b) => a.posicao - b.posicao);
      const pratos = doGrupo.map((i) => i.prato);
      const media = custoMedio(pratos);
      return {
        grupo: g,
        media,
        situacao: situacaoDoGrupo(media, g.metaCustoKg, pratos) as SituacaoDaMeta | null,
        pratos: doGrupo.map(
          (i): PratoNoPainel & { posicao: number } => ({
            posicao: i.posicao,
            id: i.prato.id,
            nome: i.prato.nome,
            custoKg: i.prato.custoKg,
            classe: classeDoPrato(i.prato.custoKg, soma, limites.limiteClasseA, limites.limiteClasseB),
            acimaDaMeta: g.metaCustoKg !== null && i.prato.custoKg !== null && i.prato.custoKg > g.metaCustoKg,
            repetido: repetidos.has(i.prato.id),
          }),
        ),
      };
    });
    return {
      dia,
      tema: semana.temas[dia] ?? null,
      media: custoMedio(doDia.map((i) => i.prato)),
      quantidade: doDia.length,
      semCusto: doDia.filter((i) => i.prato.custoKg === null).length,
      porGrupo,
    };
  });
}

/**
 * O cardápio que a tela mostra: o do endereço (`?cardapio=`), senão o que vale
 * hoje, senão o mais recente. Nulo só quando não há nenhum.
 */
export async function cardapioEscolhido(doEndereco: string | string[] | undefined, hoje: string) {
  const todos = await cardapiosDoBuffet();
  const pedido = todos.find((c) => String(c.id) === doEndereco);
  // A lista vem do início mais recente para o mais antigo: o primeiro que
  // cobre hoje é o que vale (a regra de `cardapioDoDiaCompleto`), sem
  // perguntar de novo ao banco.
  const vigenteHoje = todos.find((c) => c.inicio <= hoje && c.fim >= hoje)?.id ?? null;
  const id = pedido?.id ?? vigenteHoje ?? todos[0]?.id ?? null;
  return { todos, id, vigenteHoje };
}

/** "2026-10-08" -> "2026-10-09". */
export const diaSeguinte = (data: string) => dateOnlyToString(new Date(toDateOnly(data).getTime() + 86_400_000));

const PRATO_DA_PRODUCAO = {
  id: true,
  nome: true,
  categoria: true,
  custoKg: true,
  corForno: true,
  viabilidade: true,
  modo: true,
  temperatura: true,
  umidade: true,
  tempo: true,
  sonda: true,
  posto: true,
  carga: true,
  janela: true,
  ajuste: true,
  defumar: true,
  processoD1: true,
} as const;

/**
 * O buffet de uma data: o cardápio-modelo daquele dia da semana com as
 * trocas da data por cima (`cardapioDoDia`). Cada posição traz o prato com
 * os campos do forno e, quando trocou, o prato que o modelo tinha ali.
 * Nulo quando nenhum cardápio vale na data.
 */
export async function cardapioDoDiaCompleto(data: string) {
  const d = toDateOnly(data);
  const diaSemana = diaDaSemanaBuffet(data);
  // Tudo de uma vez: o cardápio que vale na data (o de início mais recente
  // que a cobre) já com o tema e os pratos daquele dia da semana, e as trocas
  // da data com o prato que entra. Eram três idas ao banco, uma esperando a outra.
  const [cardapio, trocas] = await Promise.all([
    prisma.cardapioBuffet.findFirst({
      where: { inicio: { lte: d }, fim: { gte: d } },
      orderBy: [{ inicio: "desc" }, { id: "desc" }],
      select: {
        id: true,
        nome: true,
        dias: { where: { diaSemana }, select: { tema: true } },
        itens: { where: { diaSemana }, select: { grupoId: true, posicao: true, pratoId: true, prato: { select: PRATO_DA_PRODUCAO } } },
      },
    }),
    prisma.trocaDoDiaBuffet.findMany({
      where: { data: d },
      select: { grupoId: true, posicao: true, pratoId: true, motivo: true, prato: { select: PRATO_DA_PRODUCAO } },
    }),
  ]);
  if (!cardapio) return null;
  const modelo = cardapio.itens;
  const itens = cardapioDoDia(modelo, trocas);
  const porId = new Map(
    [...modelo.map((m) => m.prato), ...trocas.flatMap((t) => (t.prato ? [t.prato] : []))].map((p) => [p.id, { ...p, custoKg: num(p.custoKg) }]),
  );
  const doModelo = new Map(modelo.map((m) => [`${m.grupoId}:${m.posicao}`, m.pratoId]));
  return {
    cardapio: { id: cardapio.id, nome: cardapio.nome },
    data,
    diaSemana,
    tema: cardapio.dias[0]?.tema ?? null,
    itens: itens.map((i) => {
      const original = doModelo.get(`${i.grupoId}:${i.posicao}`) ?? null;
      return {
        grupoId: i.grupoId,
        posicao: i.posicao,
        prato: i.pratoId === null ? null : (porId.get(i.pratoId) ?? null),
        trocado: i.trocado,
        motivo: i.motivo,
        /** O prato do modelo nesta posição, quando a troca mudou ele. */
        noLugarDe: i.trocado && original !== null ? (porId.get(original)?.nome ?? null) : null,
      };
    }),
  };
}
export type DiaDoBuffet = NonNullable<Awaited<ReturnType<typeof cardapioDoDiaCompleto>>>;
export type PratoDaProducao = NonNullable<DiaDoBuffet["itens"][number]["prato"]>;

/** As posições do desenho do mapa, por grupo. */
export async function posicoesDoMapa() {
  return prisma.posicaoDoMapa.findMany({
    orderBy: [{ grupoId: "asc" }, { linha: "asc" }, { coluna: "asc" }],
    select: { grupoId: true, numero: true, forma: true, linha: true, coluna: true, largura: true, altura: true },
  });
}

/** Os pesos lançados de uma data, por posição ("grupo:posição"), e os clientes do dia. */
export async function pesosDoDia(data: string) {
  const d = toDateOnly(data);
  const [pesos, clientes] = await Promise.all([
    prisma.pesoDoDiaBuffet.findMany({ where: { data: d }, select: { grupoId: true, posicao: true, pratoId: true, kgProduzido: true, kgSobra: true } }),
    prisma.clientesDoDiaBuffet.findUnique({ where: { data: d }, select: { clientes: true } }),
  ]);
  return {
    porLugar: Object.fromEntries(
      pesos.map((p) => [`${p.grupoId}:${p.posicao}`, { pratoId: p.pratoId, kgProduzido: p.kgProduzido.toNumber(), kgSobra: num(p.kgSobra) }]),
    ) as Record<string, { pratoId: number; kgProduzido: number; kgSobra: number | null }>,
    clientes: clientes?.clientes ?? null,
  };
}
export type PesosDoDia = Awaited<ReturnType<typeof pesosDoDia>>;

/**
 * Os últimos dias com peso lançado, do mais recente para trás: o dia real de
 * cada um (custo, média ponderada contra a simples, sobra) e o custo por
 * cliente quando há o número de clientes.
 */
export async function diasReais(quantos = 7) {
  // Os últimos dias lançados e os pesos deles na mesma consulta: eram duas
  // idas ao banco, a segunda esperando a lista de datas da primeira.
  const ultimos = Prisma.sql`SELECT DISTINCT "data" FROM "buffet_pesos" ORDER BY "data" DESC LIMIT ${quantos}`;
  const [pesos, clientes] = await Promise.all([
    prisma.$queryRaw<{ data: Date; pratoId: number; nome: string; kgProduzido: Prisma.Decimal; kgSobra: Prisma.Decimal | null; custoKg: Prisma.Decimal | null }[]>`
      SELECT p."data", p."pratoId", b."nome", p."kgProduzido", p."kgSobra", p."custoKg"
      FROM "buffet_pesos" p JOIN "buffet_pratos" b ON b."id" = p."pratoId"
      WHERE p."data" IN (${ultimos})`,
    prisma.$queryRaw<{ data: Date; clientes: number }[]>`
      SELECT "data", "clientes" FROM "buffet_clientes_do_dia" WHERE "data" IN (${ultimos})`,
  ]);
  const datas = [...new Set(pesos.map((p) => dateOnlyToString(p.data)))].sort().reverse();
  return datas.map((dia) => {
    const conta = custoDoDia(
      pesos
        .filter((p) => dateOnlyToString(p.data) === dia)
        .map((p) => ({ pratoId: p.pratoId, nome: p.nome, kgProduzido: Number(p.kgProduzido), kgSobra: p.kgSobra === null ? null : Number(p.kgSobra), custoKg: p.custoKg === null ? null : Number(p.custoKg) })),
    );
    const n = clientes.find((c) => dateOnlyToString(c.data) === dia)?.clientes ?? null;
    return { data: dia, ...conta, clientes: n, porCliente: custoPorCliente(conta.custo, n) };
  });
}
export type DiaReal = Awaited<ReturnType<typeof diasReais>>[number];

/**
 * As sugestões do buffet: as que esperam e as últimas decididas. `autorId`
 * restringe às de uma pessoa (o colaborador vê só as suas).
 */
export async function sugestoesDoBuffet(autorId?: number) {
  const dela = autorId === undefined ? {} : { criadoPorId: autorId };
  const campos = {
    id: true,
    tipo: true,
    status: true,
    resumo: true,
    createdAt: true,
    decididoEm: true,
    motivoRecusa: true,
    criadoPor: { select: { name: true, username: true } },
    decididoPor: { select: { name: true, username: true } },
  } as const;
  const [pendentes, decididas] = await Promise.all([
    prisma.sugestaoBuffet.findMany({ where: { status: "PENDENTE", ...dela }, orderBy: { createdAt: "asc" }, select: campos }),
    prisma.sugestaoBuffet.findMany({ where: { status: { not: "PENDENTE" }, ...dela }, orderBy: { decididoEm: "desc" }, take: 20, select: campos }),
  ]);
  const nome = (u: { name: string | null; username: string } | null) => (u ? (u.name ?? u.username) : "alguém");
  const plano = (s: (typeof pendentes)[number]) => ({
    id: s.id,
    tipo: s.tipo,
    status: s.status,
    resumo: s.resumo,
    criadoEm: s.createdAt.toISOString(),
    decididoEm: s.decididoEm?.toISOString() ?? null,
    motivoRecusa: s.motivoRecusa,
    autor: nome(s.criadoPor),
    decisor: s.decididoPor ? nome(s.decididoPor) : null,
  });
  return { pendentes: pendentes.map(plano), decididas: decididas.map(plano) };
}
export type SugestaoNaTela = Awaited<ReturnType<typeof sugestoesDoBuffet>>["pendentes"][number];

/** As sugestões que esperam, por lugar, para marcar na tela: posição do cardápio, troca de uma data, prato. */
export async function sugestoesPendentes(onde: { cardapioId?: number; data?: string; pratos?: true }) {
  const s = await prisma.sugestaoBuffet.findMany({
    where: {
      status: "PENDENTE",
      ...(onde.cardapioId !== undefined ? { tipo: "CARDAPIO", cardapioId: onde.cardapioId } : {}),
      ...(onde.data !== undefined ? { tipo: { in: ["TROCA", "DESFAZER_TROCA"] }, data: toDateOnly(onde.data) } : {}),
      ...(onde.pratos ? { tipo: { in: ["PRATO", "PRATO_NOVO", "LIGAR_PRATO"] } } : {}),
    },
    select: { id: true, resumo: true, diaSemana: true, grupoId: true, posicao: true, pratoId: true, tipo: true },
  });
  return s;
}
export type SugestaoPendente = Awaited<ReturnType<typeof sugestoesPendentes>>[number];
