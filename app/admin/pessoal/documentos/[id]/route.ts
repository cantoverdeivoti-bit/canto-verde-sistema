import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { can, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Abre o arquivo de um documento da admissão. Só quem configura o Departamento pessoal. */
export async function GET(_request: Request, { params }: RouteContext<"/admin/pessoal/documentos/[id]">) {
  const user = await getCurrentUser();
  if (!user || !can(user, "pessoal", { configure: true })) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
  const doc = await prisma.documentoDoColaborador.findUnique({ where: { id }, select: { nome: true, mime: true, dados: true } });
  if (!doc?.dados || !doc.mime || !doc.nome) return NextResponse.json({ error: "Esse documento não tem arquivo." }, { status: 404 });
  const ascii = doc.nome.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "");
  return new Response(new Uint8Array(doc.dados) as BodyInit, {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(doc.nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
