import "dotenv/config";
import { createInterface } from "node:readline/promises";

import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client";

/**
 * Troca a senha do admin no SEU terminal, sem passar pelo chat.
 * A senha nunca é impressa de volta na tela nem gravada em texto puro.
 *
 * Uso:  npx tsx scripts/set-admin-password.ts
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const username = (await rl.question("Usuário [admin]: ")).trim() || "admin";
  const password = await rl.question("Nova senha: ");
  rl.close();

  if (password.length < 8) {
    console.error("A senha precisa ter pelo menos 8 caracteres. Nada foi alterado.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.adminUser.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });

  console.log(`\nSenha atualizada para "${user.username}".`);
}

main()
  .catch((e) => {
    console.error("Falhou:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
