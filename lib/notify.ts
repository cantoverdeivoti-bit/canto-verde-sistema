import { prisma } from "@/lib/db";
import { REMETENTE as FROM, resend } from "@/lib/email";
import { formatDateTime, formatPhone, PARTY_LABEL } from "@/lib/format";
import { notificar } from "@/lib/notificar";
import type { Reservation } from "@/generated/prisma/client";

/**
 * Aviso automático de nova reserva.
 *
 * Regra inegociável: **falha no e-mail nunca derruba a reserva**. A reserva já
 * está gravada quando esta função é chamada; qualquer erro aqui vira log e o
 * cliente segue com a reserva válida. O oposto — perder a reserva porque o
 * provedor de e-mail piscou — seria bem pior que um aviso não entregue.
 */

export async function notifyNewReservation(
  reservation: Reservation,
  timezone: string,
  restaurantName: string,
): Promise<void> {
  try {
    const settings = await prisma.notificationSettings.findUnique({
      where: { id: 1 },
    });

    if (!settings || settings.channel !== "EMAIL_AUTO") return;

    if (!resend) {
      console.warn(
        `[notify] RESEND_API_KEY ausente — aviso da reserva ${reservation.id} não enviado.`,
      );
      return;
    }

    const when = formatDateTime(reservation.startTime, timezone);
    const isPending = reservation.status === "PENDING";

    if (settings.notifyRestaurant) {
      await resend.emails.send({
        from: FROM,
        to: settings.restaurantEmail,
        subject: isPending
          ? `Reserva aguardando aprovação — ${when}`
          : `Nova reserva — ${when}`,
        text: [
          isPending
            ? "Uma reserva precisa da sua aprovação:"
            : "Nova reserva confirmada:",
          "",
          `Nome:      ${reservation.customerName}`,
          `Telefone:  ${formatPhone(reservation.customerPhone)}`,
          `Quando:    ${when}`,
          `Pessoas:   ${PARTY_LABEL(reservation.partySize)}`,
          reservation.notes ? `Obs.:      ${reservation.notes}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }

    if (settings.notifyCustomer && reservation.customerEmail) {
      // Sem APP_URL configurada o e-mail sai sem o link — melhor que um
      // link quebrado apontando para localhost.
      const base = process.env.APP_URL?.replace(/\/$/, "");
      const cancelLine = base
        ? `Mudou o plano? Cancele por aqui, sem precisar ligar:\n${base}/reserva/cancelar/${reservation.cancelToken}`
        : null;

      await resend.emails.send({
        from: FROM,
        to: reservation.customerEmail,
        subject: isPending
          ? `Recebemos seu pedido de reserva — ${restaurantName}`
          : `Reserva confirmada — ${restaurantName}`,
        text: [
          `Olá, ${reservation.customerName}!`,
          "",
          isPending
            ? `Recebemos seu pedido de reserva para ${when} (${PARTY_LABEL(reservation.partySize)}). Como é um grupo maior, vamos confirmar com você em breve.`
            : `Sua reserva está confirmada para ${when} (${PARTY_LABEL(reservation.partySize)}).`,
          cancelLine ? "" : null,
          cancelLine,
          "",
          `Até lá!`,
          restaurantName,
        ]
          .filter((l): l is string => l !== null)
          .join("\n"),
      });
    }
  } catch (error) {
    // Log e segue. A reserva já existe e é válida.
    console.error(
      `[notify] Falha ao enviar aviso da reserva ${reservation.id}:`,
      error,
    );
  }
}

/**
 * O aviso da reserva para a equipe, no celular e no e-mail de quem escolheu
 * receber (Minhas notificações). Separado do e-mail acima, que é o da casa e
 * o do cliente.
 */
export async function avisarEquipeDaReserva(
  evento: "reserva-nova" | "reserva-cancelada",
  reservation: Pick<Reservation, "id" | "customerName" | "partySize" | "startTime" | "status">,
  timezone: string,
): Promise<void> {
  const quando = formatDateTime(reservation.startTime, timezone);
  const titulo =
    evento === "reserva-cancelada"
      ? "Reserva cancelada pelo cliente"
      : reservation.status === "PENDING"
        ? "Reserva esperando aprovação"
        : "Reserva nova";
  await notificar(evento, {
    titulo,
    corpo: `${reservation.customerName}, ${PARTY_LABEL(reservation.partySize)}, ${quando}.`,
    url: "/admin/comercial",
    etiqueta: `reserva-${reservation.id}`,
  });
}
