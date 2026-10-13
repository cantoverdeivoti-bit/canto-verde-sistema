import { NextResponse } from "next/server";

import { detectarTipo, nomeDoAnexo, TETO_DO_ANEXO } from "@/lib/anexos";
import { prisma } from "@/lib/db";
import { can, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Sobe um anexo de um lançamento.
 *
 * Rota, e não ação de servidor: a ação aceita até 1 MB no corpo, e um PDF de
 * boleto escaneado passa disso. A guarda é explícita, como em toda rota do
 * painel: manipulador de rota não passa pelo layout do módulo.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "financeiro")) return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Arquivo grande demais ou envio interrompido. Tente de novo." }, { status: 400 });
  }
  const lancamentoId = Number(form.get("lancamentoId"));
  const arquivo = form.get("arquivo");
  if (!Number.isInteger(lancamentoId) || lancamentoId <= 0 || !(arquivo instanceof File) || arquivo.size === 0)
    return NextResponse.json({ ok: false, message: "Escolha um arquivo." }, { status: 400 });
  if (arquivo.size > TETO_DO_ANEXO)
    return NextResponse.json({ ok: false, message: "O arquivo passa de 4 MB. Mande uma foto ou um PDF menor." }, { status: 413 });

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = detectarTipo(bytes);
  if (!tipo) return NextResponse.json({ ok: false, message: "Só PDF, foto (JPG, PNG, WEBP) ou XML de nota fiscal." }, { status: 415 });
  if ((await prisma.lancamento.count({ where: { id: lancamentoId } })) === 0)
    return NextResponse.json({ ok: false, message: "Esse lançamento não existe mais. Recarregue a página." }, { status: 404 });

  const anexo = await prisma.anexoFinanceiro.create({
    data: { lancamentoId, nome: nomeDoAnexo(arquivo.name, tipo), mime: tipo.mime, tamanho: bytes.length, dados: bytes, criadoPorId: user.id },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: anexo.id });
}
