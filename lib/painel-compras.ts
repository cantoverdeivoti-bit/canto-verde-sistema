import { curvaABC, type ClasseABC } from "@/lib/curva-abc";
import { UNIT_LABEL, formatMoney, plural } from "@/lib/format";
import { orcamentosSemanais, segundaDaSemana, type SemanaDoRelatorio } from "@/lib/orcamento";
import { periodoAnterior, somarDias } from "@/lib/periodo";
import {
  aCaminho,
  comprasRecebidas,
  desempenhoDosFornecedores,
  instantesDoPeriodo,
  porCategoria,
  porProduto,
  type CompraRecebida,
  type DesempenhoDoFornecedor,
} from "@/lib/relatorios-compras";
import type { ProductUnit } from "@/generated/prisma/client";

/**
 * O painel executivo de compras: quatro números, a evolução, a curva ABC e
 * o que pede decisão.
 *
 * As contas são funções puras sobre o que as consultas de
 * `lib/relatorios-compras` já devolvem, para o teste (`scripts/test-painel`)
 * rodar sem banco. Só `dadosDoPainel` vai ao banco.
 *
 * Gasto é o que CHEGOU (quantidade recebida × preço pago), como em todo o
 * relatório. Orçamento, não: ele controla o que se PEDE, e é contra o pedido
 * que o cartão, o gráfico e o aviso o comparam. O período anterior tem o
 * mesmo tamanho e vem logo antes.
 */

/** Quantas semanas o gráfico mostra, terminando na semana de `ate`. */
export const SEMANAS_NO_GRAFICO = 12;
/** Variação de preço a partir da qual vira assunto. */
const LIMITE_PRECO = 5;
/** Parte do gasto num fornecedor só a partir da qual vira risco. */
const LIMITE_DEPENDENCIA = 50;
/** Abaixo disto de entregas no prazo, com ao menos 3 entregas, vira assunto. */
const LIMITE_PRAZO = 70;

export type Kpis = {
  gasto: number;
  gastoAntes: number;
  /** Pedidos ainda não recebidos, pelo valor pedido; `semPreco` itens ficaram fora. */
  aCaminho: { valor: number; semPreco: number };
  /** Pedido ÷ orçamento, em %, só nas semanas que têm orçamento. */
  orcamento: { uso: number | null; usoAntes: number | null; semanas: number };
  /** Inflação da mesma cesta: os produtos comprados nos dois períodos. */
  cesta: { variacao: number | null; produtos: number; efeito: number };
  /**
   * Entregas no dia previsto, em %, entre as que tinham previsão — contando
   * como atraso a previsão vencida que ainda não chegou (`semChegar`).
   */
  prazo: { pct: number | null; pctAntes: number | null; entregas: number; semChegar: number; problemas: number };
};

export type SemanaDoGrafico = {
  semana: string;
  /** O que foi pedido na semana: a coluna do gráfico, contra o orçamento. */
  pedido: number;
  /** O que chegou na semana: só na dica. */
  recebido: number;
  orcamento: number | null;
  /** A semana ainda não acabou (é a de hoje ou depois). */
  emAndamento: boolean;
};

export type LinhaABC = {
  produtoId: number;
  nome: string;
  unidade: ProductUnit;
  categoria: string;
  quantidade: number;
  valor: number;
  classe: ClasseABC;
  pct: number;
  acumulado: number;
  /** Preço médio pago contra o do período anterior, em %. Nulo sem compra lá. */
  variacaoPreco: number | null;
  /** De quantos fornecedores veio no período. */
  fornecedores: number;
};

