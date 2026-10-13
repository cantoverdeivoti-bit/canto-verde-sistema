import { NextResponse } from "next/server";

import { can, getCurrentUser } from "@/lib/permissions";
import { textoDoPadrao } from "@/lib/receituario-padrao";

export const dynamic = "force-dynamic";

/** O padrão de receita para entregar à IA, em .md. Guarda explícita: rota não passa pelo layout do módulo. */
export async function GET() {
  const user = await getCurrentUser();
  if (!can(user, "receituario", { configure: true })) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }
  return new NextResponse(textoDoPadrao(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ficha-tecnica-ponto07.md"',
      "Cache-Control": "no-store",
    },
  });
}
