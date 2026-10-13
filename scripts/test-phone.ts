import { maskPhoneBR } from "../lib/phone-mask";
import { normalizePhone } from "../lib/validations";

/**
 * Telefone: da tecla ao banco, sem tocar no banco.
 *
 * Existe porque a máscara já corrompeu número de cliente em produção: ela
 * cortava em 11 dígitos antes de considerar o código do país, então quem
 * digitava "+55 51 99515-0766" tinha os dois últimos dígitos descartados e
 * saía com um telefone que não existe. Os casos com país abaixo são esse
 * bug; os casos com DDD 55 provam que a correção não os pega junto.
 */

type Case = {
  entrada: string;
  mascara: string;
  /** null = deve ser recusado na validação. */
  gravado: string | null;
};

const CASES: Case[] = [
  // Como a maioria digita.
  { entrada: "51995150766", mascara: "(51) 99515-0766", gravado: "+5551995150766" },
  { entrada: "(51) 99515-0766", mascara: "(51) 99515-0766", gravado: "+5551995150766" },
  { entrada: "5135541234", mascara: "(51) 3554-1234", gravado: "+555135541234" },

  // Com código do país — o que quebrava.
  { entrada: "+5551995150766", mascara: "(51) 99515-0766", gravado: "+5551995150766" },
  { entrada: "+55 51 99515-0766", mascara: "(51) 99515-0766", gravado: "+5551995150766" },
  { entrada: "5551995150766", mascara: "(51) 99515-0766", gravado: "+5551995150766" },
  { entrada: "+555135541234", mascara: "(51) 3554-1234", gravado: "+555135541234" },

  // DDD 55 (Santa Maria): nacional, nunca deve perder os dois primeiros.
  { entrada: "5532221234", mascara: "(55) 3222-1234", gravado: "+555532221234" },
  { entrada: "55999999999", mascara: "(55) 99999-9999", gravado: "+5555999999999" },

  // Parciais durante a digitação.
  { entrada: "", mascara: "", gravado: null },
  { entrada: "5", mascara: "(5", gravado: null },
  { entrada: "519", mascara: "(51) 9", gravado: null },

  // O número corrompido que ficou na base. São 11 dígitos, então a regra o
  // trata como nacional (DDD 55) — não dá para saber se alguém quis dizer
  // país+9dígitos, e ler como nacional é a leitura segura. De um jeito ou
  // de outro é impossível, e a base completa recusa.
  { entrada: "+55519951507", mascara: "(55) 51995-1507", gravado: null },
];

let falhas = 0;

for (const c of CASES) {
  const mascara = maskPhoneBR(c.entrada);
  const gravado = normalizePhone(mascara);
  const ok = mascara === c.mascara && gravado === c.gravado;
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"} ${JSON.stringify(c.entrada).padEnd(21)} -> ` +
      `${JSON.stringify(mascara).padEnd(20)} -> ${String(gravado)}` +
      (ok
        ? ""
        : `\n      esperado: ${JSON.stringify(c.mascara)} -> ${String(c.gravado)}`),
  );
}

console.log(
  falhas === 0
    ? `\n${CASES.length} casos, todos passaram.`
    : `\n${falhas} de ${CASES.length} casos falharam.`,
);

process.exit(falhas === 0 ? 0 : 1);
