import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { detectarTipo, nomeDoAnexo, TETO_DO_ANEXO } from "@/lib/anexos";
import { toDateOnly, todayInTimezone } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { ehDocumento } from "@/lib/documentos-admissao";
import { FUSO_DA_CASA } from "@/lib/format";
import { can, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Sobe a foto ou o PDF de um documento da admissão. Rota, e não ação de
 * servidor, porque a ação aceita até 1 MB e foto de documento passa disso.
 * Só quem configura o Departamento pessoal: documento é dado pessoal, a mesma
 * trava do CPF e do salário. Mandar de novo troca o arquivo.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "pessoal", { configure: true })) {
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 403 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Arquivo grande demais ou envio interrompido. Tente de novo." }, { status: 400 });
  }
  const colaboradorId = Number(form.get("colaboradorId"));
  const tipoDoDocumento = form.get("tipo");
  const arquivo = form.get("arquivo");
  if (!Number.isInteger(colaboradorId) || colaboradorId <= 0 || !ehDocumento(tipoDoDocumento) || !(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ ok: false, message: "Escolha um arquivo." }, { status: 400 });
  }
  if (arquivo.size > TETO_DO_ANEXO) {
    return NextResponse.json({ ok: false, message: "O arquivo passa de 4 MB. Mande uma foto ou um PDF menor." }, { status: 413 });
  }
  if ((await prisma.colaborador.count({ where: { id: colaboradorId } })) === 0) {
    return NextResponse.json({ ok: false, message: "Esse colaborador não existe mais." }, { status: 404 });
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = detectarTipo(bytes);
  if (!tipo || tipo.mime === "application/xml") {
    return NextResponse.json({ ok: false, message: "Só foto (JPG, PNG, WEBP) ou PDF." }, { status: 415 });
  }
  const arquivoNovo = {
    nome: nomeDoAnexo(arquivo.name, tipo),
    mime: tipo.mime,
    tamanho: bytes.length,
    dados: bytes,
    naoSeAplica: false,
    criadoPorId: user.id,
    entregueEm: toDateOnly(todayInTimezone(FUSO_DA_CASA)),
  };
  await prisma.documentoDoColaborador.upsert({
    where: { colaboradorId_tipo: { colaboradorId, tipo: tipoDoDocumento } },
    create: { colaboradorId, tipo: tipoDoDocumento, ...arquivoNovo },
    update: arquivoNovo,
  });
  revalidatePath(`/admin/pessoal/colaboradores/${colaboradorId}`);
  return NextResponse.json({ ok: true });
}
