import { unstable_cache } from "next/cache";
import { dateOnlyToString, toDateOnly } from "@/lib/availability";
import { formatDiaCurtoString } from "@/lib/format";
import { CHAVE_CATEGORIA, nomeDoMes, SO_CODIGO } from "@/lib/financeiro";
import { prisma } from "@/lib/db";
import {
  custoDosEncargos,
  diaDoMes,
  fluxoDeCaixa,
  mesesDaRecorrencia,
  montarDre,
  saldoDaConta,
  somarDias as somarDiasNaData,
  sugestoesParaLinha,
  somarMeses,
  valorLiquido,
} from "@/lib/financeiro-calculo";
import type { Prisma } from "@/generated/prisma/client";

/**
 * As leituras do módulo Financeiro que mais de uma tela faz.
 *
 * Tudo sai daqui em número e texto, sem `Decimal` nem `Date`: é o que
 * atravessa para os componentes cliente.
 */

const num = (d: Prisma.Decimal | null | undefined) => (d ? d.toNumber() : 0);
const dia = (d: Date) => dateOnlyToString(d);

/** "2026-10" vira o primeiro dia do mês, como a competência é gravada. */
export const competenciaDo = (mes: string) => toDateOnly(`${mes}-01`);

/** As listas dos formulários: contas, categorias, fornecedores. */
export async function opcoesDoFinanceiro() {
  const [contas, categorias, fornecedores, centros] = await Promise.all([
    prisma.contaFinanceira.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.categoriaFinanceira.findMany({
      // As que só guardam código contábil (taxas, descontos) ficam de fora,
      // e as de subgrupo desligado também.
      where: { ativo: true, subgrupo: { ativo: true }, OR: [{ chave: null }, { chave: { notIn: SO_CODIGO } }] },
      // O grupo ordena na ordem da DRE (é a ordem do enum no banco).
      orderBy: [{ grupo: "asc" }, { subgrupo: { ordem: "asc" } }, { subgrupo: { nome: "asc" } }, { ordem: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, tipo: true, grupo: true, centroPadraoId: true, subgrupo: { select: { nome: true } } },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, apelido: true },
    }),
    centrosDeCusto(),
  ]);
  return {
    contas,
    categorias: categorias.map(({ subgrupo, ...c }) => ({ ...c, subgrupo: subgrupo.nome })),
    centros: centros.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome })),
    fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.apelido ?? f.name })),
  };
}

export type OpcoesDoFinanceiro = Awaited<ReturnType<typeof opcoesDoFinanceiro>>;

/** Os centros na ordem de sempre: os da casa primeiro, o Administrativo por último. */
export async function centrosDeCusto() {
  const centros = await prisma.centroCusto.findMany({ orderBy: { id: "asc" }, select: { id: true, nome: true, chave: true, ativo: true } });
  return [...centros.filter((c) => c.chave !== "ADMINISTRATIVO"), ...centros.filter((c) => c.chave === "ADMINISTRATIVO")];
}

/**
 * O saldo de cada conta no fim do dia `ate` (sem data: hoje e o que vier,
 * ou seja, tudo o que foi baixado).
 */
export async function saldosDasContas(ate?: string) {
  const limite = ate ? { lte: toDateOnly(ate) } : undefined;
  const [contas, baixas, saidas, entradas] = await Promise.all([
    prisma.contaFinanceira.findMany({ orderBy: [{ ativo: "desc" }, { nome: "asc" }] }),
    prisma.lancamento.groupBy({
      by: ["contaId", "tipo"],
      where: { status: "PAGO", ...(limite ? { pagoEm: limite } : {}) },
      _sum: { valorPago: true },
    }),
    prisma.transferencia.groupBy({ by: ["origemId"], where: limite ? { data: limite } : {}, _sum: { valor: true } }),
    prisma.transferencia.groupBy({ by: ["destinoId"], where: limite ? { data: limite } : {}, _sum: { valor: true } }),
  ]);
  const baixado = (contaId: number, tipo: "PAGAR" | "RECEBER") =>
    num(baixas.find((b) => b.contaId === contaId && b.tipo === tipo)?._sum.valorPago);

  return contas.map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    ativo: c.ativo,
    saldoInicial: c.saldoInicial.toNumber(),
    saldoInicialEm: dia(c.saldoInicialEm),
    codigoContabil: c.codigoContabil,
    saldo: saldoDaConta({
      saldoInicial: c.saldoInicial.toNumber(),
      recebido: baixado(c.id, "RECEBER"),
      pago: baixado(c.id, "PAGAR"),
      transferidoPara: num(entradas.find((t) => t.destinoId === c.id)?._sum.valor),
      transferidoDe: num(saidas.find((t) => t.origemId === c.id)?._sum.valor),
    }),
  }));
}