export type Insight = {
  tipo: "preco" | "fornecedores" | "cobranca" | "orcamento" | "prazo" | "dependencia";
  /** Perda: dinheiro que já saiu a mais. Risco: ainda não custou, mas pode. */
  tom: "perda" | "risco";
  /** A frase inteira, para o PDF e o e-mail. */
  titulo: string;
  /** Uma linha curta, só com os números, também para o PDF e o e-mail. Vazia quando o título basta. */
  texto: string;
  /** Na tela, o cartão em partes: o tipo do alerta ("Preço subiu 15,8%"), */
  rotulo: string;
  /** de quem se trata (o produto, o fornecedor), */
  assunto: string;
  /** a comparação em linhas alinhadas (Antes / Agora), */
  detalhes: { rotulo: string; valor: string }[];
  /** e uma observação, quando há ("1 outro item também subiu"). */
  nota: string | null;
  /** Quanto isso pesou no período, em R$. Nulo quando não é dinheiro. */
  impacto: number | null;
  /** O que o valor quer dizer, embaixo dele: "pago a mais". */
  rotuloImpacto: string;
  acao: { texto: string; href: string };
};

export type DadosDoPainel = {
  de: string;
  ate: string;
  kpis: Kpis;
  /** Da mais antiga para a mais recente. */
  grafico: SemanaDoGrafico[];
  /**
   * Média do pedido por semana no gráfico: só semanas fechadas, a partir da
   * primeira com pedido. Nula sem nenhuma.
   */
  mediaSemanal: number | null;
  abc: LinhaABC[];
  categorias: { categoria: string; valor: number; pct: number }[];
  /** As semanas do período, a mais recente primeiro — a tabela de detalhes. */
  semanas: SemanaDoRelatorio[];
  insights: Insight[];
};

/** O que as consultas devolvem, cru: a entrada da montagem. */
export type EntradaDoPainel = {
  de: string;
  ate: string;
  linhas: CompraRecebida[];
  linhasAntes: CompraRecebida[];
  aCaminho: { valor: number; semPreco: number };
  /** Dia de hoje na casa: separa a semana em andamento. Sem ele, todas contam como fechadas. */
  hoje?: string;
  /** Todas as semanas do gráfico e dos dois períodos, em qualquer ordem. */
  semanas: SemanaDoRelatorio[];
  desempenho: DesempenhoDoFornecedor[];
  desempenhoAntes: DesempenhoDoFornecedor[];
};

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

const soma = (l: number[]) => l.reduce((s, n) => s + n, 0);
const pctDe = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : null);

/** Quantidade, valor e preço médio pago por produto. */
export function precoMedioPorProduto(linhas: CompraRecebida[]) {
  const mapa = new Map<number, { quantidade: number; valor: number; preco: number }>();
  for (const l of linhas) {
    const p = mapa.get(l.produtoId) ?? { quantidade: 0, valor: 0, preco: 0 };
    p.quantidade += l.quantidade;
    p.valor += l.valor;
    mapa.set(l.produtoId, p);
  }
  for (const p of mapa.values()) p.preco = p.quantidade > 0 ? p.valor / p.quantidade : 0;
  return mapa;
}

export type VariacaoDePreco = {
  produtoId: number;
  nome: string;
  unidade: ProductUnit;
  /** Preço médio pago no período anterior e neste. */
  antes: number;
  agora: number;
  /** Em %. */
  variacao: number;
  /** Quanto a variação pesou no período: (agora − antes) × quantidade comprada agora. */
  efeito: number;
};

/**
 * A variação de preço de cada produto comprado nos dois períodos: preço
 * médio pago neste contra o do anterior. É a mesma conta da coluna de preço
 * da curva ABC e do aviso "ficou mais caro" — a aba Preços usa esta, para o
 * número de lá bater com o daqui.
 */
export function variacoesDePreco(linhas: CompraRecebida[], linhasAntes: CompraRecebida[]): VariacaoDePreco[] {
  const agora = precoMedioPorProduto(linhas);
  const antes = precoMedioPorProduto(linhasAntes);
  const nomes = new Map(linhas.map((l) => [l.produtoId, { nome: l.nome, unidade: l.unidade }]));
  const out: VariacaoDePreco[] = [];
  for (const [id, a] of agora) {
    const b = antes.get(id);
    if (!b || b.preco <= 0 || a.quantidade <= 0) continue;
    const n = nomes.get(id)!;
    out.push({
      produtoId: id,
      nome: n.nome,
      unidade: n.unidade,
      antes: b.preco,
      agora: a.preco,
      variacao: (a.preco / b.preco - 1) * 100,
      efeito: Math.round((a.preco - b.preco) * a.quantidade * 100) / 100,
    });
  }
  return out;
}

