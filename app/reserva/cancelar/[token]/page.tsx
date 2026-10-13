import Link from "next/link";
import { notFound } from "next/navigation";

import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { formatDayAndMonth, formatTime, PARTY_LABEL } from "@/lib/format";

import { CancelConfirm } from "./cancel-confirm";

export const dynamic = "force-dynamic";

/**
 * Renderizar esta página NÃO cancela nada — apps de mensagem pré-carregam
 * links, e um GET destrutivo cancelaria reservas sozinho. O cancelamento só
 * acontece no clique, via server action.
 */
export default async function CancelPage({
  params,
}: PageProps<"/reserva/cancelar/[token]">) {
  const { token } = await params;

  const reservation = await prisma.reservation.findUnique({
    where: { cancelToken: token },
  });
  if (!reservation) notFound();

  const { capacity } = await getSettings();
  const tz = capacity.timezone;

  const when = `${formatDayAndMonth(reservation.startTime, tz)}, às ${formatTime(reservation.startTime, tz)}`;
  const active =
    reservation.status === "CONFIRMED" || reservation.status === "PENDING";
  const tooLate = active && new Date() >= reservation.startTime;

  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-16 pt-10 sm:pt-16">
      <p className="text-xs font-semibold tracking-[0.22em] text-[var(--muted-foreground)]">
        {capacity.name.toUpperCase()} · IVOTI
      </p>

      {reservation.status === "CANCELLED" ? (
        <>
          <h1 className="phrase mt-6">Esta reserva já está cancelada.</h1>
          <p className="mt-4 text-[var(--muted-foreground)]">
            Nada mais a fazer: a mesa já foi liberada.
          </p>
        </>
      ) : !active ? (
        <>
          <h1 className="phrase mt-6">Esta reserva já foi encerrada.</h1>
          <p className="mt-4 text-[var(--muted-foreground)]">
            Ela não pode mais ser cancelada por aqui.
          </p>
        </>
      ) : tooLate ? (
        <>
          <h1 className="phrase mt-6">
            O horário desta reserva já chegou.
          </h1>
          <p className="mt-4 text-[var(--muted-foreground)]">
            A mesa está separada. Se não vai dar para vir, ligue para o
            restaurante, que resolve na hora.
          </p>
        </>
      ) : (
        <>
          <h1 className="phrase mt-6">
            Cancelar a mesa de{" "}
            <em className="not-italic text-[var(--primary)]">
              {PARTY_LABEL(reservation.partySize)}
            </em>
            , {when}?
          </h1>
          <p className="mt-4 text-[var(--muted-foreground)]">
            Em nome de {reservation.customerName}. O cancelamento libera os
            lugares na hora e não pode ser desfeito por aqui.
          </p>
          <CancelConfirm token={token} />
        </>
      )}

      <Link
        href="/"
        className="mt-10 inline-block text-sm font-medium text-[var(--primary)] underline underline-offset-4"
      >
        Fazer uma nova reserva
      </Link>
    </main>
  );
}