/**
 * `gerarRecorrencias` uma vez por dia, para as telas: rodava a cada abertura
 * do Painel, de Contas a pagar/receber e do Fluxo, antes de mostrar qualquer
 * coisa (uma leitura e uma gravação). Criar ou religar uma conta fixa e reabrir
 * um mês continuam gerando na hora, pela ação; aqui só falta o dia virar.
 */
const geradasNoDia = unstable_cache(
  async (dia: string) => {
    await gerarRecorrencias(dia);
    return dia;
  },
  ["recorrencias-geradas-no-dia"],
  { revalidate: 6 * 60 * 60 },
);
export async function gerarRecorrenciasDoDia(hoje: string) {
  // Fora do Next (scripts), sem o guardado: gera direto.
  await geradasNoDia(hoje).catch(() => gerarRecorrencias(hoje));
}

/**
 * Cria os lançamentos das contas fixas para o mês de `hoje` e o seguinte,
 * os que ainda não existem. Pode rodar quantas vezes quiser: o índice único
 * (recorrência, competência) impede a duplicata, e quem foi cancelado não
 * volta, porque continua existindo.
 *
 * Roda ao abrir as telas que mostram contas, e não num agendador: o mês que
 * vira sem ninguém abrir o Financeiro não perde nada, gera na primeira visita.
 */
export async function gerarRecorrencias(hoje: string) {
  const mes = hoje.slice(0, 7);
  const proximo = somarMeses(mes, 1);
  const [recorrencias, fechados] = await Promise.all([
    prisma.recorrencia.findMany({ where: { ativo: true } }),
    // Mês entregue ao contador não ganha lançamento novo nem por conta fixa.
    prisma.mesFechado.findMany({ where: { mes: { in: [mes, proximo] } }, select: { mes: true } }),
  ]);
  if (recorrencias.length === 0) return 0;

  const dados: Prisma.LancamentoCreateManyInput[] = [];
  for (const r of recorrencias) {
    const meses = mesesDaRecorrencia(
      { diaVencimento: r.diaVencimento, inicio: dia(r.inicio), fim: r.fim ? dia(r.fim) : null },
      mes,
      proximo,
    );
    for (const m of meses) {
      if (fechados.some((f) => f.mes === m)) continue;
      dados.push({
        tipo: r.tipo,
        descricao: r.descricao,
        categoriaId: r.categoriaId,
        contaId: r.contaId,
        fornecedorId: r.fornecedorId,
        centroCustoId: r.centroCustoId,
        valor: r.valor,
        vencimento: toDateOnly(diaDoMes(m, r.diaVencimento)),
        competencia: competenciaDo(m),
        recorrenciaId: r.id,
        origem: "RECORRENCIA",
      });
    }
  }
  if (dados.length === 0) return 0;
  const r = await prisma.lancamento.createMany({ data: dados, skipDuplicates: true });
  return r.count;
}

const LANCAMENTO_NA_LISTA = {
  id: true,
  tipo: true,
  descricao: true,
  valor: true,
  taxa: true,
  vencimento: true,
  competencia: true,
  status: true,
  pagoEm: true,
  valorPago: true,
  jurosMulta: true,
  desconto: true,
  documento: true,
  observacao: true,
  parcela: true,
  totalParcelas: true,
  origem: true,
  fechamento: { select: { data: true } },
  categoria: { select: { id: true, nome: true } },
  conta: { select: { id: true, nome: true } },
  fornecedor: { select: { id: true, name: true, apelido: true } },
  centroCusto: { select: { id: true, nome: true } },
  // Só o que a lista mostra: os bytes ficam no banco até alguém abrir.
  anexos: { select: { id: true, nome: true, tamanho: true }, orderBy: { id: "asc" } },
} satisfies Prisma.LancamentoSelect;

