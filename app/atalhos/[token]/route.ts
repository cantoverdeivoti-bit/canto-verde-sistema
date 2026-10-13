import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { COOKIE_ATALHO } from "@/lib/permissions";
import { atalhoVencido } from "@/lib/roles";

/**
 * A porta do link de atalhos: /atalhos/<código>.
 *
 * Código certo grava o cookie que `getCurrentUser` lê e manda para a página
 * dos atalhos; errado (trocado, desligado, digitado mal) manda para a mesma
 * página, que diz que o link não vale mais. O cookie guarda o próprio código:
 * trocar o link no painel invalida quem já tinha entrado, no clique seguinte.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const destino = new URL("/atalhos", request.url);

  const config = /^[0-9a-f]{64}$/.test(token)
    ? await prisma.cotacaoSettings.findFirst({ where: { id: 1, atalhoToken: token }, select: { atalhoCriadoEm: true } })
    : null;
  // Vencido (trinta dias) vale o mesmo que trocado: a página diz que não vale mais.
  const valido = config !== null && !atalhoVencido(config.atalhoCriadoEm);

  if (!valido) {
    destino.searchParams.set("invalido", "1");
    return NextResponse.redirect(destino);
  }

  const resposta = NextResponse.redirect(destino);
  resposta.cookies.set(COOKIE_ATALHO, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Doze horas: cobre o dia de trabalho. Abrir o link de novo renova.
    maxAge: 60 * 60 * 12,
  });
  return resposta;
}
