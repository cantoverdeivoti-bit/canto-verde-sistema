/**
 * A etiqueta que a ficha provavelmente tem (Assado, Cozido, Grelhado ou
 * Outros), pelo nome e pelo modo do forno da planilha. É sugestão: a tela
 * mostra o porquê e quem conhece a receita confirma antes de aplicar.
 *
 * Sem banco. Testado em `scripts/test-receituario.ts`.
 */

export type Sugestao = { etiqueta: "Assado" | "Cozido" | "Grelhado" | "Outros"; porque: string };

/** O primeiro número de "200 → 180 °C" ou "0% → 80%". */
const primeiroNumero = (s: string | null) => {
  const m = /(\d+(?:[.,]\d+)?)/.exec(s ?? "");
  return m ? Number(m[1].replace(",", ".")) : null;
};

const PELO_NOME: [RegExp, Sugestao["etiqueta"], string][] = [
  [/grelhad|na chapa|churrasc/i, "Grelhado", "o nome diz grelhado"],
  [/assad|gratinad|ao forno|tostad/i, "Assado", "o nome diz assado"],
  [/frit|empanad|milanesa/i, "Outros", "o nome diz frito"],
  // "Molho" só quando o prato é o molho: "Bife ao molho madeira" é a carne.
  [/cozid|ensopad|refogad|braseado|caldo|sopa|pur[eê]|arroz|feij[aã]o|^molho|ragu|creme de|strogonoff|estrogonofe|risoto|lentilha|gr[aã]o[- ]de[- ]bico|polenta|canjica/i, "Cozido", "o nome diz cozido"],
];

export function sugerirEtiqueta(f: { nome: string; modoForno: string | null; temperatura: string | null; umidade: string | null }): Sugestao {
  for (const [re, etiqueta, porque] of PELO_NOME) if (re.test(f.nome)) return { etiqueta, porque };

  const modo = (f.modoForno ?? "").toLowerCase();
  const temp = primeiroNumero(f.temperatura);
  const umid = primeiroNumero(f.umidade);
  const doForno = [f.modoForno, f.temperatura, f.umidade].filter(Boolean).join(", ");
  if (!modo) return { etiqueta: "Outros", porque: "sem forno nem fogão na ficha" };
  if (modo.includes("chapa")) return { etiqueta: "Grelhado", porque: `forno: ${doForno}` };
  if (modo.includes("fritadeira")) return { etiqueta: "Outros", porque: `forno: ${doForno}` };
  if (modo.includes("fogão")) return { etiqueta: "Cozido", porque: `forno: ${doForno}` };
  // O primeiro passo manda: "Vapor + Ar seco" cozinha no vapor e doura no fim.
  if (modo.startsWith("vapor")) return { etiqueta: "Cozido", porque: `forno: ${doForno}` };
  if (modo.startsWith("combinado") && umid !== null && umid >= 80 && (temp === null || temp <= 130)) return { etiqueta: "Cozido", porque: `forno: ${doForno}` };
  if ((modo.startsWith("ar seco") || modo.startsWith("combinado")) && (temp === null || temp >= 160)) return { etiqueta: "Assado", porque: `forno: ${doForno}` };
  return { etiqueta: "Cozido", porque: `forno: ${doForno}` };
}
