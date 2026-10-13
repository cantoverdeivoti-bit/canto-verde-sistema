import { NextResponse } from "next/server";

import { todayInTimezone } from "@/lib/availability";
import { planilhaDaDre } from "@/lib/financeiro-planilhas";
import { FUSO_DA_CASA } from "@/lib/format";
import { can, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * A DRE em xlsx, no mesmo recorte da tela (`?mes=` e `?centro=`).
 *
 * A guarda é explícita porque manipulador de rota não passa pelo layout do
 * módulo (o mesmo cuidado de `/admin/compras/exportar`).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user, "financeiro")) return NextResponse.json({ error: "Não autorizado." }, { status: 403 });

  const busca = new URL(request.url).searchParams;
  const pedido = busca.get("mes") ?? "";
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : todayInTimezone(FUSO_DA_CASA).slice(0, 7);
  // Sem `centro`, a casa toda; `sem`, o que ficou sem centro.
  const c = busca.get("centro");
  const centro = c === "sem" ? null : c && /^\d+$/.test(c) ? Number(c) : undefined;

  const { nome, bytes } = await planilhaDaDre(mes, centro);
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
