import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Prisma 7 exige um driver adapter no runtime. Usamos o adapter `pg`: funciona
// tanto com o Postgres local de desenvolvimento quanto com o endpoint pooled do
// Neon em produção, sem shim de WebSocket.
//
// DATABASE_URL deve apontar para a connection string COM pooler em produção —
// migrations usam DIRECT_URL (ver prisma7.config.ts).

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não definida. Copie .env.example para .env (dev) ou configure a variável na Vercel (produção).",
  );
}

function createPrismaClient() {
  return new PrismaClient({
    // Conexão parada fica aberta por um minuto, e não os 10 s do padrão do
    // `pg`: no celular, entre um toque e outro passa mais que isso, e cada
    // volta pagava a reconexão inteira com o banco.
    adapter: new PrismaPg({ connectionString, idleTimeoutMillis: 60_000 }),
    // `PRISMA_LOG=query` mostra cada consulta no terminal: é como se mede
    // quantas idas ao banco uma tela faz.
    log:
      process.env.PRISMA_LOG === "query"
        ? ["query", "warn", "error"]
        : process.env.NODE_ENV === "development"
          ? ["warn", "error"]
          : ["error"],
  });
}

// Em desenvolvimento o hot-reload do Next recria os módulos a cada alteração.
// Sem o cache global, cada reload abriria um novo pool de conexões até estourar
// o limite do Postgres.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
