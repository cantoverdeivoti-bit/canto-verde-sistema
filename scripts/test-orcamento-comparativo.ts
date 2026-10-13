import { compararSemana, totaisDoComparativo } from "../lib/orcamento-comparativo";
import type { SemanaDoRelatorio } from "../lib/orcamento";

/**
 * Orçamento × pedido × recebido e o CMV pelas compras, sem banco:
 * `npx tsx scripts/test-orcamento-comparativo.ts`.
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
const um = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

const semana = (s: Partial<SemanaDoRelatorio>): SemanaDoRelatorio => ({
  semana: "2026-10-05",
  faturamento: 20000,
  metaCmv: 30,
  orcamento: 6000,
  pedido: 5000,
  recebido: 5400,
  consumo: null,
  faturamentoDaSemana: 18000,
  cmvReal: null,
  ...s,
});

// Dentro: orçamento 6000, recebeu 5400, sobrou 600. CMV pelas compras 5400 ÷ 18000 = 30%.
const dentro = compararSemana(semana({}));
igual("sobra", dentro.sobra, 600);
igual("chegou a mais que o pedido", dentro.diferenca, 400);
igual("CMV pelas compras", um(dentro.cmvCompras), 30);
igual("CMV pelo pedido", um(dentro.cmvPedido), 27.8);

// Estouro: recebeu 7000 com orçamento 6000.
igual("estouro", compararSemana(semana({ recebido: 7000 })).sobra, -1000);
// Semana corrente: o faturamento dela ainda não foi digitado.
igual("sem faturamento, sem CMV", compararSemana(semana({ faturamentoDaSemana: null })).cmvCompras, null);
// Sem orçamento (faturamento anterior não digitado): sem sobra.
igual("sem orçamento, sem sobra", compararSemana(semana({ orcamento: null, faturamento: null })).sobra, null);

// O período: duas semanas com tudo, uma sem orçamento e sem faturamento.
const t = totaisDoComparativo([
  compararSemana(semana({})),
  compararSemana(semana({ semana: "2026-10-12", orcamento: 4000, recebido: 4500, pedido: 4200, faturamentoDaSemana: 12000, metaCmv: 35 })),
  compararSemana(semana({ semana: "2026-10-19", orcamento: null, faturamento: null, recebido: 800, pedido: 900, faturamentoDaSemana: null })),
]);
igual("totais", [t.orcamento, t.pedido, t.recebido, t.recebidoComOrcamento, t.sobra, t.faturamento], [10000, 10100, 10700, 9900, 100, 30000]);
// (5400 + 4500) ÷ 30000 = 33%; meta pesada: (30×18000 + 35×12000) ÷ 30000 = 32%.
igual("CMV e meta do período", [um(t.cmvCompras), um(t.metaCmv)], [33, 32]);
igual("período vazio", totaisDoComparativo([]).cmvCompras, null);

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
