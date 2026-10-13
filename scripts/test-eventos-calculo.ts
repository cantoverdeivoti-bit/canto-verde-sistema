import {
  cmvPct,
  producaoDoEvento,
  type FichaParaProducao,
  type InsumoParaProducao,
  custoPorPessoa,
  precoSugerido,
  resumoDoEvento,
  situacaoDoPagamento,
  somarDiasNaData,
  valorDoSinal,
} from "../lib/eventos-calculo";

/**
 * As contas do módulo Eventos, sem banco: `npx tsx scripts/test-eventos-calculo.ts`.
 */

let falhas = 0;
function igual<T>(nome: string, obtido: T, esperado: T) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) console.log(`ok  ${nome}`);
  else {
    falhas++;
    console.log(`ERRO ${nome}\n     obtido:   ${a}\n     esperado: ${b}`);
  }
}

// Cardápio: 1 principal de R$ 18,40, 6 salgadinhos de R$ 0,85, 1 sobremesa de R$ 4,10.
const custo = custoPorPessoa([
  { custoPorcao: 18.4, porcoesPorPessoa: 1 },
  { custoPorcao: 0.85, porcoesPorPessoa: 6 },
  { custoPorcao: 4.1, porcoesPorPessoa: 1 },
]);
igual("custo por pessoa soma porções", custo, 27.6);
igual("CMV com preço", cmvPct(27.6, 92)?.toFixed(1), "30.0");
igual("CMV sem preço é nulo", cmvPct(27.6, null), null);
igual("CMV com preço zero é nulo", cmvPct(27.6, 0), null);
igual("preço sugerido: 30% de margem e 6% de imposto", precoSugerido(27.6, 30, 6), 43.13);
igual("preço sugerido impossível é nulo", precoSugerido(27.6, 80, 20), null);

// Evento: locação + comida para 30 + garçons + gás (custo interno, sem preço).
const linhas = [
  { quantidade: 1, custoUnitario: 0, precoUnitario: 800 },
  { quantidade: 30, custoUnitario: 27.6, precoUnitario: 92 },
  { quantidade: 3, custoUnitario: 150, precoUnitario: 0 },
  { quantidade: 1, custoUnitario: 60, precoUnitario: 0 },
];
const r = resumoDoEvento(linhas, { convidados: 30, taxaServicoPct: 10, impostoPct: 6 });
igual("custo do evento", r.custo, 1338);
igual("subtotal é a receita da casa", r.subtotal, 3560);
igual("taxa de serviço sobre o subtotal", r.taxaServico, 356);
igual("total do cliente inclui a taxa", r.totalCliente, 3916);
igual("imposto só sobre a receita", r.imposto, 213.6);
igual("lucro = receita − custo − imposto", r.lucro, 2008.4);
igual("margem sobre a receita", r.margemPct?.toFixed(2), "56.42");
igual("custo por convidado", r.custoPorConvidado, 44.6);
igual("preço por convidado é o do cliente", r.precoPorConvidado, 130.53);

const vazio = resumoDoEvento([], { convidados: 0, taxaServicoPct: 10, impostoPct: 0 });
igual("evento sem linhas não tem margem", vazio.margemPct, null);
igual("evento sem convidados não divide", vazio.custoPorConvidado, null);

igual("sinal de 30%", valorDoSinal(3916, 30), 1174.8);
igual("saldo depois do sinal", situacaoDoPagamento(3916, [1174.8]), { recebido: 1174.8, saldo: 2741.2 });
igual("pago a mais não deixa saldo negativo", situacaoDoPagamento(100, [60, 50]), { recebido: 110, saldo: 0 });

igual("uma semana antes", somarDiasNaData("2026-11-07", -7), "2026-10-31");
igual("virada de ano", somarDiasNaData("2026-12-31", 1), "2027-01-01");

