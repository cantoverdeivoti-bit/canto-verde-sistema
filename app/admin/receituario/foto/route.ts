import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { detectarTipo, TETO_DO_ANEXO } from "@/lib/anexos";
import { prisma } from "@/lib/db";
import { can, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * A foto do prato pronto de uma ficha, com a miniatura que o navegador já
 * gerou. Rota, e não ação de servidor, porque a ação aceita até 1 MB. Só
 * quem configura o Receituário troca a foto; mandar de novo substitui.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !can(user, "receituario", { configure: true })) {
    return NextResponse.json({ ok: false, message: "Não autorizado." }, { status: 403 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Foto grande demais ou envio interrompido. Tente de novo." }, { status: 400 });
  }
  const fichaId = Number(form.get("fichaId"));
  const arquivo = form.get("arquivo");
  const mini = form.get("miniatura");
  if (!Number.isInteger(fichaId) || fichaId <= 0 || !(arquivo instanceof File) || arquivo.size === 0) {
    return NextResponse.json({ ok: false, message: "Escolha uma foto." }, { status: 400 });
  }
  if (arquivo.size > TETO_DO_ANEXO) {
    return NextResponse.json({ ok: false, message: "A foto passa de 4 MB." }, { status: 413 });
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const tipo = detectarTipo(bytes);
  if (!tipo || !tipo.mime.startsWith("image/")) {
    return NextResponse.json({ ok: false, message: "Só foto (JPG, PNG ou WEBP)." }, { status: 415 });
  }
  let miniatura: Uint8Array<ArrayBuffer> | null = null;
  if (mini instanceof File && mini.size > 0 && mini.size < 300_000) {
    const b = new Uint8Array(await mini.arrayBuffer());
    if (detectarTipo(b)?.mime.startsWith("image/")) miniatura = b;
  }
  const ficha = await prisma.fichaTecnica.findUnique({ where: { id: fichaId }, select: { codigo: true } });
  if (!ficha) return NextResponse.json({ ok: false, message: "Essa ficha não existe mais." }, { status: 404 });
  const dados = { mime: tipo.mime, tamanho: bytes.length, dados: bytes, miniatura };
  await prisma.fotoDaFicha.upsert({ where: { fichaId }, create: { fichaId, ...dados }, update: dados });
  revalidatePath("/admin/receituario", "layout");
  return NextResponse.json({ ok: true });
}
