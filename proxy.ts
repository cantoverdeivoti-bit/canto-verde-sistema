import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

// Convenção `proxy` do Next 16 (antigo `middleware`).
// Protege /admin/** via o callback `authorized` de lib/auth.config.ts, usando
// só a config edge-safe — sem Prisma, sem bcrypt.
export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/admin/:path*"],
};