// A produção do evento: pratos em receitas, pré-preparo somado, insumo bruto.
{
  const fichas = new Map<number, FichaParaProducao>([
    // Strogonoff: 10 porções, 2000 g; leva 200 g de molho e 1000 g de carne.
    [1, { id: 1, codigo: "1A", nome: "Strogonoff", porcoes: 10, rendimentoTotal: 2000, unidadeRendimento: "g", ingredientes: [
      { insumoId: null, subFichaId: 2, quantidade: 200, unidade: "g" },
      { insumoId: 10, subFichaId: null, quantidade: 1000, unidade: "g" },
    ] }],
    // Molho: 1000 g prontos; leva 500 g de cebola (rende 80%).
    [2, { id: 2, codigo: "2B", nome: "Molho", porcoes: 1, rendimentoTotal: 1000, unidadeRendimento: "g", ingredientes: [
      { insumoId: 11, subFichaId: null, quantidade: 500, unidade: "g" },
    ] }],
    // Arroz usa o mesmo molho (100 g) e um pré-preparo sem peso pronto.
    [3, { id: 3, codigo: "3C", nome: "Arroz", porcoes: 5, rendimentoTotal: 1000, unidadeRendimento: "g", ingredientes: [
      { insumoId: null, subFichaId: 2, quantidade: 100, unidade: "g" },
      { insumoId: null, subFichaId: 4, quantidade: 50, unidade: "g" },
    ] }],
    [4, { id: 4, codigo: "4D", nome: "Tempero", porcoes: 1, rendimentoTotal: null, unidadeRendimento: "g", ingredientes: [] }],
    // Laço: 5 chama 6, 6 chama 5.
    [5, { id: 5, codigo: "5E", nome: "Laço A", porcoes: 1, rendimentoTotal: 100, unidadeRendimento: "g", ingredientes: [{ insumoId: null, subFichaId: 6, quantidade: 100, unidade: "g" }] }],
    [6, { id: 6, codigo: "6F", nome: "Laço B", porcoes: 1, rendimentoTotal: 100, unidadeRendimento: "g", ingredientes: [{ insumoId: null, subFichaId: 5, quantidade: 100, unidade: "g" }] }],
  ]);
  const insumos = new Map<number, InsumoParaProducao>([
    [10, { nome: "Carne", unidadeUso: "g", rendimento: 1 }],
    [11, { nome: "Cebola", unidadeUso: "g", rendimento: 0.8 }],
  ]);
  // 50 convidados: 1 strogonoff e 1 arroz por pessoa.
  const p = producaoDoEvento([{ fichaId: 1, porcoes: 50 }, { fichaId: 3, porcoes: 50 }], fichas, insumos);
  igual("strogonoff: 5 receitas, 10 kg prontos", [p.pratos[0].receitas, p.pratos[0].pronto], [5, 10000]);
  igual("arroz: 10 receitas", p.pratos[1].receitas, 10);
  const molho = p.preparos.find((x) => x.nome === "Molho");
  igual("molho somado: 1000 g do strogonoff + 1000 g do arroz", molho?.quantidade, 2000);
  igual("molho: 2 receitas", molho?.receitas, 2);
  igual("carne: 5 kg", p.insumos.find((x) => x.nome === "Carne")?.bruto, 5000);
  const cebola = p.insumos.find((x) => x.nome === "Cebola");
  igual("cebola: 1 kg limpo, 1,25 kg para comprar", [cebola?.limpo, cebola?.bruto], [1000, 1250]);
  igual("pré-preparo sem peso pronto avisa", p.semRendimento, ["Tempero"]);
  igual("receita sem ingrediente avisa", producaoDoEvento([{ fichaId: 4, porcoes: 1 }], fichas, insumos).semIngredientes, ["Tempero"]);
  const laco = producaoDoEvento([{ fichaId: 5, porcoes: 1 }], fichas, insumos);
  igual("laço não trava", laco.preparos.length, 1);
}

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
