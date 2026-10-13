import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations usam a conexão DIRETA (sem pooler). Em produção no Neon, a
    // connection string com `-pooler` não aceita comandos de DDL de migration.
    // `||`, e não `??`: uma DIRECT_URL definida mas vazia (o que a Vercel
    // deixa acontecer) tem de cair na DATABASE_URL, e não virar URL vazia.
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
    // Banco descartável onde o Prisma reaplica o histórico para detectar
    // drift. Sem ele, `migrate dev` tenta o replay no próprio banco de
    // desenvolvimento e falha em objetos que já existem. `|| undefined`: a
    // Vercel deixa a variável existir vazia, e o Prisma 7 recusa texto vazio
    // (P1013) até no `migrate deploy`, que nem usa a shadow. Foi isso que parou
    // as publicações de produção depois da PR #40.
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"] || undefined,
  },
});
