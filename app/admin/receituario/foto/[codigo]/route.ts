import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { can, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * A foto de uma ficha pelo código, ou a miniatura com `?mini=1`. Quem vê o
 * Receituário vê a foto. O endereço leva `?v=` com a data da foto, então o
 * navegador pode guardar por um dia: foto nova é endereço novo.
 */
export async function GET(request: Request, { params }: RouteContext<"/admin/receituario/foto/[codigo]">) {
  const user = await getCurrentUser();
  if (!user || !can(user, "receituario")) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  const codigo = decodeURIComponent((await params).codigo).toUpperCase();
  const mini = new URL(request.url).searchParams.get("mini") === "1";
  const foto = await prisma.fotoDaFicha.findFirst({
    where: { ficha: { codigo } },
    select: { mime: true, miniatura: mini, dados: !mini },
  });
  if (!foto) return NextResponse.json({ error: "Essa ficha não tem foto." }, { status: 404 });
  const bytes = mini ? foto.miniatura : foto.dados;
  // Sem miniatura (foto que subiu sem ela), a foto inteira serve.
  if (!bytes && !mini) return NextResponse.json({ error: "Essa ficha não tem foto." }, { status: 404 });
  if (!bytes) return Response.redirect(new URL(`/admin/receituario/foto/${encodeURIComponent(codigo)}`, request.url), 302);
  return new Response(new Uint8Array(bytes) as BodyInit, {
    headers: {
      "Content-Type": mini ? "image/jpeg" : foto.mime,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
