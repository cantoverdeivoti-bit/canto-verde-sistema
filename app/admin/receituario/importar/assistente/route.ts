import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { can, getCurrentUser } from "@/lib/permissions";
import { documentoDoAssistente } from "@/lib/receituario-padrao";

export const dynamic = "force-dynamic";

/**
 * O documento para montar o assistente na IA (o Gem do Gemini): as
 * instruções, o padrão da ficha e a lista de insumos de hoje. Montado na
 * hora, porque o cadastro de insumos muda; baixar de novo atualiza o Gem.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!can(user, "receituario", { configure: true })) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }
  const insumos = await prisma.insumoReceita.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { nome: true, unidadeUso: true } });
  return new NextResponse(documentoDoAssistente(insumos), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="assistente-fichas-ponto07.md"',
      "Cache-Control": "no-store",
    },
  });
}
