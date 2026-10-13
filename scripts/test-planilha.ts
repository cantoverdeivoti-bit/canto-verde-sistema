import { lerNumero } from "../lib/planilha";
import { FUSO_DA_CASA, diaDaqui, diaISO } from "../lib/format";

/**
 * A leitura de número da planilha e o "hoje" no fuso da casa, sem banco.
 *
 *   npx tsx scripts/test-planilha.ts
 */

let falhas = 0;
function check(rotulo: string, ok: boolean, extra?: unknown) {
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${rotulo}${!ok && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`);
}

// --- Número da planilha --------------------------------------------------------
// A célula numérica do .xlsx chega com ponto decimal; o CSV, com vírgula.
const casos: [string, string][] = [
  ["2.5", "2.5"],
  ["0.5", "0.5"],
  ["12", "12"],
  ["2,5", "2.5"],
  ["0,25", "0.25"],
  ["1.234,5", "1234.5"],
  ["1.234.567,89", "1234567.89"],
  ["  3,0 ", "3.0"],
  ["", ""],
];
for (const [entrada, esperado] of casos) {
  const lido = lerNumero(entrada);
  check(`"${entrada}" vira "${esperado}"`, lido === esperado, lido);
}

// --- Hoje no fuso da casa -------------------------------------------------------
// Às 22h de Ivoti já é amanhã em UTC; o dia tem que continuar sendo o daqui.
const as22h30 = new Date("2026-10-05T01:30:00.000Z"); // domingo, 22h30 em Ivoti
check("22h30 de domingo ainda é domingo", diaISO(diaDaqui(0, FUSO_DA_CASA, as22h30)) === "2026-10-04");
check("e amanhã é segunda", diaISO(diaDaqui(1, FUSO_DA_CASA, as22h30)) === "2026-10-05");
check("meio-dia UTC, para nenhum fuso trocar o dia", diaDaqui(0, FUSO_DA_CASA, as22h30).getUTCHours() === 12);
check("de manhã, o mesmo dia nos dois relógios", diaISO(diaDaqui(0, FUSO_DA_CASA, new Date("2026-10-04T12:00:00.000Z"))) === "2026-10-04");

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
