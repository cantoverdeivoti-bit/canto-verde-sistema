import { NextResponse } from "next/server";
import { Resend } from "resend";

import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { formatDayAndMonth, formatTime, PARTY_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Lembrete pré-visita — a maior alavanca contra no-show, e de graça.
 *
 * Chamada uma vez por dia pelo Vercel Cron (vercel.json — plano Hobby só
 * permite cron diário). O horário escolhido, 15:00 UTC (12:00 local, logo
 * após o único serviço das 11:30), deixa ~23h30 até o almoço do dia
 * seguinte — dentro da janela padrão de `sendReminderHours` (24h) com
 * margem. Se o restaurante reduzir esse valor para menos de ~23h, o lembrete
 * pode não disparar a tempo: com um cron diário, a antecedência não é exata,
 * é "aproximadamente um dia antes".
 *
 * Pega reservas CONFIRMED com e-mail, ainda sem lembrete, começando dentro
 * da janela, envia e marca `reminderSentAt` — nunca lembra duas vezes.
 * Best-effort por reserva: uma falha de envio não trava as demais.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET não configurado — lembretes desativados." },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const [settings, notif] = await Promise.all([
    getSettings(),
    prisma.notificationSettings.findUnique({ where: { id: 1 } }),
  ]);
  const hours = notif?.sendReminderHours;
  if (!hours || !notif?.notifyCustomer) {
    return NextResponse.json({ sent: 0, skipped: "lembretes desligados" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ sent: 0, skipped: "RESEND_API_KEY ausente" });
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + hours * 3_600_000);

  const due = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      customerEmail: { not: null },
      reminderSentAt: null,
      startTime: { gt: now, lte: windowEnd },
    },
    orderBy: { startTime: "asc" },
    take: 50, // um lote por execução; o cron da próxima hora pega o resto
  });

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM ?? "Reservas <onboarding@resend.dev>";
  const tz = settings.capacity.timezone;
  const name = settings.capacity.name;
  const base = process.env.APP_URL?.replace(/\/$/, "");

  let sent = 0;
  for (const r of due) {
    try {
      const when = `${formatDayAndMonth(r.startTime, tz)}, às ${formatTime(r.startTime, tz)}`;
      await resend.emails.send({
        from,
        to: r.customerEmail!,
        subject: `Sua mesa amanhã — ${name}`,
        text: [
          `Olá, ${r.customerName}!`,
          "",
          `Passando para lembrar: sua mesa para ${PARTY_LABEL(r.partySize)} está guardada para ${when}.`,
          base
            ? `\nMudou o plano? Cancele por aqui, sem precisar ligar:\n${base}/reserva/cancelar/${r.cancelToken}`
            : null,
          "",
          "Até lá!",
          name,
        ]
          .filter((l): l is string => l !== null)
          .join("\n"),
      });
      await prisma.reservation.update({
        where: { id: r.id },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } catch (error) {
      console.error(`[reminders] falha para ${r.id}:`, error);
    }
  }

  return NextResponse.json({ sent, due: due.length });
}
