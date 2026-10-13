import { NextResponse } from "next/server";

import { todayInTimezone, getSettings } from "@/lib/availability";
import { can, getCurrentUser } from "@/lib/permissions";
import { PERIODOS_DO_RELATORIO, resolverPeriodo } from "@/lib/periodo";
import { gerarRelatorio } from "@/lib/relatorio-envio";

export const dynamic = "force-dynamic";

/**
 * O relatório de compras em PDF, para baixar: `?de=&ate=` (o botão do
 * Painel, com o período da tela) ou `?periodo=` (o botão da configuração).
 *
 * A guarda é explícita porque manipulador de rota não passa pelo layout do
 * módulo; o `proxy.ts` só garante que há sessão.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user, "compras")) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const q = new URL(request.url).searchParams;
  const periodo = q.get("periodo");
  let alvo: { de: string; ate: string } | string;
  if (periodo && PERIODOS_DO_RELATORIO.some((p) => p.chave === periodo)) alvo = periodo;
  else {
    const { capacity } = await getSettings();
    alvo = resolverPeriodo(q.get("de") ?? undefined, q.get("ate") ?? undefined, todayInTimezone(capacity.timezone));
  }

  const { pdf, nomeDoArquivo } = await gerarRelatorio(alvo);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeDoArquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