type LancamentoDoBanco = Prisma.LancamentoGetPayload<{ select: typeof LANCAMENTO_NA_LISTA }>;

/** Um lançamento como a tela recebe. */
export function paraTela(l: LancamentoDoBanco) {
  return {
    id: l.id,
    tipo: l.tipo,
    descricao: l.descricao,
    valor: l.valor.toNumber(),
    taxa: l.taxa.toNumber(),
    liquido: valorLiquido({ valor: l.valor.toNumber(), taxa: l.taxa.toNumber() }),
    vencimento: dia(l.vencimento),
    competencia: dia(l.competencia).slice(0, 7),
    status: l.status,
    pagoEm: l.pagoEm ? dia(l.pagoEm) : null,
    valorPago: l.valorPago ? l.valorPago.toNumber() : null,
    jurosMulta: l.jurosMulta.toNumber(),
    desconto: l.desconto.toNumber(),
    documento: l.documento ?? "",
    observacao: l.observacao ?? "",
    parcela: l.parcela,
    totalParcelas: l.totalParcelas,
    origem: l.origem,
    fechamentoData: l.fechamento ? dia(l.fechamento.data) : null,
    categoria: l.categoria,
    conta: l.conta,
    fornecedor: l.fornecedor ? { id: l.fornecedor.id, nome: l.fornecedor.apelido ?? l.fornecedor.name } : null,
    centro: l.centroCusto,
    anexos: l.anexos,
  };
}

export type LancamentoNaTela = ReturnType<typeof paraTela>;

/**
 * Os lançamentos de uma tela de pagar ou receber.
 *
 * "Do mês" é pelo vencimento, que é o que quem paga conta procura. Os
 * vencidos de meses anteriores ainda em aberto vêm junto: não pagos, não
 * podem sumir só porque o mês virou.
 */
export async function lancamentosDoMes(tipo: "PAGAR" | "RECEBER", mes: string, hoje: string) {
  const de = toDateOnly(`${mes}-01`);
  const ate = toDateOnly(diaDoMes(mes, 31));
  const lista = await prisma.lancamento.findMany({
    where: {
      tipo,
      OR: [
        { vencimento: { gte: de, lte: ate } },
        ...(mes <= hoje.slice(0, 7) ? [{ status: "ABERTO" as const, vencimento: { lt: de } }] : []),
      ],
    },
    orderBy: [{ vencimento: "asc" }, { id: "asc" }],
    select: LANCAMENTO_NA_LISTA,
  });
  return lista.map(paraTela);
}

/**
 * A DRE de um mês, por competência. `centro`: sem ele, a casa toda; um id,
 * só aquele centro; `null`, só o que ficou sem centro.
 */
export async function dreDoMes(mes: string, centro?: number | null) {
  const doCentro = centro === undefined ? {} : { centroCustoId: centro };
  const competencia = competenciaDo(mes);
  const deMes = toDateOnly(`${mes}-01`);
  const ateMes = toDateOnly(diaDoMes(mes, 31));
  // As categorias vêm todas, junto com as somas: buscá-las pelos ids das somas
  // era uma segunda volta ao banco esperando a primeira, e o plano é pequeno.
  const [porCategoria, taxas, baixas, categorias, taxasDeCartao] = await Promise.all([
    prisma.lancamento.groupBy({
      by: ["categoriaId", "tipo"],
      where: { competencia, status: { not: "CANCELADO" }, ...doCentro },
      _sum: { valor: true },
    }),
    prisma.lancamento.aggregate({
      where: { competencia, tipo: "RECEBER", status: { not: "CANCELADO" }, ...doCentro },
      _sum: { taxa: true },
    }),
    prisma.lancamento.groupBy({
      by: ["tipo"],
      where: { status: "PAGO", pagoEm: { gte: deMes, lte: ateMes }, ...doCentro },
      _sum: { jurosMulta: true, desconto: true },
    }),
    prisma.categoriaFinanceira.findMany({
      select: { id: true, nome: true, grupo: true, subgrupo: { select: { nome: true } } },
    }),
    // Onde a categoria "Taxas de cartão" mora hoje: a taxa dos recebíveis soma nela.
    prisma.categoriaFinanceira.findUnique({
      where: { chave: CHAVE_CATEGORIA.taxasDeCartao },
      select: { subgrupo: { select: { nome: true } } },
    }),
  ]);
  const linhas = porCategoria.map((p) => {
    const c = categorias.find((x) => x.id === p.categoriaId)!;
    return { grupo: c.grupo, tipo: p.tipo, subgrupo: c.subgrupo.nome, categoria: c.nome, valor: num(p._sum.valor) };
  });
  const encargos = custoDosEncargos(
    baixas.map((b) => ({ tipo: b.tipo, jurosMulta: num(b._sum.jurosMulta), desconto: num(b._sum.desconto) })),
  );
  return montarDre(linhas, num(taxas._sum.taxa), encargos, taxasDeCartao?.subgrupo.nome);
}

