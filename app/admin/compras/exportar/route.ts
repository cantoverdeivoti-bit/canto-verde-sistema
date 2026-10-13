import { NextResponse } from "next/server";

import { can, getCurrentUser } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { UNIT_LABEL, diaDaqui, diaISO } from "@/lib/format";
import { COLUNAS, escreverCSV, escreverNumero } from "@/lib/planilha";

export const dynamic = "force-dynamic";

/**
 * O catálogo em CSV.
 *
 * A guarda é explícita porque manipulador de rota não passa pelo layout do
 * módulo — layout não embrulha route handler. O `proxy.ts` garante que há
 * sessão; a permissão do módulo é conferida aqui. Sem isto, o catálogo inteiro
 * sairia para qualquer pessoa logada, inclusive quem não tem acesso a Compras.
 *
 * Com o cadastro vazio sai só o cabeçalho — e é assim que esta rota também
 * serve de modelo para a importação, sem precisar de um "baixar modelo"
 * separado que envelheceria em paralelo.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!can(user, "compras")) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const produtos = await prisma.product.findMany({
    include: { category: { select: { name: true } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
  });

  const csv = escreverCSV([
    [...COLUNAS],
    ...produtos.map((p) => [
      p.code ?? "",
      p.name,
      // Célula vazia, não a palavra "sem categoria": a planilha volta pela
      // importação, e ali vazio significa exatamente "sem categoria" — um
      // rótulo escrito viraria erro de categoria inexistente na volta.
      p.category?.name ?? "",
      UNIT_LABEL[p.unit],
      escreverNumero(p.currentStock.toNumber()),
      escreverNumero(p.minStock === null ? null : p.minStock.toNumber()),
      escreverNumero(p.idealStock === null ? null : p.idealStock.toNumber()),
      p.isActive ? "Sim" : "Não",
    ]),
  ]);

  const hoje = diaISO(diaDaqui(0));

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="produtos-${hoje}.csv"`,
      // Catálogo muda; nenhum intermediário deve guardar esta resposta.
      "Cache-Control": "no-store",
    },
  });
}