/**
 * A inflação da cesta: o que foi comprado agora, a preço de agora, contra o
 * mesmo tanto a preço do período anterior. Só os produtos comprados nos dois
 * — assim a variação é de preço, e não de quanto se comprou.
 */
export function precoDaCesta(linhas: CompraRecebida[], linhasAntes: CompraRecebida[]) {
  const agora = precoMedioPorProduto(linhas);
  const antes = precoMedioPorProduto(linhasAntes);
  let atual = 0;
  let aPrecoAntigo = 0;
  let produtos = 0;
  for (const [id, a] of agora) {
    const b = antes.get(id);
    if (!b || b.preco <= 0 || a.quantidade <= 0) continue;
    atual += a.quantidade * a.preco;
    aPrecoAntigo += a.quantidade * b.preco;
    produtos += 1;
  }
  return {
    variacao: aPrecoAntigo > 0 ? (atual / aPrecoAntigo - 1) * 100 : null,
    produtos,
    efeito: Math.round((atual - aPrecoAntigo) * 100) / 100,
  };
}

/** Semana pertence ao período quando a segunda dela cai de `de` (a semana dele) até `ate`. */
function semanasDoPeriodo(semanas: SemanaDoRelatorio[], de: string, ate: string) {
  const desde = segundaDaSemana(de);
  return semanas.filter((s) => s.semana >= desde && s.semana <= ate);
}

function usoDoOrcamento(semanas: SemanaDoRelatorio[]) {
  const com = semanas.filter((s) => s.orcamento !== null && s.orcamento > 0);
  return {
    uso: pctDe(soma(com.map((s) => s.pedido)), soma(com.map((s) => s.orcamento!))),
    semanas: com.length,
  };
}

function prazoDe(d: DesempenhoDoFornecedor[]) {
  return {
    pct: pctDe(soma(d.map((x) => x.noPrazo)), soma(d.map((x) => x.comPrevisao))),
    entregas: soma(d.map((x) => x.comPrevisao)),
    semChegar: soma(d.map((x) => x.semChegar)),
    problemas: soma(d.map((x) => x.falta + x.devolvido + x.avaria)),
  };
}

/** "21/09" */
function diaMes(dia: string) {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}
const maisItensSubiram = (n: number) =>
  n === 1 ? "1 outro item também subiu" : `${n} outros itens também subiram`;
const maisFornecedores = (n: number) =>
  n === 1 ? "1 outro fornecedor também" : `${n} outros fornecedores também`;
/** "1 dia", "2,5 dias" */
const dias = (n: number) => plural(Number(n.toFixed(1)), "dia", "dias").replace(".", ",");
const pct1 = (n: number) =>
  `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 0 })}%`;

/**
 * O que pede decisão, do que mais custou ao que menos.
 *
 * Um candidato por tipo — o maior de cada —, para os três cartões não virarem
 * três versões da mesma notícia. Os que são dinheiro vêm na frente, pelo
 * valor; os de risco (prazo, dependência) depois. Sem candidato, lista vazia:
 * não se inventa assunto.
 */
