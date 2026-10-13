import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

/**
 * Confere o padrão das telas (.claude/skills/padrao-das-telas) no código, sem
 * banco e sem abrir navegador. Lê cada .tsx de app/ e components/ como árvore
 * do TypeScript, e não como texto: assim um comentário que fala de
 * `confirm()` ou usa travessão não conta, só o que vira tela.
 *
 * Três regras:
 *  - confirm: nenhuma chamada a `confirm()` ou `window.confirm()`. A pergunta
 *    vai na linha, com ConfirmarNaLinha.
 *  - travessão: nenhum "—" como pontuação em texto que aparece na tela
 *    (texto de JSX, atributos como placeholder e title, e textos entre
 *    chaves no JSX). O "—" sozinho, de campo sem valor, pode.
 *  - acoes: nenhum `<Button>` nas `acoes` do CabecalhoDaPagina. As ações
 *    descem para os quadrados.
 *
 * O código antigo ainda tem casos. Eles ficam contados por arquivo em
 * scripts/padrao-das-telas-base.json, e a regra é de catraca: um arquivo não
 * pode passar da conta que tem, e arquivo novo começa do zero. Quando uma
 * tela é arrumada e a conta cai, a base precisa ser atualizada junto, para a
 * folga não ficar sobrando:
 *
 *   npx tsx scripts/test-padrao-das-telas.ts --atualizar
 */

type Regra = "confirm" | "travessao" | "acoes";
type Contagem = Record<Regra, Record<string, number>>;

const RAIZ = join(__dirname, "..");
const PASTAS = ["app", "components"];
const BASE = join(__dirname, "padrao-das-telas-base.json");
const TRAVESSAO = "—";

function arquivos(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((e) => {
    const caminho = join(pasta, e.name);
    if (e.isDirectory()) return arquivos(caminho);
    return e.name.endsWith(".tsx") ? [caminho] : [];
  });
}

/** Está dentro de JSX (filho de um elemento, de um atributo ou de chaves)? */
function dentroDeJsx(no: ts.Node): boolean {
  for (let p = no.parent; p; p = p.parent) {
    if (ts.isJsxExpression(p) || ts.isJsxAttribute(p)) return true;
    // Uma função dentro do JSX (um onClick) já é código, não texto da tela.
    if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}

function nomeDaTag(no: ts.JsxOpeningLikeElement) {
  return no.tagName.getText();
}

function contar(caminho: string, conta: Contagem) {
  const texto = readFileSync(caminho, "utf8");
  const arquivo = ts.createSourceFile(caminho, texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const nome = relative(RAIZ, caminho).split("\\").join("/");
  const somar = (regra: Regra) => (conta[regra][nome] = (conta[regra][nome] ?? 0) + 1);

  const visitar = (no: ts.Node) => {
    // confirm() e window.confirm()
    if (ts.isCallExpression(no)) {
      const f = no.expression;
      const ehConfirm =
        (ts.isIdentifier(f) && f.text === "confirm") ||
        (ts.isPropertyAccessExpression(f) && f.name.text === "confirm" && f.expression.getText() === "window");
      if (ehConfirm) somar("confirm");
    }

    // Travessão no texto que vira tela. O "—" sozinho, que marca campo sem
    // valor numa tabela ("Mínimo: —"), não é pontuação e fica de fora.
    const pontuacao = (t: string) => t.includes(TRAVESSAO) && t.trim() !== TRAVESSAO;
    if (ts.isJsxText(no) && pontuacao(no.text)) somar("travessao");
    if (
      (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no) || ts.isTemplateHead(no) || ts.isTemplateMiddle(no) || ts.isTemplateTail(no)) &&
      pontuacao(no.text) &&
      dentroDeJsx(no)
    ) {
      somar("travessao");
    }

    // <Button> nas ações do topo.
    if (ts.isJsxOpeningElement(no) || ts.isJsxSelfClosingElement(no)) {
      if (nomeDaTag(no) === "CabecalhoDaPagina") {
        for (const attr of no.attributes.properties) {
          if (!ts.isJsxAttribute(attr) || attr.name.getText() !== "acoes" || !attr.initializer) continue;
          const procurar = (n: ts.Node) => {
            if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && nomeDaTag(n) === "Button") somar("acoes");
            ts.forEachChild(n, procurar);
          };
          procurar(attr.initializer);
        }
      }
    }

    ts.forEachChild(no, visitar);
  };
  visitar(arquivo);
}

const conta: Contagem = { confirm: {}, travessao: {}, acoes: {} };
for (const pasta of PASTAS) for (const caminho of arquivos(join(RAIZ, pasta))) contar(caminho, conta);

const ordenada = (r: Record<string, number>) =>
  Object.fromEntries(Object.entries(r).sort(([a], [b]) => a.localeCompare(b)));

if (process.argv.includes("--atualizar")) {
  const nova = { confirm: ordenada(conta.confirm), travessao: ordenada(conta.travessao), acoes: ordenada(conta.acoes) };
  writeFileSync(BASE, JSON.stringify(nova, null, 2) + "\n");
  for (const regra of Object.keys(nova) as Regra[]) {
    const total = Object.values(nova[regra]).reduce((s, n) => s + n, 0);
    console.log(`base de ${regra}: ${total} em ${Object.keys(nova[regra]).length} arquivos`);
  }
  process.exit(0);
}

const base: Contagem = JSON.parse(readFileSync(BASE, "utf8"));
const COMO: Record<Regra, string> = {
  confirm: "use ConfirmarNaLinha (components/confirmar-na-linha.tsx) no lugar de confirm()",
  travessao: "troque o travessão por dois-pontos, vírgula ou ponto",
  acoes: "tire o <Button> das acoes do CabecalhoDaPagina e use quadrados (BotaoQuadrado)",
};

let falhas = 0;
for (const regra of Object.keys(COMO) as Regra[]) {
  const nomes = new Set([...Object.keys(conta[regra]), ...Object.keys(base[regra] ?? {})]);
  for (const nome of [...nomes].sort()) {
    const agora = conta[regra][nome] ?? 0;
    const antes = base[regra]?.[nome] ?? 0;
    if (agora > antes) {
      falhas++;
      console.log(`ERRO ${regra}: ${nome} tem ${agora} (a base permite ${antes}). ${COMO[regra]}.`);
    } else if (agora < antes) {
      falhas++;
      console.log(
        `ERRO ${regra}: ${nome} caiu de ${antes} para ${agora}. Bom! Atualize a base: npx tsx scripts/test-padrao-das-telas.ts --atualizar`,
      );
    }
  }
  const total = Object.values(conta[regra]).reduce((s, n) => s + n, 0);
  if (falhas === 0) console.log(`ok  ${regra}: ${total} casos antigos na base, nenhum novo`);
}

if (falhas > 0) {
  console.log(`\n${falhas} problema(s) no padrão das telas.`);
  process.exit(1);
}
