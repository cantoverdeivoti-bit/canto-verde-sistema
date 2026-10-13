// Aplica as migrations pendentes no banco, e SÓ na publicação de produção.
//
// Por que existe: o dono trabalha pelo celular, e a regra antiga ("rode
// `npm run db:migrate` na sua máquina antes do push") travava toda mudança de
// banco até alguém sentar no computador. Agora a Vercel aplica a migration no
// build de produção, antes do `next build`, e o código novo nunca encontra o
// banco sem as tabelas dele.
//
// A trava de VERCEL_ENV é a parte que não pode sair. Todo ramo empurrado ganha
// deploy de prévia, e a prévia enxerga as mesmas variáveis de banco; sem esta
// linha, a migration de um ramo que ninguém aprovou iria para o banco de
// produção. Build local e a sessão na nuvem também não têm VERCEL_ENV, e
// passam direto, sem tocar em banco nenhum.
//
// Se o `migrate deploy` falhar, este script sai com erro e o build para: a
// Vercel mantém no ar a versão anterior, e nada quebra para a equipe. Já
// aconteceu uma vez (commit a9db700, 29/08): o build não alcançava o banco.
// O caminho provável está no README, em "Migrations em produção".

import { spawnSync } from "node:child_process";

const ambiente = process.env.VERCEL_ENV;

if (ambiente !== "production") {
  console.log(`migrations: puladas (VERCEL_ENV=${ambiente ?? "ausente"}, só produção aplica)`);
  process.exit(0);
}

console.log("migrations: aplicando as pendentes no banco de produção");
const r = spawnSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
if (r.status !== 0) {
  console.error("migrations: FALHOU. O build para aqui, e o site continua na versão anterior.");
}
process.exit(r.status ?? 1);
