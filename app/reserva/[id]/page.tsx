import { CalendarPlus, MapPin, MessageCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingNotice } from "@/app/booking-notice";
import { getSettings } from "@/lib/availability";
import { linkDoMapa, linkDoWhatsApp } from "@/lib/contato-da-casa";
import { prisma } from "@/lib/db";
import { formatDayAndMonth, formatTime, PARTY_LABEL } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReservationPage({
  params,
}: PageProps<"/reserva/[id]">) {
  const { id } = await params;

  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (!reservation) notFound();

  const { rules, capacity } = await getSettings();
  const tz = capacity.timezone;

  const pending = reservation.status === "PENDING";
  const cancelled = reservation.status === "CANCELLED";

  const quando = `${formatDayAndMonth(reservation.startTime, tz)}, às ${formatTime(reservation.startTime, tz)}`;
  // "20261004T143000Z": o formato que a agenda do Google entende, em UTC.
  const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const agendaGoogle =
    "https://calendar.google.com/calendar/render?" +
    new URLSearchParams({
      action: "TEMPLATE",
      text: `Almoço no ${capacity.name}`,
      dates: `${utc(reservation.startTime)}/${utc(reservation.endTime)}`,
      details: `Mesa para ${PARTY_LABEL(reservation.partySize)}, em nome de ${reservation.customerName}.`,
      ...(rules.endereco ? { location: rules.endereco } : {}),
    }).toString();
  const botao =
    "inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--border)] px-4 text-sm font-medium hover:border-[var(--primary)]";

  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-16 pt-10 sm:pt-16">
      <p className="text-xs font-semibold tracking-[0.22em] text-[var(--muted-foreground)]">
        {capacity.name.toUpperCase()} · IVOTI
      </p>

      {/* A resposta na mesma voz do pedido: a frase que a pessoa montou,
          agora afirmada de volta para ela. */}
      <h1 className="phrase mt-6">
        {cancelled ? (
          <>Esta reserva foi cancelada.</>
        ) : pending ? (
          <>
            Anotamos: mesa para{" "}
            <em className="not-italic text-[var(--primary)]">
              {PARTY_LABEL(reservation.partySize)}
            </em>
            , {formatDayAndMonth(reservation.startTime, tz)}, às{" "}
            <em className="not-italic text-[var(--primary)]">
              {formatTime(reservation.startTime, tz)}
            </em>
            .
          </>
        ) : (
          <>
            Mesa guardada para{" "}
            <em className="not-italic text-[var(--primary)]">
              {PARTY_LABEL(reservation.partySize)}
            </em>
            , {formatDayAndMonth(reservation.startTime, tz)}, às{" "}
            <em className="not-italic text-[var(--primary)]">
              {formatTime(reservation.startTime, tz)}
            </em>
            .
          </>
        )}
      </h1>

      <p className="mt-5 text-[var(--muted-foreground)]">
        {cancelled
          ? "Você pode fazer uma nova reserva quando quiser."
          : pending
            ? `Como são ${PARTY_LABEL(reservation.partySize)}, confirmamos na mão. Entramos em contato pelo telefone que você deixou.`
            : `Em nome de ${reservation.customerName}. Até lá!`}
      </p>

      {reservation.notes && !cancelled && (
        <p className="mt-6 border-l-2 border-[var(--primary)] pl-4 text-sm text-[var(--muted-foreground)]">
          {reservation.notes}
        </p>
      )}

      {/* O que se faz depois de reservar: pôr na agenda, ver o caminho e ter
          por onde avisar atraso. Antes a página dizia "é só avisar" sem dizer
          onde. */}
      {!cancelled && (
        <div className="mt-8 flex flex-wrap gap-2">
          <a href={agendaGoogle} target="_blank" rel="noopener" className={botao}>
            <CalendarPlus aria-hidden className="size-4" />
            Adicionar à agenda
          </a>
          {rules.endereco && (
            <a href={linkDoMapa(rules.endereco)} target="_blank" rel="noopener" className={botao}>
              <MapPin aria-hidden className="size-4" />
              Como chegar
            </a>
          )}
          {rules.whatsapp && (
            <a
              href={linkDoWhatsApp(
                rules.whatsapp,
                `Olá! Tenho reserva no ${capacity.name} em nome de ${reservation.customerName}, ${quando}, e vou atrasar.`,
              )}
              target="_blank"
              rel="noopener"
              className={botao}
            >
              <MessageCircle aria-hidden className="size-4" />
              Avisar atraso
            </a>
          )}
        </div>
      )}
      {!cancelled && (
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Usa outra agenda?{" "}
          <a href={`/reserva/${reservation.id}/agenda`} className="underline underline-offset-2">
            Baixe o arquivo da reserva
          </a>
          .
        </p>
      )}

      {/* Cancelada não precisa mais das condições da casa, só do caminho
          de volta. */}
      {!cancelled && <BookingNotice text={rules.bookingNotice} className="mt-8" />}

      {!cancelled && (
        <p className="mt-10 border-t border-[var(--border)] pt-6 text-xs leading-relaxed text-[var(--muted-foreground)]">
          Guardamos a mesa por {rules.delayToleranceMinutes} minutos depois do
          horário. Mudou o plano?{" "}
          <Link
            href={`/reserva/cancelar/${reservation.cancelToken}`}
            className="font-medium text-[var(--primary)] underline underline-offset-2"
          >
            Cancele por aqui
          </Link>
          , sem precisar ligar.
        </p>
      )}

      <Link
        href="/"
        className="mt-8 inline-block text-sm font-medium text-[var(--primary)] underline underline-offset-4"
      >
        Fazer outra reserva
      </Link>
    </main>
  );
}
