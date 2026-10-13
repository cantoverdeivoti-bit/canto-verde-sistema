import type { GrupoDre, TipoLancamento } from "@/generated/prisma/client";

import type { Situacao } from "@/lib/financeiro";

/**
 * As contas do módulo Financeiro, sem banco: entram números e datas em texto,
 * saem números e datas em texto.
 *
 * Separadas das telas e das ações para a DRE, o fluxo e o fechamento serem os
 * mesmos em todo lugar, e para dar para testar sem banco
 * (`scripts/test-financeiro-calculo.ts`).
 *
 * Datas são sempre "YYYY-MM-DD" e meses "YYYY-MM". Dinheiro é somado em
 * centavos inteiros: 0,1 + 0,2 em ponto flutuante não dá 0,3, e numa coluna
 * de mil lançamentos o erro aparece.
 */

const emCentavos = (n: number) => Math.round(n * 100);
const deCentavos = (c: number) => c / 100;

/** Soma sem o erro do ponto flutuante. */
export function somar(valores: number[]): number {
  return deCentavos(valores.reduce((s, v) => s + emCentavos(v), 0));
}

export const arredondar = (n: number) => deCentavos(emCentavos(n));

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "2026-10-17" vira "2026-10-01": é assim que a competência é gravada. */
export function inicioDoMes(data: string): string {
  return `${data.slice(0, 7)}-01`;
}

