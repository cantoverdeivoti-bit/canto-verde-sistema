/**
 * Capturas das telas no celular e no computador, para conferir o padrão das
 * telas (.claude/skills/padrao-das-telas) antes de entregar.
 *
 *   node scripts/capturas.mjs /admin/compras /admin/compras/fornecedores
 *
 * Para cada endereço, tira uma foto da página inteira em 390 px (celular) e
 * em 1280 px (computador), e salva em capturas/ (fora do git). Além da foto,
 * confere sozinho duas coisas que já passaram despercebidas:
 *  - a página não pode rolar para o lado (algo saiu da tela);
 *  - o navegador não pode dar erro de JavaScript.
 * Se alguma falhar, o script termina com erro e diz onde.
 *
 * Configuração, por variável de ambiente:
 *  - CAPTURAS_URL: onde o sistema está rodando (padrão http://localhost:3000);
 *  - CAPTURAS_USUARIO e CAPTURAS_SENHA: login do admin. Sem eles, não loga,
 *    e só as páginas públicas aparecem de verdade;
 *  - CAPTURAS_LARGURAS: troca as larguras (padrão "390,1280");
 *  - CHROMIUM_PATH: o Chromium a usar, quando não é o do próprio Playwright.
 *
 * O Playwright não é dependência do projeto (o build e a checagem não
 * precisam dele). Para instalar só na máquina:
 *   npm i --no-save playwright && npx playwright install chromium
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Falta o Playwright. Instale só na máquina:\n  npm i --no-save playwright && npx playwright install chromium");
  process.exit(2);
}

const rotas = process.argv.slice(2);
if (rotas.length === 0) {
  console.error("Diga quais telas: node scripts/capturas.mjs /admin/compras /admin/receituario/insumos");
  process.exit(2);
}

const URL_BASE = (process.env.CAPTURAS_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LARGURAS = (process.env.CAPTURAS_LARGURAS ?? "390,1280").split(",").map(Number);
const PASTA = join("capturas", new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"));
mkdirSync(PASTA, { recursive: true });

const navegador = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let problemas = 0;

for (const largura of LARGURAS) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 844 }, deviceScaleFactor: 1.5 });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(e.message));

  if (process.env.CAPTURAS_USUARIO && process.env.CAPTURAS_SENHA) {
    await pagina.goto(`${URL_BASE}/admin/login`);
    await pagina.fill('input[name="username"]', process.env.CAPTURAS_USUARIO);
    await pagina.fill('input[name="password"]', process.env.CAPTURAS_SENHA);
    await pagina.click('button[type="submit"]');
    await pagina.waitForURL((u) => !u.pathname.includes("login"), { timeout: 15000 });
  }

  for (const rota of rotas) {
    erros.length = 0;
    await pagina.goto(URL_BASE + rota, { waitUntil: "networkidle" });
    const nome = `${rota.replace(/^\//, "").replace(/[/?=&]/g, "_") || "inicio"}-${largura}.png`;
    await pagina.screenshot({ path: join(PASTA, nome), fullPage: true });

    // Rolar para o lado é sinal de algo largo demais para a tela.
    const sobra = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const avisos = [];
    if (sobra > 1) avisos.push(`sai ${sobra}px da tela para o lado`);
    if (erros.length) avisos.push(`erro no navegador: ${erros.join(" | ")}`);
    if (avisos.length) problemas++;
    console.log(`${avisos.length ? "ERRO" : "ok  "} ${largura}px ${rota}${avisos.length ? `: ${avisos.join("; ")}` : ""}`);
  }
  await contexto.close();
}

await navegador.close();
console.log(`\nCapturas em ${PASTA}/`);
if (problemas) {
  console.log(`${problemas} tela(s) com problema.`);
  process.exit(1);
}
