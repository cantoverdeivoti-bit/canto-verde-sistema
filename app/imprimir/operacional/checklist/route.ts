import { NextResponse } from "next/server";

import { getSettings } from "@/lib/availability";
import { checklistEmPdf } from "@/lib/checklist-pdf";
import { chave } from "@/lib/format";
import { folhasDeChecklist } from "@/lib/operacional-dados";
import { can, getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * A folha de checklist em PDF, para baixar: uma folha (`folha`), um
 * departamento (`departamento`) ou todas; `momento` deixa só a abertura ou só
 * o fechamento. Momento vazio não sai, e folha sem nada fica de fora.
 *
 * A guarda é explícita porque manipulador de rota não passa por layout, e o
 * `proxy.ts` só olha /admin.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!can(user, "operacional")) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 403 });
  }

  const q = new URL(request.url).searchParams;
  const numero = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  const m = q.get("momento");
  const momento = m === "ABERTURA" || m === "FECHAMENTO" ? m : null;
  const [{ capacity }, todas] = await Promise.all([
    getSettings(),
    folhasDeChecklist({ folha: numero(q.get("folha")), departamento: numero(q.get("departamento")) }),
  ]);
  const folhas = todas
    .map((l) => ({ ...l, momentos: l.momentos.filter((x) => (momento === null || x.chave === momento) && x.tarefas.length > 0) }))
    .filter((l) => l.momentos.length > 0);

  const pdf = await checklistEmPdf(folhas, capacity.name);
  // "checklist-cozinha-geral.pdf"; o do departamento leva o nome dele, e o de todas, "checklists.pdf".
  const parte = q.has("folha") ? folhas[0]?.titulo : q.has("departamento") ? folhas[0]?.departamento.nome : null;
  const nome = parte ? `checklist-${chave(parte).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}` : "checklists";
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
