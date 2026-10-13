import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validations";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: {},
        password: {},
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { username, password } = parsed.data;

        const user = await prisma.adminUser.findUnique({ where: { username } });

        // Comparação executada mesmo sem usuário encontrado: um retorno
        // imediato aqui revelaria, pelo tempo de resposta, quais usuários
        // existem.
        const hash =
          user?.passwordHash ??
          "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin";
        const valid = await bcrypt.compare(password, hash);

        if (!user || !valid) return null;

        // Depois da comparação, não antes: sair mais cedo revelaria pelo
        // tempo de resposta quais contas existem e estão ativas.
        if (!user.isActive) return null;

        await prisma.adminUser.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return { id: String(user.id), name: user.username };
      },
    }),
  ],
});
