/**
 * Gera o SQL que carrega o Receituário a partir da planilha FICHA TÉCNICA E
 * RECEITUÁRIO da casa:
 * - os insumos (Banco de Insumos), com o preço digitado e o código de Compras;
 * - as fichas, uma por aba ("264C - Arroz Branco"), com ingredientes, modo
 *   de preparo, rendimento e validade;
 * - o forno (aba Forno Combinado), o "conferida" (Lista de Receitas) e as
 *   fichas dos pacotes de eventos (aba EVENTOS Cardápio Buffet).
 *
 * Uso (uma vez, na máquina de quem tem a planilha; ela não vai para o repo):
 *   npx tsx scripts/gerar-importacao-receituario.ts planilha.xlsx > dados.sql
 *
 * O SQL entra na migration do módulo, como no buffet: a produção recebe os
 * dados sozinha no publique, sem ninguém rodar nada contra o banco de lá.
 * O vínculo com Compras é feito lá dentro, pelo código do produto: o que não
 * existir no banco fica sem vínculo e usa o preço digitado.
 */
import ExcelJS from "exceljs";

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("Uso: npx tsx scripts/gerar-importacao-receituario.ts planilha.xlsx");
  process.exit(1);
}

type Celula = ExcelJS.CellValue;
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
const numero = (v: Celula) => {
  const x = valor(v);
  if (typeof x === "number") return x;
  if (typeof x === "string" && x.trim() !== "" && !Number.isNaN(Number(x.replace(",", ".")))) return Number(x.replace(",", "."));
  return null;
};
const sql = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const num = (n: number | null | undefined) => (n === null || n === undefined || Number.isNaN(n) ? "NULL" : String(n));
const lista = (xs: string[]) => (xs.length === 0 ? "ARRAY[]::TEXT[]" : `ARRAY[${xs.map(sql).join(",")}]::TEXT[]`);
/** Igual ignorando acento, maiúscula e espaço sobrando. */
const chave = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
function unidade(v: string | null): string | null {
  const s = (v ?? "").trim().toLowerCase();
  return s === "g" ? "g" : s === "ml" ? "mL" : s === "un" ? "un" : null;
}
const sem = (s: string | null, max: number) => (s === null ? null : s.slice(0, max));

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(arquivo);

  // --- Insumos ---------------------------------------------------------------
  type Insumo = { codigo: string; codCompras: string | null; nome: string; categoria: string | null; unCompra: string | null; preco: number | null; qtd: number; unUso: string; fc: number; obs: string | null };
  const insumos: Insumo[] = [];
  const banco = wb.getWorksheet("Banco de Insumos")!;
  banco.eachRow((row, n) => {
    if (n < 4) return;
    const codigo = texto(row.getCell(1).value);
    const nome = texto(row.getCell(3).value);
    if (!codigo || !nome) return;
    insumos.push({
      codigo,
      codCompras: texto(row.getCell(2).value),
      nome,
      categoria: texto(row.getCell(4).value),
      unCompra: texto(row.getCell(5).value),
      preco: numero(row.getCell(6).value),
      qtd: numero(row.getCell(7).value) ?? 1,
      unUso: unidade(texto(row.getCell(8).value)) ?? "g",
      fc: numero(row.getCell(9).value) ?? 1,
      obs: texto(row.getCell(12).value),
    });
  });
  const insumoPorNome = new Map<string, Insumo>();
  for (const i of insumos) if (!insumoPorNome.has(chave(i.nome))) insumoPorNome.set(chave(i.nome), i);

  // --- Forno, conferida, eventos --------------------------------------------
  const forno = new Map<string, { viabilidade: string | null; modo: string | null; temp: string | null; umidade: string | null; tempo: string | null; sonda: string | null; ajuste: string | null }>();
  const tracoVazio = (s: string | null) => (s === null || s === "—" || s === "-" ? null : s);
  // "180", "200 → 180", "200-210": só números, faixa ou seta ganham o °C que a planilha deixou implícito.
  const emGraus = (s: string | null) => (s !== null && /^[\d\s,.\-–→a]+$/.test(s) ? `${s} °C` : s);
  // A umidade às vezes veio como fração (1 = 100%, 0,3 = 30%).
  const emPorcento = (v: Celula) => {
    const x = valor(v);
    if (typeof x === "number") return `${Math.round(x <= 1 ? x * 100 : x)}%`;
    return tracoVazio(texto(v));
  };
  wb.getWorksheet("Forno Combinado")!.eachRow((row, n) => {
    if (n < 5) return;
    const cod = texto(row.getCell(1).value);
    if (!cod) return;
    forno.set(cod, {
      viabilidade: tracoVazio(texto(row.getCell(5).value)),
      modo: tracoVazio(texto(row.getCell(6).value)),
      temp: emGraus(tracoVazio(texto(row.getCell(7).value))),
      umidade: emPorcento(row.getCell(8).value),
      tempo: tracoVazio(texto(row.getCell(9).value)),
      sonda: emGraus(tracoVazio(texto(row.getCell(10).value))),
      ajuste: tracoVazio(texto(row.getCell(11).value)),
    });
  });
  const conferidas = new Set<string>();
  wb.getWorksheet("Lista de Receitas")!.eachRow((row, n) => {
    if (n < 4) return;
    const cod = texto(row.getCell(1).value);
    if (cod && texto(row.getCell(9).value) === "☑") conferidas.add(cod);
  });
  // As receitas dos pacotes de eventos, pelo nome (o link interno da planilha não é lido pelo exceljs).
  const nomesDeEventos = new Set<string>();
  wb.getWorksheet("EVENTOS Cardápio Buffet")!.eachRow((row, n) => {
    if (n < 2) return;
    const nome = texto(row.getCell(3).value);
    if (nome) nomesDeEventos.add(chave(nome));
  });

  // --- Fichas ---------------------------------------------------------------
  type Linha = { nome: string; qtd: number; un: string | null; preparo: string | null; insumo: string | null; sub: string | null };
  type Ficha = {
    codigo: string;
    nome: string;
    categoria: string;
    tipo: "PRONTA" | "PRE_PREPARO";
    porcoes: number;
    rendimento: number | null;
    unRend: string;
    tempo: string | null;
    armazenamento: string | null;
    passos: string[];
    obs: string | null;
    linhas: Linha[];
  };
  const fichas: Ficha[] = [];
  for (const ws of wb.worksheets) {
    const m = /^(\d{3}[A-Z]) - /.exec(ws.name);
    if (!m) continue;
    const codigo = m[1];
    const nome = texto(ws.getCell("A2").value) ?? ws.name.slice(6);
    const c = (r: number, col: number) => ws.getCell(r, col).value;
    const linhas: Linha[] = [];
    let r = 17;
    for (; r < 80; r++) {
      const a = texto(c(r, 1));
      if (a && /^MODO DE PREPARO/i.test(a)) break;
      if (!a) continue;
      const qtd = numero(c(r, 2));
      if (qtd === null) continue;
      const d = texto(c(r, 4));
      const ver = d ? /ver ficha (\d{3}[A-Z])/i.exec(d) : null;
      const insumo = ver ? null : (insumoPorNome.get(chave(a))?.codigo ?? null);
      linhas.push({ nome: a, qtd, un: unidade(texto(c(r, 3))), preparo: ver ? null : d, insumo, sub: ver ? ver[1].toUpperCase() : null });
    }
    const passos: string[] = [];
    for (r = r + 1; r < 90; r++) {
      const a = texto(c(r, 1));
      if (a && /^OBSERVA/i.test(a)) break;
      // Algumas fichas juntaram vários passos numa célula ("1. Junte… 2. Misture…"): um por item.
      if (a) passos.push(...a.split(/\s+(?=\d+\.\s)/).map((x) => x.replace(/^\d+\s*[.)]\s*/, "").trim()).filter(Boolean));
    }
    const obs: string[] = [];
    const fimDasObs = r + 10;
    for (r = r + 1; r < fimDasObs; r++) {
      const a = texto(c(r, 1));
      if (a) obs.push(a);
    }
    fichas.push({
      codigo,
      nome,
      categoria: texto(c(1, 10)) ?? texto(c(1, 4)) ?? "Acompanhamento",
      tipo: /pr[ée]-?preparo/i.test(texto(c(2, 10)) ?? "") ? "PRE_PREPARO" : "PRONTA",
      porcoes: Math.max(1, Math.round(numero(c(3, 10)) ?? 1)),
      rendimento: numero(c(4, 10)),
      unRend: unidade(texto(c(5, 10))) ?? "g",
      tempo: texto(c(6, 10)),
      armazenamento: texto(c(7, 10)),
      passos,
      obs: obs.length ? obs.join("\n") : null,
      linhas,
    });
  }

  // O pré-preparo citado pelo nome (sem "ver ficha") e que não é insumo: procura a ficha.
  const fichaPorNome = new Map(fichas.map((f) => [chave(f.nome), f.codigo]));
  const codigos = new Set(fichas.map((f) => f.codigo));
  const deEventos = new Set(fichas.filter((f) => nomesDeEventos.has(chave(f.nome))).map((f) => f.codigo));
  let livres = 0;
  for (const f of fichas) {
    for (const l of f.linhas) {
      if (l.sub && !codigos.has(l.sub)) l.sub = null;
      if (!l.insumo && !l.sub) {
        const semBase = chave(l.nome.replace(/\(base\)/i, ""));
        l.sub = fichaPorNome.get(chave(l.nome)) ?? fichaPorNome.get(semBase) ?? null;
      }
      if (l.sub && l.un === null) l.un = fichas.find((x) => x.codigo === l.sub)?.unRend ?? "g";
      if (!l.insumo && !l.sub) livres++;
    }
  }

  // --- SQL ---------------------------------------------------------------------
  const out: string[] = [];
  out.push("-- Dados do Receituário, gerados por scripts/gerar-importacao-receituario.ts.");
  out.push('INSERT INTO "receituario_config" ("id", "metaFoodCost", "markup") VALUES (1, 0.30, 3);');

  out.push(
    `INSERT INTO "receituario_insumos" ("codigo", "nome", "categoria", "unidadeUso", "produtoId", "unidadeCompra", "precoCompra", "qtdPorUnidade", "rendimento", "estimado", "observacao", "updatedAt")\nSELECT v.codigo, v.nome, v.categoria, v.un, p."id", v.uncompra, v.preco, v.qtd, v.fc, v.estimado, v.obs, CURRENT_TIMESTAMP\nFROM (VALUES\n` +
      insumos
        .map(
          (i) =>
            `  (${sql(i.codigo)}, ${sql(sem(i.nome, 120))}, ${sql(sem(i.categoria, 60))}, ${sql(i.unUso)}, ${sql(i.codCompras)}, ${sql(sem(i.unCompra, 20))}, ${num(i.preco)}::DECIMAL, ${num(i.qtd)}::DECIMAL, ${num(Math.min(1, Math.max(0.01, i.fc)))}::DECIMAL, ${i.obs ? /PREMISSA|ESTIMATIVA/i.test(i.obs) : false}, ${sql(i.obs)})`,
        )
        .join(",\n") +
      `\n) AS v(codigo, nome, categoria, un, codcompras, uncompra, preco, qtd, fc, estimado, obs)\nLEFT JOIN "products" p ON p."code" = v.codcompras;`,
  );

  out.push(
    `INSERT INTO "receituario_fichas" ("codigo", "nome", "categoria", "tipo", "operacoes", "porcoes", "rendimentoTotal", "unidadeRendimento", "tempoPreparo", "passos", "observacoes", "armazenamento", "viabilidade", "modoForno", "temperatura", "umidade", "tempoForno", "sonda", "ajusteForno", "conferida", "updatedAt") VALUES\n` +
      fichas
        .map((f) => {
          const fo = forno.get(f.codigo);
          const ops = deEventos.has(f.codigo) ? ["EVENTOS"] : [];
          return `  (${sql(f.codigo)}, ${sql(sem(f.nome, 120))}, ${sql(sem(f.categoria, 40))}, '${f.tipo}', ${lista(ops)}, ${f.porcoes}, ${num(f.rendimento)}, ${sql(f.unRend)}, ${sql(sem(f.tempo, 40))}, ${lista(f.passos)}, ${sql(f.obs)}, ${sql(f.armazenamento)}, ${sql(sem(fo?.viabilidade ?? null, 40))}, ${sql(sem(fo?.modo ?? null, 60))}, ${sql(sem(fo?.temp ?? null, 30))}, ${sql(sem(fo?.umidade ?? null, 30))}, ${sql(sem(fo?.tempo ?? null, 40))}, ${sql(sem(fo?.sonda ?? null, 20))}, ${sql(fo?.ajuste ?? null)}, ${conferidas.has(f.codigo)}, CURRENT_TIMESTAMP)`;
        })
        .join(",\n") +
      ";",
  );

  const linhasSql: string[] = [];
  for (const f of fichas) {
    f.linhas.forEach((l, i) => {
      linhasSql.push(`  (${sql(f.codigo)}, ${i + 1}, ${sql(l.insumo)}, ${sql(l.sub)}, ${l.insumo || l.sub ? "NULL" : sql(sem(l.nome, 120))}, ${num(l.qtd)}::DECIMAL, ${sql(l.un)}, ${sql(sem(l.preparo, 160))})`);
    });
  }
  out.push(
    `INSERT INTO "receituario_ingredientes" ("fichaId", "ordem", "insumoId", "subFichaId", "nomeLivre", "quantidade", "unidade", "preparo")\nSELECT f."id", v.ordem, i."id", s."id", v.livre, v.qtd, v.un, v.preparo\nFROM (VALUES\n` +
      linhasSql.join(",\n") +
      `\n) AS v(ficha, ordem, insumo, sub, livre, qtd, un, preparo)\nJOIN "receituario_fichas" f ON f."codigo" = v.ficha\nLEFT JOIN "receituario_insumos" i ON i."codigo" = v.insumo\nLEFT JOIN "receituario_fichas" s ON s."codigo" = v.sub;`,
  );

  console.log(out.join("\n\n"));
  console.error(
    `insumos ${insumos.length} · fichas ${fichas.length} · linhas ${linhasSql.length} (${livres} livres) · forno ${forno.size} · conferidas ${conferidas.size} · eventos ${deEventos.size}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
