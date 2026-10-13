import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { can, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Abre um anexo. PDF e foto abrem no navegador; XML é baixado, porque aberto
 * ali ele seria lido como página. `nosniff` impede o navegador de adivinhar
 * outro tipo: o que sai é o tipo conferido na entrada.
 */
export async function GET(_request: Request, { params }: RouteContext<"/admin/financeiro/anexos/[id]">) {
  const user = await getCurrentUser();
  if (!can(user, "financeiro")) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Anexo inválido." }, { status: 400 });
  const a = await prisma.anexoFinanceiro.findUnique({ where: { id }, select: { nome: true, mime: true, dados: true } });
  if (!a) return NextResponse.json({ error: "Esse anexo não existe mais." }, { status: 404 });

  const modo = a.mime === "application/pdf" || a.mime.startsWith("image/") ? "inline" : "attachment";
  const ascii = a.nome.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "");
  return new Response(new Uint8Array(a.dados) as BodyInit, {
    headers: {
      "Content-Type": a.mime,
      "Content-Disposition": `${modo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(a.nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
