import { sugeridoNaRequisicao } from "../lib/requisicao-regras";

/**
 * As regras da compra de rotina, sem banco: quanto pedir com o ideal do dia
 * e a contagem de hoje.
 *
 *   npx tsx scripts/test-requisicao.ts
 */

let falhas = 0;
function check(rotulo: string, ok: boolean, extra?: unknown) {
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${rotulo}${!ok && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`);
}

// --- Quanto pedir ---------------------------------------------------------------
const s = sugeridoNaRequisicao;
check("segunda: ideal 10, contado 4 → 6", s(10, 4, null).quantidade === 6, s(10, 4, null));
check("quinta: ideal 25, contado 4 → 21", s(25, 4, null).quantidade === 21, s(25, 4, null));
check("decimal sem lixo de ponto flutuante", s(1.2, 0.9, null).quantidade === 0.3, s(1.2, 0.9, null));
check("já no ideal: nada", s(10, 10, null).motivo === "no-ideal");
check("acima do ideal: nada", s(10, 12, null).motivo === "no-ideal");
check("não contado hoje: sem sugestão", s(10, null, null).motivo === "nao-contado");
check("sem ideal: sem sugestão", s(null, 3, null).motivo === "sem-ideal");
check("lote de 12, faltando 7 → 12", s(20, 13, 12).quantidade === 12, s(20, 13, 12));
check("lote de 12, faltando 5 → menos de meio lote", s(20, 15, 12).motivo === "meio-lote", s(20, 15, 12));
check("lote de 6, faltando 14 → 12", s(20, 6, 6).quantidade === 12, s(20, 6, 6));

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
