import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { can, getCurrentUser } from "@/lib/permissions";
import { papelNaTarefa } from "@/lib/tarefas-acesso";

export const dynamic = "force-dynamic";

/**
 * Abre um anexo de tarefa. Foto e PDF abrem no navegador.
 *
 * Quem abre precisa enxergar a tarefa: anexo de quadro privado é tão privado
 * quanto o quadro, e o endereço do anexo não pode ser o atalho para dentro
 * dele. `nosniff` impede o navegador de adivinhar outro tipo: o que sai é o
 * tipo conferido na entrada.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/tarefas/anexos/[id]">,
) {
  const user = await getCurrentUser();
  if (!user || !can(user, "tarefas")) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Anexo inválido." }, { status: 400 });
  }

  const anexo = await prisma.anexoTarefa.findUnique({
    where: { id },
    select: { tarefaId: true, nome: true, mime: true, dados: true },
  });
  if (!anexo) return NextResponse.json({ error: "Esse anexo não existe mais." }, { status: 404 });

  const acesso = await papelNaTarefa(user, anexo.tarefaId);
  if (!acesso || !acesso.podeVer) {
    return NextResponse.json({ error: "Esse anexo não existe mais." }, { status: 404 });
  }

  const modo = anexo.mime === "application/pdf" || anexo.mime.startsWith("image/") ? "inline" : "attachment";
  const ascii = anexo.nome.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "");
  return new Response(new Uint8Array(anexo.dados) as BodyInit, {
    headers: {
      "Content-Type": anexo.mime,
      "Content-Disposition": `${modo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(anexo.nome)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
