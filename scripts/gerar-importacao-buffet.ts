/**
 * Gera o SQL que carrega o Cardápio buffet a partir da planilha
 * ESTRUTURA_CARDÁPIO_BUFFET_NOVO.xlsx: grupos, pratos (com custo/kg, ficha,
 * alertas e o fluxo do forno), configuração, mapa e o cardápio-modelo.
 *
 * Uso (uma vez, na máquina de quem tem a planilha; ela não vai para o repo):
 *   npx tsx scripts/gerar-importacao-buffet.ts caminho/da/planilha.xlsx > dados.sql
 *
 * O SQL entra na migration do módulo. É assim que a produção recebe os dados
 * sozinha no publique, sem ninguém rodar nada contra o banco de lá.
 */
import ExcelJS from "exceljs";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("Uso: npx tsx scripts/gerar-importacao-buffet.ts planilha.xlsx");
  process.exit(1);
}

type Celula = ExcelJS.CellValue;
/** O valor como a planilha mostra: resultado da fórmula, texto rico juntado. */
function valor(v: Celula): string | number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    if ("result" in v) return valor((v as { result: Celula }).result);
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
    if ("text" in v) return String((v as { text: string }).text);
  }
  return null;
}
const texto = (v: Celula) => {
  const x = valor(v);
  return x === null ? null : String(x).replace(/\s+/g, " ").trim() || null;
};
const sql = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const num = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? "NULL" : String(n));
/** Igual ignorando acento, maiúscula e espaço sobrando: o nome no fluxo e na receita nem sempre batem letra a letra. */
const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Os grupos, na ordem do percurso do cliente (anti-horário, começa nas
// saladas), com o lugar de cada estação no desenho do mapa.
const GRUPOS = [
  { planilha: "SALADAS", nome: "Saladas", ordem: 1, cor: "#22b14c", posicoes: 21, linha: 3, coluna: 1, largura: 2, colunas: 7, linhas: [51, 71] },
  { planilha: "PROTEÍNAS", nome: "Proteínas", ordem: 2, cor: "#c1272d", posicoes: 7, linha: 2, coluna: 1, largura: 1, colunas: 3, linhas: [27, 33] },
  { planilha: "PRATOS QUENTES", nome: "Pratos quentes", ordem: 3, cor: "#c1272d", posicoes: 18, linha: 1, coluna: 1, largura: 2, colunas: 6, linhas: [7, 24] },
  { planilha: "SOBREMESAS", nome: "Sobremesas", ordem: 4, cor: "#2e3192", posicoes: 13, linha: 2, coluna: 2, largura: 1, colunas: 6, linhas: [36, 48] },
] as const;

// O desenho "Segunda a quinta" da aba MAPA DO BUFFET (era uma imagem):
// número, forma, linha, coluna, largura, altura na grade de cada estação.
type P = [number, "RETANGULO" | "CIRCULO" | "OVAL", number, number, number?, number?];
const MAPA: Record<string, P[]> = {
  "PRATOS QUENTES": [
    [13, "RETANGULO", 1, 1], [14, "RETANGULO", 1, 2], [15, "RETANGULO", 1, 3], [16, "RETANGULO", 1, 4], [17, "RETANGULO", 1, 5], [18, "RETANGULO", 1, 6],
    [7, "RETANGULO", 2, 1], [8, "CIRCULO", 2, 2], [9, "CIRCULO", 2, 3], [10, "CIRCULO", 2, 4], [11, "CIRCULO", 2, 5], [12, "CIRCULO", 2, 6],
    [1, "RETANGULO", 3, 1], [2, "RETANGULO", 3, 2], [3, "RETANGULO", 3, 3], [4, "RETANGULO", 3, 4], [5, "RETANGULO", 3, 5], [6, "RETANGULO", 3, 6],
  ],
  PROTEÍNAS: [
    [4, "RETANGULO", 1, 1], [5, "CIRCULO", 1, 2], [6, "CIRCULO", 1, 3],
    [1, "RETANGULO", 2, 1], [2, "RETANGULO", 2, 2], [3, "RETANGULO", 2, 3],
    [7, "RETANGULO", 3, 1],
  ],
  SOBREMESAS: [
    [3, "OVAL", 1, 1], [2, "OVAL", 2, 1], [1, "OVAL", 3, 1],
    [7, "RETANGULO", 1, 2], [8, "RETANGULO", 1, 3], [4, "RETANGULO", 2, 2], [5, "RETANGULO", 2, 3], [6, "RETANGULO", 2, 4],
    [9, "OVAL", 1, 5], [10, "OVAL", 2, 5],
    [11, "OVAL", 1, 6], [12, "OVAL", 2, 6], [13, "OVAL", 3, 6],
  ],
  SALADAS: [
    [3, "RETANGULO", 1, 1], [2, "RETANGULO", 2, 1], [1, "RETANGULO", 3, 1],
    [4, "RETANGULO", 1, 2], [5, "RETANGULO", 2, 2], [6, "RETANGULO", 3, 2],
    [9, "OVAL", 1, 3], [8, "OVAL", 2, 3], [7, "OVAL", 3, 3],
    [10, "RETANGULO", 1, 4], [11, "RETANGULO", 2, 4], [12, "RETANGULO", 3, 4],
    [13, "RETANGULO", 1, 5, 3],
    [14, "RETANGULO", 2, 5], [16, "RETANGULO", 2, 6], [18, "RETANGULO", 2, 7],
    [15, "RETANGULO", 3, 5], [17, "RETANGULO", 3, 6], [19, "RETANGULO", 3, 7],
    [20, "CIRCULO", 4, 5], [21, "CIRCULO", 4, 6],
  ],
};

const POSTO: Record<string, string> = {
  "FORNO COMBINADO": "FORNO_COMBINADO",
  "COMBINADO + APOIO": "COMBINADO_APOIO",
  "FOGÃO / FRITADEIRA": "FOGAO_FRITADEIRA",
  "PRAÇA FRIA": "PRACA_FRIA",
};
const carga = (t: string | null) => {
  if (!t) return null;
  if (t.startsWith("0")) return "DEFUMACAO";
  if (t.startsWith("N")) return "NOTURNO";
  if (t.startsWith("1")) return "VAPOR";
  if (t.startsWith("2")) return "BRASEADO";
  if (t.startsWith("3")) return "MEDIO";
  if (t.startsWith("4")) return "ASSADO";
  if (t.startsWith("5")) return "AR_SECO";
  if (t.includes("SEM FORNO")) return "SEM_FORNO";
  return null;
};
const janela = (t: string | null) => {
  if (!t) return null;
  if (t.startsWith("D-1 · VÉSP")) return "D1_VESPERA";
  if (t.startsWith("D-1 · NOITE")) return "D1_NOITE";
  if (t.startsWith("J1")) return "J1";
  if (t.startsWith("J2")) return "J2";
  if (t.startsWith("J3")) return "J3";
  if (t.startsWith("J4")) return "J4_SERVICO";
  if (t.startsWith("J5")) return "J5_POS_SERVICO";
  return null;
};
const viabilidade = (t: string | null) =>
  !t ? null : t.startsWith("Total") ? "TOTAL" : t.startsWith("Parcial") ? "PARCIAL" : t.startsWith("Não rec") ? "NAO_RECOMENDADO" : t.startsWith("Não apl") ? "NAO_APLICAVEL" : null;
const cor = (t: string | null) => (t === "verde" ? "VERDE" : t === "azul" ? "AZUL" : "NENHUMA");
/** 0.3 vira "30%"; texto ("0% / 100%") fica como está. */
const porcento = (v: Celula) => {
  const x = valor(v);
  if (x === null) return null;
  if (typeof x === "number") return `${Math.round(x * 100)}%`;
  return texto(v);
};

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arquivo);
  const aba = (nome: string) => {
    const ws = wb.getWorksheet(nome);
    if (!ws) throw new Error(`A planilha não tem a aba "${nome}".`);
    return ws;
  };
  const out: string[] = [];
  const avisos: string[] = [];

  // ---- Configuração e metas ----
  const cfg = aba("1. CONFIG & PARÂMETROS");
  const metas = new Map<string, number>();
  for (let r = 63; r <= 66; r++) {
    const g = texto(cfg.getRow(r).getCell(1).value);
    const m = valor(cfg.getRow(r).getCell(2).value);
    if (g && typeof m === "number") metas.set(g, m);
  }
  const limiteA = Number(valor(cfg.getCell("B56").value) ?? 0.05);
  const limiteB = Number(valor(cfg.getCell("B57").value) ?? 0.02);

  out.push("-- Grupos (estações do buffet), na ordem do percurso do cliente.");
  for (const g of GRUPOS) {
    out.push(
      `INSERT INTO "buffet_grupos" ("nome","ordem","cor","posicoes","metaCustoKg","mapaLinha","mapaColuna","mapaLargura","mapaColunas") VALUES (${sql(g.nome)},${g.ordem},${sql(g.cor)},${g.posicoes},${num(metas.get(g.planilha) ?? null)},${g.linha},${g.coluna},${g.largura},${g.colunas});`,
    );
  }
  const grupoId = (planilha: string) => `(SELECT "id" FROM "buffet_grupos" WHERE "nome" = ${sql(GRUPOS.find((g) => g.planilha === planilha)!.nome)})`;

  const fluxo = aba("4. FLUXO — PARÂMETROS");
  const hora = (endereco: string, padrao: string) => {
    const v = fluxo.getCell(endereco).value;
    if (v instanceof Date) return v.toISOString().slice(11, 16);
    return padrao;
  };
  const inteiro = (endereco: string, padrao: number) => {
    const v = valor(fluxo.getCell(endereco).value);
    return typeof v === "number" ? Math.round(v) : padrao;
  };
  out.push("", "-- Parâmetros do buffet e do forno combinado.");
  out.push(
    `INSERT INTO "buffet_configuracao" ("id","limiteClasseA","limiteClasseB","inicioTurno","aberturaBuffet","encerramentoBuffet","fimTurno","inicioVespera","fornos","gnPorForno","cozinheiros","cicloDefumacaoHoras","cicloLimpezaMin","updatedAt") VALUES (1,${limiteA},${limiteB},${sql(hora("B5", "07:30"))},${sql(hora("B6", "11:00"))},${sql(hora("B7", "13:30"))},${sql(hora("B8", "15:00"))},${sql(hora("B16", "14:00"))},${inteiro("B10", 1)},${inteiro("B11", 10)},${inteiro("B13", 4)},${inteiro("B15", 4)},${inteiro("B17", 60)},CURRENT_TIMESTAMP);`,
  );

  out.push("", "-- O desenho do mapa (Segunda a quinta).");
  for (const [g, posicoes] of Object.entries(MAPA)) {
    for (const [n, forma, linha, coluna, largura = 1, altura = 1] of posicoes) {
      out.push(
        `INSERT INTO "buffet_mapa_posicoes" ("grupoId","numero","forma","linha","coluna","largura","altura") VALUES (${grupoId(g)},${n},'${forma}',${linha},${coluna},${largura},${altura});`,
      );
    }
  }

  // ---- O fluxo do forno por receita (só as 113 do cardápio têm) ----
  const fluxoPorNome = new Map<string, string[]>();
  for (let r = 41; r <= fluxo.rowCount; r++) {
    const row = fluxo.getRow(r);
    const nome = texto(row.getCell(1).value);
    if (!nome) continue;
    const c = (col: string) => row.getCell(col).value;
    const proc = texto(c("Q"));
    fluxoPorNome.set(chave(nome), [
      viabilidade(texto(c("D"))) ? `'${viabilidade(texto(c("D")))}'` : "NULL",
      sql(texto(c("E")) === "—" ? null : texto(c("E"))),
      sql(texto(c("F")) === "—" ? null : texto(c("F"))),
      sql(texto(c("G")) === "—" ? null : porcento(c("G"))),
      sql(texto(c("H")) === "—" ? null : texto(c("H"))),
      sql(texto(c("I")) === "—" ? null : texto(c("I"))),
      POSTO[texto(c("J")) ?? ""] ? `'${POSTO[texto(c("J"))!]}'` : "NULL",
      carga(texto(c("K"))) ? `'${carga(texto(c("K")))}'` : "NULL",
      janela(texto(c("L"))) ? `'${janela(texto(c("L")))}'` : "NULL",
      sql(texto(c("M"))),
      `'${cor(texto(c("O")))}'`,
      texto(c("P")) === "Sim" ? "true" : "false",
      sql(proc && proc !== "Não" ? proc : null),
    ]);
  }

  // ---- Pratos ----
  const rec = aba("2. RECEITAS");
  let grupoAtual = "";
  let categoriaAtual = "";
  const nomes = new Set<string>();
  let comFluxo = 0;
  out.push("", "-- Pratos, com custo/kg da ficha técnica e o fluxo do forno quando há.");
  for (let r = 4; r <= rec.rowCount; r++) {
    const row = rec.getRow(r);
    const codigo = texto(row.getCell(1).value);
    if (!codigo) continue;
    grupoAtual = texto(row.getCell(2).value) ?? grupoAtual;
    categoriaAtual = texto(row.getCell(3).value) ?? categoriaAtual;
    const nome = texto(row.getCell(4).value);
    if (!nome) continue;
    if (nomes.has(chave(nome))) {
      avisos.push(`nome repetido, ficou o primeiro: ${nome} (${codigo})`);
      continue;
    }
    nomes.add(chave(nome));
    if (!GRUPOS.some((g) => g.planilha === grupoAtual)) {
      avisos.push(`grupo desconhecido "${grupoAtual}" em ${codigo}`);
      continue;
    }
    const custo = valor(row.getCell(6).value);
    const f = fluxoPorNome.get(chave(nome));
    if (f) comFluxo++;
    const colunasFluxo = f
      ? `,"viabilidade","modo","temperatura","umidade","tempo","sonda","posto","carga","janela","ajuste","corForno","defumar","processoD1"`
      : "";
    out.push(
      `INSERT INTO "buffet_pratos" ("codigo","nome","grupoId","categoria","unidade","custoKg","codFicha","alertaCusto","updatedAt"${colunasFluxo}) VALUES (${sql(codigo)},${sql(nome)},${grupoId(grupoAtual)},${sql(categoriaAtual)},${sql(texto(row.getCell(5).value) ?? "kg")},${typeof custo === "number" ? Number(custo.toFixed(4)) : "NULL"},${sql(texto(row.getCell(7).value))},${sql(texto(row.getCell(8).value))},CURRENT_TIMESTAMP${f ? "," + f.join(",") : ""});`,
    );
  }

  // ---- O cardápio-modelo ----
  const card = aba("3. CARDÁPIO DO BUFFET");
  const COLUNAS_DOS_DIAS = ["B", "D", "F", "H", "J", "L", "N"];
  out.push("", "-- O cardápio-modelo da planilha, valendo o trimestre corrente.");
  out.push(`INSERT INTO "buffet_cardapios" ("nome","inicio","fim") VALUES ('Modelo da planilha','2026-10-01','2026-12-31');`);
  const cardapio = `(SELECT "id" FROM "buffet_cardapios" WHERE "nome" = 'Modelo da planilha')`;
  COLUNAS_DOS_DIAS.forEach((col, i) => {
    out.push(`INSERT INTO "buffet_cardapio_dias" ("cardapioId","diaSemana","tema") VALUES (${cardapio},${i + 1},${sql(texto(card.getCell(`${col}5`).value))});`);
  });
  let itens = 0;
  for (const g of GRUPOS) {
    for (let r = g.linhas[0]; r <= g.linhas[1]; r++) {
      const posicao = r - g.linhas[0] + 1;
      COLUNAS_DOS_DIAS.forEach((col, i) => {
        const prato = texto(card.getCell(`${col}${r}`).value);
        if (!prato) return;
        if (!nomes.has(chave(prato))) {
          avisos.push(`no cardápio e não nas receitas: "${prato}" (${g.nome}, dia ${i + 1}, posição ${posicao})`);
          return;
        }
        itens++;
        out.push(
          `INSERT INTO "buffet_cardapio_itens" ("cardapioId","diaSemana","grupoId","posicao","pratoId") SELECT ${cardapio},${i + 1},${grupoId(g.planilha)},${posicao},"id" FROM "buffet_pratos" WHERE lower("nome") = lower(${sql(prato)});`,
        );
      });
    }
  }

  console.log(out.join("\n"));
  console.error(`pratos: ${nomes.size} · com fluxo do forno: ${comFluxo} · itens do cardápio: ${itens}`);
  for (const a of avisos) console.error(`aviso: ${a}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
