// Quanto cada tela do painel leva no servidor, e quantas consultas faz.
//
//   MEDIR_USUARIO=... MEDIR_SENHA=... node scripts/desempenho/medir.mjs http://localhost:3000 caminho/do/log
//
// O app precisa estar rodando com `next start` (não `next dev`) e
// PRISMA_LOG=query, com a saída indo para o log passado aqui. Com o banco
// atrasado por `atraso.mjs`, o tempo dividido pelo atraso de ida e volta dá
// quantas idas ao banco a tela faz uma depois da outra: é isso que pesa
// quando o banco está longe, e não o número de consultas.
import { readFileSync, statSync } from "node:fs";
import { chromium } from "playwright";

const [, , BASE, LOG] = process.argv;
const { MEDIR_USUARIO, MEDIR_SENHA, PW_CHROMIUM } = process.env;
if (!BASE || !LOG || !MEDIR_USUARIO || !MEDIR_SENHA) {
  console.error("uso: MEDIR_USUARIO=... MEDIR_SENHA=... node scripts/desempenho/medir.mjs <url-do-app> <log-do-app>");
  process.exit(1);
}
const PAGINAS = [
  "/admin", "/admin/comercial", "/admin/compras/pendencias", "/admin/compras", "/admin/compras/contagem", "/admin/compras/listas",
  "/admin/compras/pedidos", "/admin/compras/recebimentos", "/admin/compras/cotacao", "/admin/pessoal", "/admin/eventos", "/admin/tarefas",
  "/admin/financeiro", "/admin/financeiro/dre", "/admin/financeiro/pagar", "/admin/buffet", "/admin/buffet/cardapio", "/admin/buffet/pratos",
  "/admin/buffet/producao", "/admin/buffet/forno", "/admin/buffet/sugestoes",
];

const navegador = await chromium.launch(PW_CHROMIUM ? { executablePath: PW_CHROMIUM } : {});
const contexto = await navegador.newContext();
const pagina = await contexto.newPage();
await pagina.goto(`${BASE}/admin/login`);
await pagina.fill('input[name="username"]', MEDIR_USUARIO);
await pagina.fill('input[name="password"]', MEDIR_SENHA);
await pagina.click('button[type="submit"]');
await pagina.waitForURL((u) => !u.pathname.includes("login"), { timeout: 60_000 });
const cookie = (await contexto.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
await navegador.close();

const consultasDesde = (de) => readFileSync(LOG, "utf8").slice(de).split("\n").filter((l) => l.includes("prisma:query")).length;
const linhas = [];
for (const rota of PAGINAS) {
  await fetch(BASE + rota, { headers: { cookie } }).then((r) => r.text()); // aquece
  const tempos = [];
  let consultas = 0;
  for (let i = 0; i < 3; i++) {
    const de = statSync(LOG).size;
    const t = performance.now();
    const r = await fetch(BASE + rota, { headers: { cookie }, redirect: "manual" });
    await r.text();
    tempos.push(performance.now() - t);
    await new Promise((x) => setTimeout(x, 150));
    consultas = r.status === 200 ? consultasDesde(de) : `status ${r.status}`;
  }
  tempos.sort((a, b) => a - b);
  linhas.push([rota, Math.round(tempos[1]), consultas]);
}
for (const [rota, ms, consultas] of linhas.sort((a, b) => b[1] - a[1]))
  console.log(String(ms).padStart(6), "ms", String(consultas).padStart(4), "consultas ", rota);
