import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { PARTY_LABEL } from "@/lib/format";

/**
 * A reserva como arquivo de agenda (.ics), para quem não usa a agenda do
 * Google: o iPhone e as outras agendas abrem e guardam o compromisso.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reserva = await prisma.reservation.findUnique({ where: { id } });
  if (!reserva || reserva.status === "CANCELLED") return new Response("Reserva não encontrada", { status: 404 });
  const { rules, capacity } = await getSettings();

  const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  // Vírgula, ponto e vírgula e barra são especiais no formato .ics.
  const texto = (t: string) => t.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Canto Verde//Reservas//PT",
    "BEGIN:VEVENT",
    `UID:${reserva.id}@canto-verde`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${utc(reserva.startTime)}`,
    `DTEND:${utc(reserva.endTime)}`,
    `SUMMARY:${texto(`Almoço no ${capacity.name}`)}`,
    `DESCRIPTION:${texto(`Mesa para ${PARTY_LABEL(reserva.partySize)}, em nome de ${reserva.customerName}.`)}`,
    ...(rules.endereco ? [`LOCATION:${texto(rules.endereco)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return new Response(linhas.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="reserva-${capacity.name.toLowerCase().replace(/\s+/g, "-")}.ics"`,
    },
  });
}
