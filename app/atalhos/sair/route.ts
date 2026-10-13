import { NextResponse } from "next/server";

import { COOKIE_ATALHO } from "@/lib/permissions";

/**
 * Sair do modo atalhos: apaga o cookie do link e abre o login.
 *
 * Existe porque o dono abriu o link de atalhos no próprio aparelho, a sessão
 * dele venceu, e o cookie do link (12 horas) passou a valer sozinho: toda tela
 * do painel devolvia para os atalhos, e nada levava ao login. Daqui ele entra
 * com a senha e volta ao painel inteiro.
 *
 * Rota estática: tem prioridade sobre `/atalhos/[token]`, então "sair" nunca é
 * lido como código de link.
 */
export function GET(request: Request) {
  const resposta = NextResponse.redirect(new URL("/admin/login", request.url));
  resposta.cookies.set(COOKIE_ATALHO, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return resposta;
}
