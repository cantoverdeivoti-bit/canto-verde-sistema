import { NextResponse } from "next/server";

import { getSettings } from "@/lib/availability";
import { avisosDoDia } from "@/lib/avisos-do-dia";
import { recalcularCustosDoBuffet } from "@/lib/receituario-buffet";
import { enviarRelatorioDoDia } from "@/lib/relatorio-envio";

export const dynamic = "force-dynamic";
// Montar o PDF e falar com o Resend cabe com folga, mas não nos 10 s padrão
// num dia de banco lento.
export const maxDuration = 60;

/**
 * O relatório de compras da semana. A Vercel chama todo dia às 11:00 UTC
 * (8h em Ivoti; ver `vercel.json`) e aqui se decide se hoje é o dia
 * escolhido em Compras → Configurações — o plano Hobby só agenda por dia, e
 * o dia da semana é escolha do dono, não do arquivo de configuração.
 *
 * Mesma trava do lembrete de reservas: sem `CRON_SECRET` não roda, e só a
 * Vercel (que manda o segredo no cabeçalho) consegue chamar.
 *
 * Aproveita a mesma chamada da manhã para os avisos do dia (pedidos
 * atrasados e prazos vencidos, `lib/avisos-do-dia.ts`) e para pôr nos pratos
 * do buffet o custo/kg de hoje das fichas do Receituário: um cron a mais
 * dependeria do limite do plano da Vercel. Um não segura o outro.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado — relatório desativado." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let avisos: unknown = null;
  try {
    const { capacity } = await getSettings();
    avisos = await avisosDoDia(capacity.timezone);
  } catch (err) {
    console.error("[cron avisos-do-dia]", err);
    avisos = { error: "Falhou ao montar os avisos do dia." };
  }

  // O custo/kg dos pratos do buffet segue as fichas do Receituário: a compra
  // recebida ontem muda o preço dos insumos.
  let custosDoBuffet: unknown = null;
  try {
    custosDoBuffet = { pratosAtualizados: await recalcularCustosDoBuffet() };
  } catch (err) {
    console.error("[cron custos do buffet]", err);
    custosDoBuffet = { error: "Falhou ao atualizar o custo dos pratos do buffet." };
  }

  try {
    const r = await enviarRelatorioDoDia();
    return NextResponse.json({ ...r, avisos, custosDoBuffet });
  } catch (err) {
    console.error("[cron relatorio-semanal]", err);
    return NextResponse.json({ error: "Falhou ao montar ou enviar o relatório.", avisos, custosDoBuffet }, { status: 500 });
  }
}
