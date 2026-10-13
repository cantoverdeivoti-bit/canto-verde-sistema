import { UNIT_LABEL, chave } from "@/lib/format";
import type { ProductUnit } from "@/generated/prisma/client";

/**
 * Planilha, no dialeto do Excel brasileiro.
 *
 * Três escolhas que parecem detalhe e não são:
 *
 * - Separador `;`. O CSV separado por vírgula é o padrão de fora; aberto num
 *   Excel configurado para português, ele cai todo numa coluna só.
 * - Marca de codificação (BOM) no começo. Sem ela o Excel lê UTF-8 como
 *   CP1252 e "Hortifrúti" vira "HortifrÃºti".
 * - Decimal com vírgula, porque é o que a planilha devolve e o que a pessoa
 *   digita.
 */

const BOM = "﻿";
const SEP = ";";

export const COLUNAS = [
  "Código",
  "Descrição",
  "Categoria",
  "Unidade",
  "Estoque",
  "Mínimo",
  "Ideal",
  "Ativo",
] as const;

// `chave` mudou para lib/format.ts quando a busca das telas passou a precisar
// da mesma régua. Reexportada aqui porque este é o módulo que ensina o
// dialeto da planilha, e quem lê a importação espera achá-la por perto.
export { chave };

/**
 * Mapa inverso rótulo→unidade.
 *
 * Aceita tanto a abreviação quanto o nome do enum, porque normalizadas elas
 * nem sempre coincidem — "fardo" é FD, "maço" é MACO — e recusar uma planilha
 * por causa disso seria implicância.
 */
function inverso<T extends string>(labels: Record<T, string>): Map<string, T> {
  const m = new Map<string, T>();
  for (const [valor, rotulo] of Object.entries(labels) as [T, string][]) {
    m.set(chave(rotulo), valor);
    m.set(chave(valor), valor);
  }
  return m;
}

export const UNIDADE_POR_TEXTO = inverso(UNIT_LABEL);

export function lerUnidade(texto: string): ProductUnit | undefined {
  return UNIDADE_POR_TEXTO.get(chave(texto));
}

/**
 * Categoria não é mais lista fechada, então o mapa se monta na hora, com o
 * que estiver cadastrado quando a planilha chega.
 *
 * Continua tolerante ao Excel: "Hortifrúti", "HORTIFRUTI" e "hortifruti" caem
 * na mesma categoria, o que importa porque o Excel corrompe acento ao
 * converter entre CP1252 e UTF-8 — a planilha que volta pode não ter os
 * mesmos bytes que saiu.
 */
export function mapaDeCategorias(
  categorias: { id: number; name: string }[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of categorias) m.set(chave(c.name), c.id);
  return m;
}

/**
 * "Sim" / "Não" / "VERDADEIRO" / "1" / "x" — o que uma pessoa escreve numa
 * coluna de sim-ou-não. Vazio conta como sim: produto novo nasce ativo.
 */
export function lerSimNao(texto: string): boolean {
  const k = chave(texto);
  if (k === "") return true;
  return ["sim", "s", "true", "verdadeiro", "1", "x", "ativo"].includes(k);
}

/**
 * Número da planilha: "1.234,5" -> "1234.5". Vazio devolve string vazia.
 *
 * O ponto só é separador de milhar quando há vírgula. Sem vírgula ele é o
 * decimal: é assim que a célula numérica do .xlsx chega ("2.5"). Tirar todo
 * ponto transformava 2,5 kg em 25 e 0,5 em 5.
 */
export function lerNumero(texto: string): string {
  const limpo = texto.trim();
  if (limpo === "") return "";
  return limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
}

/** Número do banco para a célula, na vírgula que o Excel espera. */
export function escreverNumero(valor: number | null): string {
  return valor === null ? "" : String(valor).replace(".", ",");
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Envolve em aspas só quando precisa, e dobra as aspas de dentro. */
function celula(valor: string): string {
  return /[";\n\r]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

export function escreverCSV(linhas: string[][]): string {
  return BOM + linhas.map((l) => l.map(celula).join(SEP)).join("\r\n");
}

/**
 * Leitor de CSV escrito à mão — são vinte linhas e evita uma dependência.
 *
 * Trata aspas, aspas dobradas dentro do campo, e quebra de linha dentro de
 * campo entre aspas. Aceita `;` ou `,` como separador: quem exporta de outro
 * sistema costuma trazer vírgula, e recusar isso seria implicância.
 */
export function lerCSV(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, "");
  const primeiraLinha = limpo.split(/\r?\n/, 1)[0] ?? "";
  const sep =
    (primeiraLinha.match(/;/g)?.length ?? 0) >=
    (primeiraLinha.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";

  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];

    if (aspas) {
      if (c === '"') {
        if (limpo[i + 1] === '"') {
          campo += '"';
          i++;
        } else aspas = false;
      } else campo += c;
      continue;
    }

    if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else if (c !== "\r") campo += c;
  }

  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  // Linha totalmente vazia é resto de arquivo, não dado.
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}
