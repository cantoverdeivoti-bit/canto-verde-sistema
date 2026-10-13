import type { SemanaDoRelatorio } from "../lib/orcamento";
import { montarPainel, precoDaCesta, variacoesDePreco } from "../lib/painel-compras";
import { resolverPeriodo } from "../lib/periodo";
import { escalaDaFaixa, escalaDoZero } from "../app/admin/compras/relatorios/escala";
import type { CompraRecebida, DesempenhoDoFornecedor } from "../lib/relatorios-compras";

/**
 * As contas do painel executivo, sem banco: a inflação da cesta, a ordem e o
 * limite dos insights, a semana estourada e o painel vazio.
 *
 *   npx tsx --env-file=.env scripts/test-painel.ts
 *
 * (O `.env` só porque o módulo importa as consultas; nada vai ao banco.)
 */

let falhas = 0;
function check(rotulo: string, ok: boolean, extra?: unknown) {
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${rotulo}${!ok && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`);
}
const perto = (a: number | null, b: number) => a !== null && Math.abs(a - b) < 0.01;

let pedido = 0;
function compra(produtoId: number, fornecedorId: number, quantidade: number, preco: number): CompraRecebida {
  pedido += 1;
  return {
    produtoId,
    nome: `Produto ${produtoId}`,
    unidade: "KG",
    categoria: "Hortifruti",
    ordemCategoria: 1,
    fornecedorId,
    fornecedor: `Fornecedor ${fornecedorId}`,
    quantidade,
    valor: Math.round(quantidade * preco * 100) / 100,
    preco,
    pedidoId: pedido,
  };
}
function semana(dia: string, pedido: number, recebido: number, orcamento: number | null): SemanaDoRelatorio {
  return { semana: dia, faturamento: null, metaCmv: null, orcamento, pedido, recebido, consumo: null, faturamentoDaSemana: null, cmvReal: null };
}
function desempenho(fornecedorId: number, extra: Partial<DesempenhoDoFornecedor>): DesempenhoDoFornecedor {
  return {
    fornecedorId,
    nome: `Fornecedor ${fornecedorId}`,
    gasto: 0,
    pedidos: 0,
    comPrevisao: 0,
    noPrazo: 0,
    semChegar: 0,
    naoEntregue: 0,
    atrasoMedio: null,
    falta: 0,
    devolvido: 0,
    avaria: 0,
    diferencaPreco: 0,
    ...extra,
  };
}

// --- A cesta: só o preço conta, não o volume --------------------------------
{
  // Produto 1: 10 kg a 11 agora, 50 kg a 10 antes → +10%, 10 de efeito.
  // Produto 2: só agora — fica fora da cesta.
  const c = precoDaCesta([compra(1, 1, 10, 11), compra(2, 1, 5, 3)], [compra(1, 1, 50, 10)]);
  check("cesta: +10% no produto comprado nos dois", perto(c.variacao, 10), c);
  check("cesta: 1 produto na conta", c.produtos === 1, c);
  check("cesta: efeito de R$ 10", perto(c.efeito, 10), c);
  check("cesta: sem período anterior, sem variação", precoDaCesta([compra(1, 1, 1, 1)], []).variacao === null);
}

// --- O painel inteiro -------------------------------------------------------
{
  const linhas = [
    // Produto 1, classe A: subiu de 10 para 12 (20%) em 100 kg → R$ 200.
    compra(1, 1, 100, 12),
    // Produto 2: dois fornecedores, 5 e 6 → comprar tudo a 5 economizaria 50 × 1 = R$ 50.
    compra(2, 1, 50, 5),
    compra(2, 2, 50, 6),
    // Produto 3, pequeno.
    compra(3, 3, 1, 2),
  ];
  const linhasAntes = [compra(1, 1, 100, 10), compra(2, 1, 100, 5)];
  const semanas = [
    semana("2026-09-14", 500, 400, 600), // dentro do orçamento
    semana("2026-09-21", 900, 800, 700), // estourou em R$ 200
  ];
  const dados = montarPainel({
    de: "2026-09-14",
    ate: "2026-09-26",
    linhas,
    linhasAntes,
    aCaminho: { valor: 0, semPreco: 0 },
    semanas,
    desempenho: [
      desempenho(1, { comPrevisao: 4, noPrazo: 1, atrasoMedio: 2, diferencaPreco: 30 }),
      desempenho(2, { comPrevisao: 2, noPrazo: 2 }),
    ],
    desempenhoAntes: [desempenho(1, { comPrevisao: 2, noPrazo: 2 })],
  });

  const tipos = dados.insights.map((i) => i.tipo);
  check("insights: no máximo 3", dados.insights.length === 3, tipos);
  check("insights: preço e orçamento empatam em R$ 200 e vêm na frente", tipos.slice(0, 2).sort().join() === "orcamento,preco", tipos);
  check("insights: diferença entre fornecedores (R$ 50) em terceiro", tipos[2] === "fornecedores", tipos);
  check("insights: cobrança (R$ 30) e riscos ficam de fora", !tipos.includes("cobranca") && !tipos.includes("prazo"), tipos);
  const preco = dados.insights.find((i) => i.tipo === "preco");
  check("insight de preço: R$ 200 de impacto", perto(preco?.impacto ?? null, 200), preco);
  const orc = dados.insights.find((i) => i.tipo === "orcamento");
  check("insight de orçamento: R$ 200 acima", perto(orc?.impacto ?? null, 200), orc);

  check("KPI gasto", perto(dados.kpis.gasto, 1200 + 250 + 300 + 2), dados.kpis.gasto);
  check("KPI orçamento: 1400 ÷ 1300", perto(dados.kpis.orcamento.uso, (1400 / 1300) * 100), dados.kpis.orcamento);
  check("KPI prazo: 3 de 6 no prazo", perto(dados.kpis.prazo.pct, 50), dados.kpis.prazo);
  check("KPI prazo antes: 100%", perto(dados.kpis.prazo.pctAntes, 100), dados.kpis.prazo);
  check("gráfico: 12 semanas, a última é a de 21/09", dados.grafico.length === 12 && dados.grafico[11].semana === "2026-09-21", dados.grafico.map((g) => g.semana));
  check("gráfico: semanas sem dado vêm zeradas", dados.grafico[0].pedido === 0 && dados.grafico[0].orcamento === null);
  check("gráfico: a coluna é o pedido, não o recebido", dados.grafico[11].pedido === 900 && dados.grafico[11].recebido === 800, dados.grafico[11]);
  check("gráfico: sem hoje, nenhuma semana em andamento", dados.grafico.every((g) => !g.emAndamento));
  check("média: só desde a primeira semana com pedido", perto(dados.mediaSemanal, (500 + 900) / 2), dados.mediaSemanal);
  const linkPreco = dados.insights.find((i) => i.tipo === "preco")?.acao.href ?? "";
  check("insight leva o período junto", linkPreco.endsWith("produto=1&de=2026-09-14&ate=2026-09-26"), linkPreco);
  const a1 = dados.abc.find((i) => i.produtoId === 1);
  check("ABC: produto 1 é A, +20% de preço, 1 fornecedor", a1?.classe === "A" && perto(a1.variacaoPreco, 20) && a1.fornecedores === 1, a1);
  const a3 = dados.abc.find((i) => i.produtoId === 3);
  check("ABC: produto 3 é novo (sem preço anterior)", a3?.variacaoPreco === null, a3);
}

// --- Semana em andamento fica fora da média ---------------------------------
{
  const d = montarPainel({
    de: "2026-09-14",
    ate: "2026-09-23",
    hoje: "2026-09-23",
    linhas: [],
    linhasAntes: [],
    aCaminho: { valor: 0, semPreco: 0 },
    semanas: [semana("2026-09-14", 500, 0, null), semana("2026-09-21", 100, 0, null)],
    desempenho: [],
    desempenhoAntes: [],
  });
  check("em andamento: a semana de hoje", d.grafico[11].emAndamento && !d.grafico[10].emAndamento);
  check("em andamento: fora da média", perto(d.mediaSemanal, 500), d.mediaSemanal);
}

// --- Prazo conta o atrasado que não chegou -----------------------------------
{
  const d = montarPainel({
    de: "2026-09-14",
    ate: "2026-09-26",
    linhas: [],
    linhasAntes: [],
    aCaminho: { valor: 0, semPreco: 0 },
    semanas: [],
    // 2 entregues no prazo + 2 que venceram e não chegaram.
    desempenho: [desempenho(1, { comPrevisao: 4, noPrazo: 2, semChegar: 2 })],
    desempenhoAntes: [],
  });
  check("prazo: 2 de 4, contando os que não chegaram", perto(d.kpis.prazo.pct, 50) && d.kpis.prazo.semChegar === 2, d.kpis.prazo);
}

// --- Dependência por fornecedor, não por nome --------------------------------
{
  const mesmoNome = (f: number, valor: number) => ({ ...compra(9, f, 1, valor), fornecedor: "Casa" });
  const d = montarPainel({
    de: "2026-09-14",
    ate: "2026-09-26",
    linhas: [mesmoNome(1, 40), mesmoNome(2, 30), compra(9, 3, 1, 30)],
    linhasAntes: [],
    aCaminho: { valor: 0, semPreco: 0 },
    semanas: [],
    desempenho: [],
    desempenhoAntes: [],
  });
  check("dependência: dois fornecedores com o mesmo apelido não somam", !d.insights.some((i) => i.tipo === "dependencia"), d.insights);
}

// --- Variação de preço: a mesma conta da ABC ---------------------------------
{
  const v = variacoesDePreco([compra(1, 1, 10, 12), compra(1, 2, 10, 10), compra(2, 1, 1, 5)], [compra(1, 1, 5, 10)]);
  check("variação: média ponderada 11 contra 10 = +10%", v.length === 1 && perto(v[0].variacao, 10), v);
  check("variação: pesou (11 − 10) × 20 = R$ 20", perto(v[0].efeito, 20), v);
}

// --- Período ------------------------------------------------------------------
{
  const hoje = "2026-10-03";
  const mes = { de: "2026-10-01", ate: "2026-10-03" };
  const eq = (a: { de: string; ate: string }, b: { de: string; ate: string }) => a.de === b.de && a.ate === b.ate;
  check("período: 31/02 não existe, cai no padrão", eq(resolverPeriodo("2026-02-01", "2026-02-31", hoje), mes));
  check("período: fim no futuro vira hoje", eq(resolverPeriodo("2026-09-01", "2026-12-31", hoje), { de: "2026-09-01", ate: hoje }));
  check("período: começo no futuro cai no padrão", eq(resolverPeriodo("2026-11-01", "2026-11-30", hoje), mes));
  check("período: padrão da aba", eq(resolverPeriodo(undefined, undefined, hoje, { de: "2026-07-06", ate: hoje }), { de: "2026-07-06", ate: hoje }));
  check("período: válido passa", eq(resolverPeriodo("2026-09-01", "2026-09-30", hoje), { de: "2026-09-01", ate: "2026-09-30" }));
}

// --- Escala dos eixos ---------------------------------------------------------
{
  const e = escalaDoZero(9300);
  check("escala: 9.300 → 0, 5 mil, 10 mil", e.marcas.join() === "0,5000,10000" && e.topo === 10000, e);
  const f = escalaDaFaixa(10.4, 12.9);
  check("escala de preço: contém a faixa, passos redondos", f.base <= 10.4 && f.topo >= 12.9 && f.marcas.length >= 2, f);
  const g = escalaDaFaixa(5, 5);
  check("escala de preço igual: faixa em volta", g.base < 5 && g.topo > 5, g);
}

// --- Sem nada ---------------------------------------------------------------
{
  const vazio = montarPainel({
    de: "2026-09-01",
    ate: "2026-09-26",
    linhas: [],
    linhasAntes: [],
    aCaminho: { valor: 0, semPreco: 0 },
    semanas: [],
    desempenho: [],
    desempenhoAntes: [],
  });
  check("vazio: nenhum insight inventado", vazio.insights.length === 0, vazio.insights);
  check("vazio: KPIs sem divisão por zero", vazio.kpis.gasto === 0 && vazio.kpis.orcamento.uso === null && vazio.kpis.cesta.variacao === null && vazio.kpis.prazo.pct === null, vazio.kpis);
  check("vazio: ABC vazia", vazio.abc.length === 0);
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