export function insightsDeCompras(e: {
  de: string;
  ate: string;
  linhas: CompraRecebida[];
  linhasAntes: CompraRecebida[];
  abc: LinhaABC[];
  semanas: SemanaDoRelatorio[];
  desempenho: DesempenhoDoFornecedor[];
}): Insight[] {
  const candidatos: Insight[] = [];
  // Os links abrem a outra tela no mesmo período do Painel.
  const noPeriodo = (href: string) => `${href}${href.includes("?") ? "&" : "?"}de=${e.de}&ate=${e.ate}`;
  const agora = precoMedioPorProduto(e.linhas);
  const antes = precoMedioPorProduto(e.linhasAntes);
  const gasto = soma(e.linhas.map((l) => l.valor));

  // 1. Preço subiu num item que pesa (classe A ou B).
  const subidas = e.abc
    .filter((i) => i.classe !== "C" && i.variacaoPreco !== null && i.variacaoPreco >= LIMITE_PRECO)
    .map((i) => {
      const a = agora.get(i.produtoId)!;
      const b = antes.get(i.produtoId)!;
      return { i, a, b, impacto: (a.preco - b.preco) * a.quantidade };
    })
    .sort((x, y) => y.impacto - x.impacto);
  if (subidas.length > 0) {
    const { i, a, b, impacto } = subidas[0];
    const un = UNIT_LABEL[i.unidade];
    candidatos.push({
      tipo: "preco",
      tom: "perda",
      titulo: `${i.nome} ficou ${pct1(i.variacaoPreco!)} mais caro`,
      texto:
        `${formatMoney(b.preco)} → ${formatMoney(a.preco)}/${un}` +
        (subidas.length > 1 ? ` · ${maisItensSubiram(subidas.length - 1)}` : ""),
      rotulo: `Preço subiu ${pct1(i.variacaoPreco!)}`,
      assunto: i.nome,
      detalhes: [
        { rotulo: "Antes", valor: `${formatMoney(b.preco)}/${un}` },
        { rotulo: "Agora", valor: `${formatMoney(a.preco)}/${un}` },
      ],
      nota: subidas.length > 1 ? maisItensSubiram(subidas.length - 1) : null,
      impacto,
      rotuloImpacto: "pago a mais no período",
      acao: { texto: "Ver preço", href: noPeriodo(`/admin/compras/relatorios/precos?produto=${i.produtoId}`) },
    });
  }

  // 2. O mesmo produto comprado de fornecedores diferentes, por preços diferentes.
  const porProdutoEFornecedor = new Map<number, Map<number, { nome: string; q: number; v: number }>>();
  for (const l of e.linhas) {
    const f = porProdutoEFornecedor.get(l.produtoId) ?? new Map();
    const x = f.get(l.fornecedorId) ?? { nome: l.fornecedor, q: 0, v: 0 };
    x.q += l.quantidade;
    x.v += l.valor;
    f.set(l.fornecedorId, x);
    porProdutoEFornecedor.set(l.produtoId, f);
  }
  const nomes = new Map(e.linhas.map((l) => [l.produtoId, { nome: l.nome, unidade: l.unidade }]));
  const espalhados = [...porProdutoEFornecedor]
    .filter(([, f]) => f.size >= 2)
    .map(([produtoId, f]) => {
      const precos = [...f.values()].map((x) => ({ ...x, p: x.v / x.q })).sort((a, b) => a.p - b.p);
      const menor = precos[0];
      const maior = precos[precos.length - 1];
      const economia = soma(precos.map((x) => (x.p - menor.p) * x.q));
      return { produtoId, menor, maior, economia, diferenca: (maior.p / menor.p - 1) * 100 };
    })
    .filter((x) => x.diferenca >= LIMITE_PRECO && x.economia >= 1)
    .sort((a, b) => b.economia - a.economia);
  if (espalhados.length > 0) {
    const x = espalhados[0];
    const p = nomes.get(x.produtoId)!;
    candidatos.push({
      tipo: "fornecedores",
      tom: "perda",
      titulo: `${p.nome}: ${pct1(x.diferenca)} de diferença entre fornecedores`,
      texto: `${x.menor.nome} ${formatMoney(x.menor.p)} · ${x.maior.nome} ${formatMoney(x.maior.p)} /${UNIT_LABEL[p.unidade]}`,
      rotulo: `Preço ${pct1(x.diferenca)} diferente`,
      assunto: p.nome,
      detalhes: [
        { rotulo: x.menor.nome, valor: `${formatMoney(x.menor.p)}/${UNIT_LABEL[p.unidade]}` },
        { rotulo: x.maior.nome, valor: `${formatMoney(x.maior.p)}/${UNIT_LABEL[p.unidade]}` },
      ],
      nota: null,
      impacto: x.economia,
      rotuloImpacto: "dava para economizar",
      acao: { texto: "Ver fornecedores", href: noPeriodo("/admin/compras/relatorios/fornecedores") },
    });
  }

  // 3. Nota acima do preço combinado.
  const acima = [...e.desempenho].filter((d) => d.diferencaPreco >= 1).sort((a, b) => b.diferencaPreco - a.diferencaPreco);
  if (acima.length > 0) {
    const d = acima[0];
    candidatos.push({
      tipo: "cobranca",
      tom: "perda",
      titulo: `${d.nome} cobrou acima do combinado`,
      texto: acima.length > 1 ? maisFornecedores(acima.length - 1) : "",
      rotulo: "Cobrou acima do combinado",
      assunto: d.nome,
      detalhes: [],
      nota: acima.length > 1 ? maisFornecedores(acima.length - 1) : null,
      impacto: d.diferencaPreco,
      rotuloImpacto: "cobrado a mais na nota",
      acao: { texto: "Cobrar", href: noPeriodo("/admin/compras/relatorios/fornecedores") },
    });
  }

  // 4. Semanas com pedido acima do orçamento.
  const estouradas = e.semanas
    .filter((s) => s.orcamento !== null && s.orcamento > 0 && s.pedido > s.orcamento)
    .map((s) => ({ s, acima: s.pedido - s.orcamento! }))
    .sort((a, b) => b.acima - a.acima);
  if (estouradas.length > 0) {
    const pior = estouradas[0];
    candidatos.push({
      tipo: "orcamento",
      tom: "perda",
      titulo:
        estouradas.length === 1
          ? `Orçamento estourado · semana ${diaMes(pior.s.semana)}`
          : `Orçamento estourado em ${estouradas.length} semanas`,
      texto: `Pedido ${formatMoney(pior.s.pedido)} · orçamento ${formatMoney(pior.s.orcamento!)}`,
      rotulo: "Orçamento estourado",
      assunto: estouradas.length === 1 ? `Semana de ${diaMes(pior.s.semana)}` : `${estouradas.length} semanas acima`,
      detalhes: [
        { rotulo: estouradas.length === 1 ? "Pedido" : `Pior, semana de ${diaMes(pior.s.semana)}`, valor: formatMoney(pior.s.pedido) },
        { rotulo: "Orçamento", valor: formatMoney(pior.s.orcamento!) },
      ],
      nota: null,
      impacto: soma(estouradas.map((x) => x.acima)),
      rotuloImpacto: "acima do orçamento",
      acao: { texto: "Ver pedidos", href: noPeriodo("/admin/compras/relatorios/historico") },
    });
  }

  // 5. Fornecedor atrasando (risco).
  const atrasando = e.desempenho
    .filter((d) => d.comPrevisao >= 3 && (d.noPrazo / d.comPrevisao) * 100 < LIMITE_PRAZO)
    .sort((a, b) => a.noPrazo / a.comPrevisao - b.noPrazo / b.comPrevisao);
  if (atrasando.length > 0) {
    const d = atrasando[0];
    const atrasos = d.comPrevisao - d.noPrazo;
    candidatos.push({
      tipo: "prazo",
      tom: "risco",
      titulo: `${d.nome} atrasou ${atrasos} de ${d.comPrevisao} entregas`,
      texto:
        `${pct1((d.noPrazo / d.comPrevisao) * 100)} no prazo` +
        (d.semChegar > 0 ? ` · ${d.semChegar} ainda sem chegar` : "") +
        (d.atrasoMedio !== null ? ` · atraso médio de ${dias(d.atrasoMedio)}` : ""),
      rotulo: "Entregas atrasadas",
      assunto: d.nome,
      detalhes: [
        { rotulo: "Atrasou", valor: `${atrasos} de ${d.comPrevisao} entregas` },
        ...(d.semChegar > 0 ? [{ rotulo: "Ainda sem chegar", valor: String(d.semChegar) }] : []),
        ...(d.atrasoMedio !== null ? [{ rotulo: "Atraso médio", valor: dias(d.atrasoMedio) }] : []),
      ],
      nota: null,
      impacto: null,
      rotuloImpacto: "",
      acao: { texto: "Ver fornecedor", href: noPeriodo("/admin/compras/relatorios/fornecedores") },
    });
  }

  // 6. Dependência de um fornecedor só (risco).
  // Por id, e não pelo nome: dois fornecedores com o mesmo apelido não somam.
  const porFornecedor = new Map<number, { nome: string; valor: number }>();
  for (const l of e.linhas) {
    const f = porFornecedor.get(l.fornecedorId) ?? { nome: l.fornecedor, valor: 0 };
    f.valor += l.valor;
    porFornecedor.set(l.fornecedorId, f);
  }
  const maior = [...porFornecedor.values()].sort((a, b) => b.valor - a.valor)[0];
  if (maior && porFornecedor.size >= 2 && gasto > 0 && (maior.valor / gasto) * 100 > LIMITE_DEPENDENCIA) {
    candidatos.push({
      tipo: "dependencia",
      tom: "risco",
      titulo: `${maior.nome} concentra ${pct1((maior.valor / gasto) * 100)} do gasto`,
      texto: "",
      rotulo: "Depende de um fornecedor só",
      assunto: maior.nome,
      detalhes: [{ rotulo: "Parte do gasto", valor: pct1((maior.valor / gasto) * 100) }],
      nota: null,
      impacto: null,
      rotuloImpacto: "",
      acao: { texto: "Cotar com outros", href: "/admin/compras/cotacao" },
    });
  }

  const ordemDoRisco = { prazo: 0, dependencia: 1 } as Record<string, number>;
  return candidatos
    .sort((a, b) => {
      if (a.impacto !== null && b.impacto !== null) return b.impacto - a.impacto;
      if (a.impacto !== null) return -1;
      if (b.impacto !== null) return 1;
      return (ordemDoRisco[a.tipo] ?? 9) - (ordemDoRisco[b.tipo] ?? 9);
    })
    .slice(0, 3);
}