/**
 * O fluxo de caixa de `de` a `ate`, de todas as contas juntas.
 *
 * Transferência entre contas da casa não entra: tira de uma e põe na outra,
 * e no total dá zero.
 */
export async function fluxoDoPeriodo(de: string, ate: string, hoje: string) {
  const [contas, antes, realizados, previstos] = await Promise.all([
    prisma.contaFinanceira.aggregate({ _sum: { saldoInicial: true } }),
    prisma.lancamento.groupBy({
      by: ["tipo"],
      where: { status: "PAGO", pagoEm: { lt: toDateOnly(de) } },
      _sum: { valorPago: true },
    }),
    prisma.lancamento.findMany({
      where: { status: "PAGO", pagoEm: { gte: toDateOnly(de), lte: toDateOnly(hoje < ate ? hoje : ate) } },
      select: { tipo: true, pagoEm: true, valorPago: true },
    }),
    prisma.lancamento.findMany({
      where: { status: "ABERTO", vencimento: { lte: toDateOnly(ate) } },
      select: { tipo: true, vencimento: true, valor: true, taxa: true },
    }),
  ]);
  const sinal = (tipo: "PAGAR" | "RECEBER") => (tipo === "RECEBER" ? 1 : -1);
  const somaAntes = antes.reduce((s, b) => s + sinal(b.tipo) * num(b._sum.valorPago), 0);
  return fluxoDeCaixa({
    saldoAntes: num(contas._sum.saldoInicial) + somaAntes,
    de,
    ate,
    hoje,
    realizados: realizados.map((r) => ({ data: dia(r.pagoEm!), valor: sinal(r.tipo) * num(r.valorPago) })),
    previstos: previstos.map((p) => ({
      data: dia(p.vencimento),
      valor: sinal(p.tipo) * valorLiquido({ valor: p.valor.toNumber(), taxa: p.taxa.toNumber() }),
    })),
  });
}

/** Os meses fechados para o contador, do mais recente ao mais antigo. */
export async function mesesFechados() {
  const m = await prisma.mesFechado.findMany({ orderBy: { mes: "desc" }, select: { mes: true } });
  return m.map((x) => x.mes);
}

// ---------------------------------------------------------------------------
// Conferências das ações (aqui, e não num arquivo "use server", para não
// virarem endpoint)
// ---------------------------------------------------------------------------

/**
 * A baixa não pode cair antes do saldo inicial da conta: aquele número já
 * contém tudo o que aconteceu até ali, e a baixa contaria duas vezes.
 */
export async function dataPermitidaNaConta(contaId: number, data: string): Promise<string | null> {
  const conta = await prisma.contaFinanceira.findUnique({ where: { id: contaId }, select: { nome: true, saldoInicialEm: true } });
  if (!conta) return "Essa conta não existe mais.";
  const inicio = dateOnlyToString(conta.saldoInicialEm);
  if (data < inicio)
    return `${conta.nome} começou a ser controlada em ${formatDiaCurtoString(inicio)}. Uma baixa antes disso já está no saldo inicial.`;
  return null;
}

/**
 * O mês entregue ao contador não muda: qualquer data (competência, baixa,
 * transferência) num mês fechado recusa a ação. Aceita "YYYY-MM" e
 * "YYYY-MM-DD".
 */