/** "2026-10" mais N meses. */
export function somarMeses(mes: string, n: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function diasNoMes(mes: string): number {
  return new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
}

/** O dia N do mês; em mês mais curto, o último dia (dia 31 em fevereiro vira 28 ou 29). */
export function diaDoMes(mes: string, dia: number): string {
  return `${mes}-${String(Math.min(dia, diasNoMes(mes))).padStart(2, "0")}`;
}

/** Os meses de `de` a `ate`, inclusive. */
export function mesesEntre(de: string, ate: string): string[] {
  const meses: string[] = [];
  for (let m = de; m <= ate; m = somarMeses(m, 1)) meses.push(m);
  return meses;
}

// ---------------------------------------------------------------------------
// Lançamento
// ---------------------------------------------------------------------------

/** O que mexe na conta na baixa: valor menos taxa, mais juros, menos desconto. */
export function valorLiquido(l: { valor: number; taxa?: number; jurosMulta?: number; desconto?: number }): number {
  return deCentavos(emCentavos(l.valor) - emCentavos(l.taxa ?? 0) + emCentavos(l.jurosMulta ?? 0) - emCentavos(l.desconto ?? 0));
}

export function situacaoDe(l: { status: "ABERTO" | "PAGO" | "CANCELADO"; vencimento: string }, hoje: string): Situacao {
  if (l.status === "PAGO") return "pago";
  if (l.status === "CANCELADO") return "cancelado";
  if (l.vencimento < hoje) return "vencido";
  if (l.vencimento === hoje) return "hoje";
  return "aberto";
}

/**
 * Divide o total em N parcelas iguais no centavo. O que sobra do
 * arredondamento vai na primeira, para a soma bater sempre com o total.
 */
export function dividirEmParcelas(total: number, n: number): number[] {
  const c = emCentavos(total);
  const base = Math.floor(c / n);
  const sobra = c - base * n;
  return Array.from({ length: n }, (_, i) => deCentavos(i === 0 ? base + sobra : base));
}

/** Vencimento da parcela i (0 = a primeira): mês a mês, no mesmo dia. */
export function vencimentoDaParcela(primeiro: string, i: number): string {
  return diaDoMes(somarMeses(primeiro.slice(0, 7), i), Number(primeiro.slice(8, 10)));
}

// ---------------------------------------------------------------------------
// Recorrência
// ---------------------------------------------------------------------------

export type RecorrenciaParaGerar = { diaVencimento: number; inicio: string; fim: string | null };

/**
 * Os meses em que a recorrência deve ter lançamento, dentro da janela
 * [deMes, ateMes]. `inicio` e `fim` são o primeiro dia do mês.
 */
export function mesesDaRecorrencia(r: RecorrenciaParaGerar, deMes: string, ateMes: string): string[] {
  const de = r.inicio.slice(0, 7) > deMes ? r.inicio.slice(0, 7) : deMes;
  const ate = r.fim && r.fim.slice(0, 7) < ateMes ? r.fim.slice(0, 7) : ateMes;
  return mesesEntre(de, ate);
}

// ---------------------------------------------------------------------------
// Fechamento do dia
// ---------------------------------------------------------------------------

export type ItemDoFechamento = {
  formaId: number;
  nome: string;
  taxaPct: number;
  prazoDias: number;
  contaId: number;
  valorBruto: number;
};

export type LancamentoGerado = {
  tipo: TipoLancamento;
  chaveCategoria: string;
  descricao: string;
  valor: number;
  taxa: number;
  vencimento: string;
  competencia: string;
  contaId: number | null;
  /** Prazo zero: o dinheiro já está na conta, o lançamento nasce pago. */
  pagoEm: string | null;
  valorPago: number | null;
};

/**
 * O que um fechamento do PDV vira no Financeiro.
 *
 * Cada forma com valor vira um "a receber" do bruto, com a taxa da
 * maquininha e o vencimento pelo prazo dela; prazo zero (dinheiro, Pix) já
 * nasce recebido. A taxa de serviço, que veio dentro desses valores, vira um
 * repasse a pagar para a equipe, no mesmo dia.
 */
export function lancamentosDoFechamento(
  f: { data: string; taxaServico: number; itens: ItemDoFechamento[] },
  chaves: { vendas: string; repasse: string },
): LancamentoGerado[] {
  const dia = `${f.data.slice(8, 10)}/${f.data.slice(5, 7)}`;
  const competencia = inicioDoMes(f.data);
  const gerados: LancamentoGerado[] = f.itens
    .filter((i) => emCentavos(i.valorBruto) > 0)
    .map((i) => {
      const taxa = arredondar((i.valorBruto * i.taxaPct) / 100);
      const naHora = i.prazoDias === 0;
      return {
        tipo: "RECEBER",
        chaveCategoria: chaves.vendas,
        // A forma primeiro: na lista do celular a descrição corta no fim, e
        // o que distingue uma linha da outra é a forma, não o dia.
        descricao: `${i.nome} · vendas de ${dia}`,
        valor: arredondar(i.valorBruto),
        taxa,
        vencimento: somarDias(f.data, i.prazoDias),
        competencia,
        contaId: i.contaId,
        pagoEm: naHora ? f.data : null,
        valorPago: naHora ? valorLiquido({ valor: i.valorBruto, taxa }) : null,
      };
    });
  if (emCentavos(f.taxaServico) > 0) {
    gerados.push({
      tipo: "PAGAR",
      chaveCategoria: chaves.repasse,
      descricao: `Taxa de serviço de ${dia}`,
      valor: arredondar(f.taxaServico),
      taxa: 0,
      vencimento: f.data,
      competencia,
      contaId: null,
      pagoEm: null,
      valorPago: null,
    });
  }
  return gerados;
}

// ---------------------------------------------------------------------------
// DRE
// ---------------------------------------------------------------------------

/** Um total por categoria no mês, por competência, sem os cancelados. */
export type LinhaParaDre = { grupo: GrupoDre; tipo: TipoLancamento; subgrupo: string; categoria: string; valor: number };

type ValorDaDre = { nome: string; valor: number; pct: number | null };

export type LinhaDaDre = {
  chave: string;
  rotulo: string;
  valor: number;
  /** % da receita bruta. Nulo sem receita. */
  pct: number | null;
  /** Total (receita líquida, lucro bruto...) ou grupo com categorias. */
  tipo: "grupo" | "total";
  /** O segundo nível: cada subgrupo do grupo, com as categorias dele dentro. */
  subgrupos: (ValorDaDre & { categorias: ValorDaDre[] })[];
  /** As categorias do grupo, sem o subgrupo (para listas e planilhas simples). */
  categorias: (ValorDaDre & { subgrupo: string })[];
};

export type Dre = {
  linhas: LinhaDaDre[];
  receitaBruta: number;
  resultado: number;
  /** O que mexeu no caixa sem ser resultado: aporte, retirada, investimento. */
  foraDoResultado: LinhaDaDre;
};

/** O nome da categoria de sistema TAXAS_CARTAO, que a migração cria. */
export const NOME_DAS_TAXAS_DE_CARTAO = "Taxas de cartão";
/** O subgrupo de fábrica das taxas de cartão. */
export const SUBGRUPO_DAS_TAXAS_DE_CARTAO = "Cartões";

const ROTULO_DO_GRUPO_NA_DRE: Record<GrupoDre, string> = {
  RECEITA_VENDAS: "Vendas",
  OUTRAS_RECEITAS: "Outras receitas",
  TAXA_SERVICO: "(-) Taxa de serviço da equipe",
  IMPOSTOS: "(-) Impostos sobre a venda",
  TAXAS_E_APPS: "(-) Taxas de cartão e apps",
  CMV: "(-) Custo da mercadoria (CMV)",
  PESSOAL: "(-) Pessoal",
  OCUPACAO: "(-) Ocupação",
  OPERACIONAL: "(-) Operacional",
  ADMINISTRATIVO: "(-) Administrativo",
  MARKETING: "(-) Marketing",
  FINANCEIRO: "(+/-) Financeiro",
  FORA_DO_RESULTADO: "Fora do resultado",
};

/** Um valor que não vem de lançamento na categoria (a taxa dos recebíveis, os juros das baixas). */
type Extra = { subgrupo: string; nome: string; centavos: number };

/**
 * A DRE do mês: do que entrou ao que sobrou.
 *
 * Receita entra positiva e despesa negativa, e cada total é a soma do que
 * vem acima dele. `taxasDeCartao` é a soma da taxa dos recebíveis do mês;
 * `encargos` é o que juros e descontos das baixas custaram (negativo quando
 * a casa ganhou desconto). `subgrupoDasTaxas` é onde a categoria "Taxas de
 * cartão" mora hoje, para a taxa dos recebíveis somar com a lançada à mão.
 */
export function montarDre(
  linhas: LinhaParaDre[],
  taxasDeCartao: number,
  encargos: number,
  subgrupoDasTaxas: string = SUBGRUPO_DAS_TAXAS_DE_CARTAO,
): Dre {
  // grupo -> subgrupo -> categoria -> centavos
  const porGrupo = new Map<GrupoDre, Map<string, Map<string, number>>>();
  const somarEm = (g: GrupoDre, sub: string, cat: string, c: number) => {
    const subs = porGrupo.get(g) ?? new Map<string, Map<string, number>>();
    const cats = subs.get(sub) ?? new Map<string, number>();
    cats.set(cat, (cats.get(cat) ?? 0) + c);
    subs.set(sub, cats);
    porGrupo.set(g, subs);
  };
  for (const l of linhas) somarEm(l.grupo, l.subgrupo, l.categoria, (l.tipo === "RECEBER" ? 1 : -1) * emCentavos(l.valor));
  const totalDo = (g: GrupoDre) =>
    [...(porGrupo.get(g)?.values() ?? [])].reduce((s, cats) => s + [...cats.values()].reduce((a, c) => a + c, 0), 0);

  const receitaBrutaC = totalDo("RECEITA_VENDAS") + totalDo("OUTRAS_RECEITAS") + totalDo("TAXA_SERVICO");
  const pct = (c: number) => (receitaBrutaC > 0 ? Math.round((c / receitaBrutaC) * 1000) / 10 : null);
  const porValor = (a: { centavos: number }, b: { centavos: number }) => Math.abs(b.centavos) - Math.abs(a.centavos);

  const grupo = (g: GrupoDre, extras: Extra[] = []): LinhaDaDre => {
    // Um extra com o nome de uma categoria soma nela: a taxa que vem do
    // recebível e a lançada à mão em "Taxas de cartão" são a mesma coisa, e
    // duas linhas com o mesmo nome confundiriam.
    const subs = new Map<string, Map<string, number>>();
    for (const [k, v] of porGrupo.get(g) ?? []) subs.set(k, new Map(v));
    for (const e of extras) {
      const cats = subs.get(e.subgrupo) ?? new Map<string, number>();
      cats.set(e.nome, (cats.get(e.nome) ?? 0) + e.centavos);
      subs.set(e.subgrupo, cats);
    }
    const subgrupos = [...subs.entries()]
      .map(([nome, cats]) => {
        const categorias = [...cats.entries()]
          .map(([n, centavos]) => ({ nome: n, centavos }))
          .filter((c) => c.centavos !== 0)
          .sort(porValor);
        return { nome, centavos: categorias.reduce((s, c) => s + c.centavos, 0), categorias };
      })
      .filter((s) => s.categorias.length > 0)
      .sort(porValor);
    const total = subgrupos.reduce((s, x) => s + x.centavos, 0);
    return {
      chave: g,
      rotulo: ROTULO_DO_GRUPO_NA_DRE[g],
      valor: deCentavos(total),
      pct: pct(total),
      tipo: "grupo",
      subgrupos: subgrupos.map((x) => ({
        nome: x.nome,
        valor: deCentavos(x.centavos),
        pct: pct(x.centavos),
        categorias: x.categorias.map((c) => ({ nome: c.nome, valor: deCentavos(c.centavos), pct: pct(c.centavos) })),
      })),
      categorias: subgrupos.flatMap((x) =>
        x.categorias.map((c) => ({ subgrupo: x.nome, nome: c.nome, valor: deCentavos(c.centavos), pct: pct(c.centavos) })),
      ),
    };
  };
  const total = (chave: string, rotulo: string, c: number): LinhaDaDre => ({
    chave,
    rotulo,
    valor: deCentavos(c),
    pct: pct(c),
    tipo: "total",
    subgrupos: [],
    categorias: [],
  });

  const impostos = grupo("IMPOSTOS");
  const taxas = grupo("TAXAS_E_APPS", [{ subgrupo: subgrupoDasTaxas, nome: NOME_DAS_TAXAS_DE_CARTAO, centavos: -emCentavos(taxasDeCartao) }]);
  const receitaLiquidaC = receitaBrutaC + emCentavos(impostos.valor) + emCentavos(taxas.valor);
  const cmv = grupo("CMV");
  const lucroBrutoC = receitaLiquidaC + emCentavos(cmv.valor);
  const despesas = (["PESSOAL", "OCUPACAO", "OPERACIONAL", "ADMINISTRATIVO", "MARKETING"] as const).map((g) => grupo(g));
  const operacionalC = lucroBrutoC + despesas.reduce((s, d) => s + emCentavos(d.valor), 0);
  const financeiro = grupo("FINANCEIRO", [
    { subgrupo: "Encargos das baixas", nome: "Juros, multas e descontos", centavos: -emCentavos(encargos) },
  ]);
  const resultadoC = operacionalC + emCentavos(financeiro.valor);

  return {
    linhas: [
      grupo("RECEITA_VENDAS"),
      grupo("OUTRAS_RECEITAS"),
      grupo("TAXA_SERVICO"),
      total("receitaBruta", "Receita bruta", receitaBrutaC),
      impostos,
      taxas,
      total("receitaLiquida", "Receita líquida", receitaLiquidaC),
      cmv,
      total("lucroBruto", "Lucro bruto", lucroBrutoC),
      ...despesas,
      total("operacional", "Resultado operacional", operacionalC),
      financeiro,
      total("resultado", "Resultado do mês", resultadoC),
    ],
    receitaBruta: deCentavos(receitaBrutaC),
    resultado: deCentavos(resultadoC),
    foraDoResultado: grupo("FORA_DO_RESULTADO"),
  };
}

/**
 * Quanto juros e descontos custaram: na conta a pagar, juros é custo e
 * desconto é ganho; na conta a receber, o contrário.
 */
export function custoDosEncargos(baixas: { tipo: TipoLancamento; jurosMulta: number; desconto: number }[]): number {
  return deCentavos(
    baixas.reduce((s, b) => {
      const liquido = emCentavos(b.jurosMulta) - emCentavos(b.desconto);
      return s + (b.tipo === "PAGAR" ? liquido : -liquido);
    }, 0),
  );
}

// ---------------------------------------------------------------------------
// Saldo e fluxo de caixa
// ---------------------------------------------------------------------------

/** Um movimento que mexe no caixa. Entrada positiva, saída negativa. */
export type Movimento = { data: string; valor: number };

export function saldoDaConta(c: {
  saldoInicial: number;
  recebido: number;
  pago: number;
  transferidoPara: number;
  transferidoDe: number;
}): number {
  return deCentavos(
    emCentavos(c.saldoInicial) + emCentavos(c.recebido) - emCentavos(c.pago) + emCentavos(c.transferidoPara) - emCentavos(c.transferidoDe),
  );
}

export type DiaDoFluxo = {
  data: string;
  entradas: number;
  saidas: number;
  /** Do dia em diante é previsão: o que está em aberto, pelo vencimento. */
  previsto: boolean;
  saldo: number;
};

/**
 * O caixa dia a dia, de `de` a `ate`.
 *
 * Até hoje vale o realizado (o que foi baixado). De hoje em diante vale o
 * previsto (o que está em aberto, pelo vencimento), e o que venceu e não foi
 * pago entra em hoje: não sumiu, ainda vai sair. `saldoAntes` é o saldo de
 * todas as contas no fim do dia anterior a `de`.
 */
export function fluxoDeCaixa(a: {
  saldoAntes: number;
  de: string;
  ate: string;
  hoje: string;
  realizados: Movimento[];
  previstos: Movimento[];
}): DiaDoFluxo[] {
  const porDia = new Map<string, { entradas: number; saidas: number }>();
  const somarNo = (data: string, valor: number) => {
    const d = porDia.get(data) ?? { entradas: 0, saidas: 0 };
    if (valor >= 0) d.entradas += emCentavos(valor);
    else d.saidas += emCentavos(-valor);
    porDia.set(data, d);
  };
  for (const m of a.realizados) if (m.data >= a.de && m.data <= a.ate && m.data <= a.hoje) somarNo(m.data, m.valor);
  for (const m of a.previstos) {
    const data = m.data < a.hoje ? a.hoje : m.data;
    if (data >= a.de && data <= a.ate) somarNo(data, m.valor);
  }

  const dias: DiaDoFluxo[] = [];
  let saldo = emCentavos(a.saldoAntes);
  for (let data = a.de; data <= a.ate; data = somarDias(data, 1)) {
    const d = porDia.get(data) ?? { entradas: 0, saidas: 0 };
    saldo += d.entradas - d.saidas;
    dias.push({ data, entradas: deCentavos(d.entradas), saidas: deCentavos(d.saidas), previsto: data > a.hoje, saldo: deCentavos(saldo) });
  }
  return dias;
}

export type SemanaDoFluxo = { de: string; ate: string; entradas: number; saidas: number; saldo: number; previsto: boolean };

/** Os dias em blocos de 7, a partir do primeiro. O saldo é o do último dia. */
export function agruparPorSemana(dias: DiaDoFluxo[]): SemanaDoFluxo[] {
  const semanas: SemanaDoFluxo[] = [];
  for (let i = 0; i < dias.length; i += 7) {
    const bloco = dias.slice(i, i + 7);
    semanas.push({
      de: bloco[0].data,
      ate: bloco[bloco.length - 1].data,
      entradas: somar(bloco.map((d) => d.entradas)),
      saidas: somar(bloco.map((d) => d.saidas)),
      saldo: bloco[bloco.length - 1].saldo,
      previsto: bloco.every((d) => d.previsto),
    });
  }
  return semanas;
}

/** O menor saldo da projeção, e quando: é o dia que pede atenção. */
export function pontoMaisBaixo(dias: DiaDoFluxo[]): DiaDoFluxo | null {
  return dias.reduce<DiaDoFluxo | null>((min, d) => (min === null || d.saldo < min.saldo ? d : min), null);
}

// ---------------------------------------------------------------------------
// Partidas para o contador
// ---------------------------------------------------------------------------

/**
 * Uma partida dobrada: o valor sai de uma conta (crédito) e entra em outra
 * (débito). É a linha que o sistema do escritório importa. Os códigos são os
 * do plano de contas dele; código vazio sai em branco, e a tela do contador
 * avisa antes.
 */
export type Partida = { data: string; debito: string; credito: string; valor: number; historico: string; documento: string };

export type BaixaParaPartidas = {
  data: string;
  tipo: TipoLancamento;
  valor: number;
  taxa: number;
  jurosMulta: number;
  desconto: number;
  codigoCategoria: string | null;
  codigoConta: string | null;
  historico: string;
  documento: string | null;
};

export type TransferenciaParaPartidas = {
  data: string;
  valor: number;
  codigoOrigem: string | null;
  codigoDestino: string | null;
  historico: string;
};

/** Os códigos das contrapartidas que não são categoria de lançamento. */
export type CodigosDoSistema = { taxas: string | null; juros: string | null; descontos: string | null };

/**
 * As partidas do mês pelo regime de caixa: cada baixa e cada transferência
 * com data no mês. Uma linha por par débito/crédito, e não uma partida com
 * vários lados, porque é o formato que quase todo sistema contábil importa.
 *
 * Pagamento: débito na despesa, crédito no banco, pelo valor; juros a mais
 * saem do banco para a conta de juros; desconto volta do "descontos" para o
 * banco. Recebimento: o espelho, e a taxa da maquininha sai do banco para a
 * conta de taxas. Em todo caso, o que o banco mexe soma o `valorPago`.
 */
export function partidasDoMes(
  baixas: BaixaParaPartidas[],
  transferencias: TransferenciaParaPartidas[],
  codigos: CodigosDoSistema,
): Partida[] {
  const p: Partida[] = [];
  const c = (codigo: string | null) => codigo ?? "";
  const linha = (data: string, debito: string | null, credito: string | null, valor: number, historico: string, documento: string | null) => {
    if (emCentavos(valor) > 0) p.push({ data, debito: c(debito), credito: c(credito), valor: arredondar(valor), historico, documento: documento ?? "" });
  };
  for (const b of baixas) {
    if (b.tipo === "PAGAR") {
      linha(b.data, b.codigoCategoria, b.codigoConta, b.valor, b.historico, b.documento);
      linha(b.data, codigos.juros, b.codigoConta, b.jurosMulta, `Juros/multa: ${b.historico}`, b.documento);
      linha(b.data, b.codigoConta, codigos.descontos, b.desconto, `Desconto: ${b.historico}`, b.documento);
    } else {
      linha(b.data, b.codigoConta, b.codigoCategoria, b.valor, b.historico, b.documento);
      linha(b.data, codigos.taxas, b.codigoConta, b.taxa, `Taxa: ${b.historico}`, b.documento);
      linha(b.data, b.codigoConta, codigos.juros, b.jurosMulta, `Juros: ${b.historico}`, b.documento);
      linha(b.data, codigos.descontos, b.codigoConta, b.desconto, `Desconto: ${b.historico}`, b.documento);
    }
  }
  for (const t of transferencias) linha(t.data, t.codigoDestino, t.codigoOrigem, t.valor, t.historico, null);
  return p.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

/** O efeito de uma lista de partidas numa conta: débito soma, crédito tira. */
export function movimentoNaConta(partidas: Partida[], codigo: string): number {
  return deCentavos(
    partidas.reduce((s, p) => s + (p.debito === codigo ? emCentavos(p.valor) : 0) - (p.credito === codigo ? emCentavos(p.valor) : 0), 0),
  );
}

/**
 * As partidas em CSV como o Excel brasileiro abre: ponto e vírgula, vírgula
 * decimal, data dd/mm/aaaa e o BOM no começo para os acentos saírem certos.
 */
export function csvDasPartidas(partidas: Partida[]): string {
  const campo = (t: string) => (/[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
  const data = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const linhas = [
    "Data;Débito;Crédito;Valor;Histórico;Documento",
    ...partidas.map((p) =>
      [data(p.data), campo(p.debito), campo(p.credito), p.valor.toFixed(2).replace(".", ","), campo(p.historico), campo(p.documento)].join(";"),
    ),
  ];
  return "﻿" + linhas.join("\r\n") + "\r\n";
}

/**
 * Divide arquivos em lotes que cabem no limite de uma resposta: cada lote
 * soma no máximo `limite` bytes. Um arquivo maior que o limite vai sozinho.
 */
export function emLotes<T extends { tamanho: number }>(itens: T[], limite: number): T[][] {
  const lotes: T[][] = [];
  let atual: T[] = [];
  let soma = 0;
  for (const i of itens) {
    if (atual.length > 0 && soma + i.tamanho > limite) {
      lotes.push(atual);
      atual = [];
      soma = 0;
    }
    atual.push(i);
    soma += i.tamanho;
  }
  if (atual.length > 0) lotes.push(atual);
  return lotes;
}

// ---------------------------------------------------------------------------
// Conciliação bancária
// ---------------------------------------------------------------------------

/** Dias entre duas datas "YYYY-MM-DD", sem sinal. */
export function diasEntre(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000));
}

export type LinhaParaConciliar = { data: string; valor: number; contaId: number };

/**
 * Um lançamento que pode corresponder a uma linha do extrato. `data` é a da
 * baixa (pago) ou o vencimento (aberto); `valor` é o que mexe na conta (o
 * valor pago, ou o líquido do aberto).
 */
export type CandidatoLancamento = {
  id: number;
  tipo: TipoLancamento;
  status: "ABERTO" | "PAGO";
  contaId: number | null;
  data: string;
  valor: number;
  descricao: string;
};

export type CandidatoTransferencia = { id: number; data: string; valor: number; origemId: number; destinoId: number };

export type Sugestao = {
  tipo: "pago" | "aberto" | "lote" | "transferencia";
  lancamentos: number[];
  transferenciaId: number | null;
  texto: string;
};

/**
 * O que provavelmente é esta linha do extrato, do mais ao menos certo:
 *
 *  1. um lançamento já baixado nesta conta, mesmo valor, até 5 dias de
 *     diferença (a baixa foi lançada à mão antes do extrato chegar);
 *  2. um lançamento em aberto com o mesmo valor, vencimento até 7 dias
 *     (conciliar é baixar na data do extrato);
 *  3. vários recebíveis em aberto com o mesmo vencimento que somam o
 *     depósito: o lote da maquininha;
 *  4. uma transferência entre contas da casa com o mesmo valor.
 *
 * Valor sempre exato no centavo: "quase igual" é trabalho para quem olha a
 * tela, que pode escolher o lançamento à mão e mandar a diferença para juros
 * ou desconto.
 */
export function sugestoesParaLinha(
  linha: LinhaParaConciliar,
  lancamentos: CandidatoLancamento[],
  transferencias: CandidatoTransferencia[],
  limite = 3,
): Sugestao[] {
  const tipo: TipoLancamento = linha.valor > 0 ? "RECEBER" : "PAGAR";
  const alvo = emCentavos(Math.abs(linha.valor));
  const perto = (data: string, dias: number) => diasEntre(data, linha.data) <= dias;
  const porPerto = <T extends { data: string }>(a: T, b: T) => diasEntre(a.data, linha.data) - diasEntre(b.data, linha.data);
  const sugestoes: Sugestao[] = [];

  const doTipo = lancamentos.filter((l) => l.tipo === tipo);
  for (const l of doTipo.filter((l) => l.status === "PAGO" && l.contaId === linha.contaId && emCentavos(l.valor) === alvo && perto(l.data, 5)).sort(porPerto))
    sugestoes.push({ tipo: "pago", lancamentos: [l.id], transferenciaId: null, texto: l.descricao });

  const abertos = doTipo.filter((l) => l.status === "ABERTO" && (l.contaId === null || l.contaId === linha.contaId));
  for (const l of abertos.filter((l) => emCentavos(l.valor) === alvo && perto(l.data, 7)).sort(porPerto))
    sugestoes.push({ tipo: "aberto", lancamentos: [l.id], transferenciaId: null, texto: l.descricao });

  if (tipo === "RECEBER") {
    const porVencimento = new Map<string, CandidatoLancamento[]>();
    for (const l of abertos.filter((l) => l.contaId === linha.contaId && perto(l.data, 3)))
      porVencimento.set(l.data, [...(porVencimento.get(l.data) ?? []), l]);
    for (const [data, grupo] of [...porVencimento.entries()].sort(([a], [b]) => diasEntre(a, linha.data) - diasEntre(b, linha.data))) {
      if (grupo.length > 1 && grupo.reduce((s, l) => s + emCentavos(l.valor), 0) === alvo)
        sugestoes.push({
          tipo: "lote",
          lancamentos: grupo.map((l) => l.id),
          transferenciaId: null,
          texto: `${grupo.length} recebíveis com vencimento em ${data.slice(8, 10)}/${data.slice(5, 7)}`,
        });
    }
  }

  for (const t of transferencias
    .filter((t) => emCentavos(t.valor) === alvo && perto(t.data, 3) && (tipo === "PAGAR" ? t.origemId : t.destinoId) === linha.contaId)
    .sort(porPerto))
    sugestoes.push({ tipo: "transferencia", lancamentos: [], transferenciaId: t.id, texto: "Transferência entre contas" });

  return sugestoes.slice(0, limite);
}

/**
 * Quanto falta para a escolha bater com a linha: positivo, o extrato mexeu
 * mais do que os lançamentos; negativo, menos. Zero, concilia sem ajuste.
 */
export function diferencaDaConciliacao(linhaValor: number, escolhidos: { valor: number }[]): number {
  return deCentavos(emCentavos(Math.abs(linhaValor)) - escolhidos.reduce((s, l) => s + emCentavos(l.valor), 0));
}

/**
 * Por que o fechamento de um dia não pode mais ser refeito nem apagado, ou
 * nulo se pode. Refazer apaga e regera os lançamentos do dia; isso só é
 * seguro enquanto nenhum deles foi conferido. Conferido é: baixado à mão,
 * cancelado, casado com uma linha do extrato (o dinheiro e o Pix já nascem
 * pagos, e a conciliação só marca a linha) ou com anexo, que se perderia.
 */
export function travaDoFechamentoDoDia(
  lancamentos: { baixadoPorId: number | null; status: string; linhaExtratoId: number | null; anexos: number }[],
): string | null {
  if (lancamentos.some((l) => l.linhaExtratoId !== null))
    return "Parte deste dia já foi conciliada com o extrato do banco. Para mudar o fechamento, desfaça essa conciliação em Conciliação bancária.";
  if (lancamentos.some((l) => l.baixadoPorId !== null || l.status === "CANCELADO"))
    return "Parte deste dia já foi conferida (recebimento baixado ou cancelado). Para mudar o fechamento, desfaça essas baixas em Contas a receber.";
  if (lancamentos.some((l) => l.anexos > 0))
    return "Um lançamento deste dia tem anexo, que se perderia ao refazer. Tire o anexo em Contas a receber antes de mudar o fechamento.";
  return null;
}

/**
 * Por que um mês não pode ser fechado para o contador, ou nulo se pode. Só
 * mês que já acabou (o corrente ainda recebe lançamento), e em ordem: com
 * um mês anterior já fechado, o que está entre eles fecha primeiro, senão o
 * pacote do mês do meio fica aberto a mudanças depois de entregue o seguinte.
 */
export function motivoParaNaoFecharMes(mes: string, mesAtual: string, fechados: string[]): string | null {
  if (mes >= mesAtual) return "Só se fecha um mês que já acabou.";
  const anteriores = fechados.filter((f) => f < mes).sort();
  const ultimo = anteriores[anteriores.length - 1];
  if (ultimo && ultimo !== somarMeses(mes, -1)) return `Feche antes ${somarMeses(ultimo, 1)}: os meses fecham em ordem.`;
  return null;
}

/**
 * Sobe (-1) ou desce (+1) um item numa lista ordenada, e devolve a ordem
 * nova inteira. Nas pontas, nada muda. Quem grava renumera tudo de 1 a n:
 * assim um empate antigo de `ordem` some na primeira mexida.
 */
export function moverNaOrdem(ids: number[], id: number, direcao: -1 | 1): number[] {
  const i = ids.indexOf(id);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const novo = [...ids];
  [novo[i], novo[j]] = [novo[j], novo[i]];
  return novo;
}