/** Monta o painel a partir do que as consultas devolveram. Sem banco. */
export function montarPainel(e: EntradaDoPainel): DadosDoPainel {
  const antes = periodoAnterior(e.de, e.ate);
  const doPeriodo = semanasDoPeriodo(e.semanas, e.de, e.ate);
  const doAnterior = semanasDoPeriodo(e.semanas, antes.de, antes.ate);

  const agora = precoMedioPorProduto(e.linhas);
  const precoAntes = precoMedioPorProduto(e.linhasAntes);
  const fornecedoresPorProduto = new Map<number, Set<number>>();
  for (const l of e.linhas) {
    const s = fornecedoresPorProduto.get(l.produtoId) ?? new Set();
    s.add(l.fornecedorId);
    fornecedoresPorProduto.set(l.produtoId, s);
  }
  const abc: LinhaABC[] = curvaABC(porProduto(e.linhas)).map((i) => {
    const a = agora.get(i.produtoId)!;
    const b = precoAntes.get(i.produtoId);
    return {
      produtoId: i.produtoId,
      nome: i.nome,
      unidade: i.unidade,
      categoria: i.categoria,
      quantidade: i.quantidade,
      valor: i.valor,
      classe: i.classe,
      pct: i.pct,
      acumulado: i.acumulado,
      variacaoPreco: b && b.preco > 0 ? (a.preco / b.preco - 1) * 100 : null,
      fornecedores: fornecedoresPorProduto.get(i.produtoId)?.size ?? 0,
    };
  });

  const ultima = segundaDaSemana(e.ate);
  const primeira = somarDias(ultima, -7 * (SEMANAS_NO_GRAFICO - 1));
  const porSemana = new Map(e.semanas.map((s) => [s.semana, s]));
  const grafico: SemanaDoGrafico[] = [];
  for (let s = primeira; s <= ultima; s = somarDias(s, 7)) {
    const x = porSemana.get(s);
    grafico.push({
      semana: s,
      pedido: x?.pedido ?? 0,
      recebido: x?.recebido ?? 0,
      orcamento: x?.orcamento ?? null,
      emAndamento: e.hoje !== undefined && somarDias(s, 6) >= e.hoje,
    });
  }
  // A média não conta a semana em andamento (ainda incompleta) nem as
  // semanas de antes da primeira compra (o sistema ainda não era usado).
  const primeiraComPedido = grafico.findIndex((g) => g.pedido > 0);
  const fechadas = primeiraComPedido < 0 ? [] : grafico.slice(primeiraComPedido).filter((g) => !g.emAndamento);
  const mediaSemanal = fechadas.length > 0 ? soma(fechadas.map((g) => g.pedido)) / fechadas.length : null;

  const orc = usoDoOrcamento(doPeriodo);
  const prazo = prazoDe(e.desempenho);
  return {
    de: e.de,
    ate: e.ate,
    kpis: {
      gasto: soma(e.linhas.map((l) => l.valor)),
      gastoAntes: soma(e.linhasAntes.map((l) => l.valor)),
      aCaminho: e.aCaminho,
      orcamento: { uso: orc.uso, usoAntes: usoDoOrcamento(doAnterior).uso, semanas: orc.semanas },
      cesta: precoDaCesta(e.linhas, e.linhasAntes),
      prazo: { ...prazo, pctAntes: prazoDe(e.desempenhoAntes).pct },
    },
    grafico,
    mediaSemanal,
    abc,
    categorias: porCategoria(e.linhas),
    semanas: [...doPeriodo].sort((a, b) => b.semana.localeCompare(a.semana)),
    insights: insightsDeCompras({ de: e.de, ate: e.ate, linhas: e.linhas, linhasAntes: e.linhasAntes, abc, semanas: doPeriodo, desempenho: e.desempenho }),
  };
}