export async function mensagemDeMesFechado(datas: (string | null | undefined)[]): Promise<string | null> {
  const meses = [...new Set(datas.filter((d): d is string => Boolean(d)).map((d) => d.slice(0, 7)))];
  if (meses.length === 0) return null;
  const fechado = await prisma.mesFechado.findFirst({ where: { mes: { in: meses } }, orderBy: { mes: "asc" } });
  if (!fechado) return null;
  const nome = nomeDoMes(fechado.mes);
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} está fechado para o contador. Para mudar, reabra o mês na tela Contador.`;
}

/** O primeiro dia de "YYYY-MM" e o do mês seguinte, para filtrar competência. */
function intervaloDoMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  const seguinte = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return { gte: toDateOnly(`${mes}-01`), lt: toDateOnly(`${seguinte}-01`) };
}

/**
 * Mudar o grupo ou o código de uma categoria reescreve a DRE e o pacote dos
 * meses em que ela foi usada. Se algum desses meses já foi entregue ao
 * contador, a mudança espera a reabertura. Nulo = pode mudar.
 */
export async function travaDaCategoriaEmMesFechado(categoriaId: number): Promise<string | null> {
  const fechados = await mesesFechados();
  if (fechados.length === 0) return null;
  const usado = await prisma.lancamento.findFirst({
    where: { categoriaId, OR: fechados.map((m) => ({ competencia: intervaloDoMes(m) })) },
    select: { competencia: true },
  });
  return usado ? mensagemDeMesFechado([dateOnlyToString(usado.competencia)]) : null;
}

/**
 * O saldo inicial e o código da conta entram nos saldos e nas partidas de
 * todo mês a partir do início da conta. Com algum desses meses fechado, a
 * mudança espera a reabertura. Nulo = pode mudar.
 */
export async function travaDaContaEmMesFechado(desde: string): Promise<string | null> {
  const fechado = await prisma.mesFechado.findFirst({ where: { mes: { gte: desde.slice(0, 7) } }, orderBy: { mes: "asc" } });
  return fechado ? mensagemDeMesFechado([fechado.mes]) : null;
}

/** A categoria existe e é da natureza do lançamento? Nulo = serve. */
export async function categoriaServe(categoriaId: number, tipo: "PAGAR" | "RECEBER", atualId?: number | null): Promise<string | null> {
  const c = await prisma.categoriaFinanceira.findUnique({
    where: { id: categoriaId },
    select: { tipo: true, chave: true, ativo: true, subgrupo: { select: { ativo: true } } },
  });
  if (!c) return "Essa categoria não existe mais.";
  if (c.tipo !== tipo) return tipo === "PAGAR" ? "Escolha uma categoria de despesa." : "Escolha uma categoria de receita.";
  // Taxas e descontos moram no campo da baixa: lançar nelas contaria duas vezes.
  if (c.chave && SO_CODIGO.includes(c.chave)) return "Essa categoria só guarda código contábil. Escolha outra.";
  // Desligada só vale para quem já estava nela (editar um lançamento antigo).
  if ((!c.ativo || !c.subgrupo.ativo) && categoriaId !== atualId) return "Essa categoria foi desligada no plano de contas. Escolha outra.";
  return null;
}

// ---------------------------------------------------------------------------
// Conciliação bancária
// ---------------------------------------------------------------------------

/**
 * Tudo o que a tela de conciliação de uma conta precisa: as linhas pendentes
 * com as sugestões já calculadas, os lançamentos que podem ser escolhidos à
 * mão, as conciliadas recentes e a comparação de saldo com o banco.
 */
export async function dadosDaConciliacao(contaId: number) {
  const [pendentes, conciliadas, ignoradas, ultimo, extratos] = await Promise.all([
    prisma.linhaExtrato.findMany({ where: { contaId, status: "PENDENTE" }, orderBy: [{ data: "asc" }, { id: "asc" }], take: 300 }),
    prisma.linhaExtrato.findMany({
      where: { contaId, status: "CONCILIADA" },
      orderBy: [{ data: "desc" }, { id: "desc" }],
      take: 40,
      include: {
        lancamentos: { select: { id: true, descricao: true, origem: true } },
        transferencia: { select: { origem: { select: { nome: true } }, destino: { select: { nome: true } } } },
      },
    }),
    prisma.linhaExtrato.findMany({ where: { contaId, status: "IGNORADA" }, orderBy: { data: "desc" }, take: 40 }),
    prisma.extratoImportado.findFirst({ where: { contaId, saldoEm: { not: null } }, orderBy: [{ saldoEm: "desc" }, { id: "desc" }] }),
    prisma.extratoImportado.findMany({
      where: { contaId },
      orderBy: { id: "desc" },
      take: 5,
      select: { id: true, arquivo: true, de: true, ate: true, createdAt: true, _count: { select: { linhas: true } } },
    }),
  ]);

  // A janela dos candidatos: um mês antes e depois das pendentes.
  const datas = pendentes.map((l) => dia(l.data)).sort();
  const de = datas.length ? toDateOnly(somarDiasNaData(datas[0], -30)) : new Date();
  const ate = datas.length ? toDateOnly(somarDiasNaData(datas[datas.length - 1], 30)) : new Date();
  const [lancs, transferencias] = datas.length
    ? await Promise.all([
        prisma.lancamento.findMany({
          where: {
            linhaExtratoId: null,
            OR: [
              { status: "PAGO", contaId, pagoEm: { gte: de, lte: ate } },
              { status: "ABERTO", OR: [{ contaId }, { contaId: null }], vencimento: { gte: de, lte: ate } },
            ],
          },
          select: { id: true, tipo: true, status: true, contaId: true, descricao: true, valor: true, taxa: true, valorPago: true, vencimento: true, pagoEm: true },
        }),
        prisma.transferencia.findMany({
          where: { data: { gte: de, lte: ate }, OR: [{ origemId: contaId }, { destinoId: contaId }], linhasExtrato: { none: { contaId } } },
          select: { id: true, data: true, valor: true, origemId: true, destinoId: true },
        }),
      ])
    : [[], []];

  const candidatos = lancs.map((l) => ({
    id: l.id,
    tipo: l.tipo,
    status: l.status as "ABERTO" | "PAGO",
    contaId: l.contaId,
    data: dia(l.status === "PAGO" ? l.pagoEm! : l.vencimento),
    valor: l.status === "PAGO" ? l.valorPago!.toNumber() : valorLiquido({ valor: l.valor.toNumber(), taxa: l.taxa.toNumber() }),
    descricao: l.descricao,
  }));
  const trans = transferencias.map((t) => ({ id: t.id, data: dia(t.data), valor: t.valor.toNumber(), origemId: t.origemId, destinoId: t.destinoId }));

  let comparacao: { saldoEm: string; banco: number; sistema: number } | null = null;
  if (ultimo?.saldoEm && ultimo.saldoFinal) {
    const saldoEm = dia(ultimo.saldoEm);
    const conta = (await saldosDasContas(saldoEm)).find((c) => c.id === contaId);
    if (conta) comparacao = { saldoEm, banco: ultimo.saldoFinal.toNumber(), sistema: conta.saldo };
  }

  return {
    pendentes: pendentes.map((l) => {
      const linha = { data: dia(l.data), valor: l.valor.toNumber(), contaId };
      return { id: l.id, data: linha.data, valor: linha.valor, descricao: l.descricao, sugestoes: sugestoesParaLinha(linha, candidatos, trans) };
    }),
    conciliadas: conciliadas.map((l) => ({
      id: l.id,
      data: dia(l.data),
      valor: l.valor.toNumber(),
      descricao: l.descricao,
      com: l.transferencia
        ? `Transferência ${l.transferencia.origem.nome} → ${l.transferencia.destino.nome}`
        : l.lancamentos.map((x) => x.descricao).join(" + "),
    })),
    ignoradas: ignoradas.map((l) => ({ id: l.id, data: dia(l.data), valor: l.valor.toNumber(), descricao: l.descricao })),
    candidatos,
    comparacao,
    extratos: extratos.map((e) => ({
      id: e.id,
      arquivo: e.arquivo,
      de: e.de ? dia(e.de) : null,
      ate: e.ate ? dia(e.ate) : null,
      linhas: e._count.linhas,
    })),
  };
}

export type DadosDaConciliacao = Awaited<ReturnType<typeof dadosDaConciliacao>>;