/** Busca tudo o que o painel usa, de uma vez, e monta. */
export async function dadosDoPainel(de: string, ate: string, timezone: string, hoje: string): Promise<DadosDoPainel> {
  return (await painelComEntradas(de, ate, timezone, hoje)).painel;
}

/**
 * O painel montado e as compras e o desempenho de onde ele saiu, para quem
 * precisa dos dois (o relatório agendado) não buscar tudo de novo.
 */
export async function painelComEntradas(
  de: string,
  ate: string,
  timezone: string,
  hoje: string,
): Promise<{
  painel: DadosDoPainel;
  linhas: Awaited<ReturnType<typeof comprasRecebidas>>;
  linhasAntes: Awaited<ReturnType<typeof comprasRecebidas>>;
  desempenho: Awaited<ReturnType<typeof desempenhoDosFornecedores>>;
}> {
  const antes = periodoAnterior(de, ate);
  const agora = instantesDoPeriodo(de, ate, timezone);
  const anterior = instantesDoPeriodo(antes.de, antes.ate, timezone);
  // As semanas cobrem o gráfico (12 semanas até `ate`) e os dois períodos.
  const inicioDoGrafico = somarDias(segundaDaSemana(ate), -7 * (SEMANAS_NO_GRAFICO - 1));
  const desde = antes.de < inicioDoGrafico ? antes.de : inicioDoGrafico;

  const [linhas, linhasAntes, caminho, semanas, desempenho, desempenhoAntes] = await Promise.all([
    comprasRecebidas(agora.inicio, agora.fim),
    comprasRecebidas(anterior.inicio, anterior.fim),
    aCaminho(),
    orcamentosSemanais(desde, ate, timezone),
    desempenhoDosFornecedores(agora.inicio, agora.fim, timezone),
    desempenhoDosFornecedores(anterior.inicio, anterior.fim, timezone),
  ]);
  const painel = montarPainel({
    de,
    ate,
    hoje,
    linhas,
    linhasAntes,
    aCaminho: { valor: caminho.valor, semPreco: caminho.semPreco },
    semanas,
    desempenho,
    desempenhoAntes,
  });
  // O que o painel buscou vai junto: o relatório agendado usa as mesmas
  // compras e o mesmo desempenho, e buscava tudo de novo.
  return { painel, linhas, linhasAntes, desempenho };
}
