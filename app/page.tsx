import { add } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

import { MapPin, MessageCircle } from "lucide-react";
import type { Metadata } from "next";

import { ReservationForm } from "@/app/reservation-form";
import {
  findFirstAvailableDate,
  getSettings,
  seatingTimesFromWindows,
  todayInTimezone,
} from "@/lib/availability";
import { linkDoMapa, linkDoWhatsApp } from "@/lib/contato-da-casa";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * A prévia do link no WhatsApp e no Instagram: o nome da casa, a frase do
 * almoço e a foto, em vez de "Reservas / Reserve sua mesa online".
 */
export async function generateMetadata(): Promise<Metadata> {
  const { rules, capacity } = await getSettings();
  const titulo = `${capacity.name} · Reserve sua mesa`;
  const descricao = [rules.sobreACasa, rules.endereco].filter(Boolean).join(" · ") || `Reserve sua mesa no ${capacity.name}, em Ivoti.`;
  return {
    title: titulo,
    description: descricao,
    openGraph: {
      title: titulo,
      description: descricao,
      type: "website",
      locale: "pt_BR",
      ...(rules.fotoUrl ? { images: [{ url: rules.fotoUrl }] } : {}),
    },
  };
}

export default async function Home() {
  const { rules, capacity } = await getSettings();

  if (!rules.isActive) {
    return (
      <main className="mx-auto flex min-h-full max-w-lg flex-col justify-center px-5 py-16">
        <p className="text-sm font-medium tracking-[0.2em] text-[var(--muted-foreground)]">
          {capacity.name.toUpperCase()}
        </p>
        <h1 className="phrase mt-3">
          As reservas online estão pausadas por enquanto.
        </h1>
        <p className="mt-4 text-[var(--muted-foreground)]">
          Ligue para o restaurante e a gente guarda sua mesa.
        </p>
      </main>
    );
  }

  const minDate = todayInTimezone(capacity.timezone);
  const maxDate = formatInTimeZone(
    add(new Date(), advanceDuration(rules.maxAdvanceValue, rules.maxAdvanceUnit)),
    capacity.timezone,
    "yyyy-MM-dd",
  );

  // Abre no primeiro dia com vaga, não em "hoje": quem chega tarde da noite
  // deve encontrar a próxima mesa livre, não um "lotado" de boas-vindas.
  const [firstAvailable, hours] = await Promise.all([
    findFirstAvailableDate(2, { rules, capacity }),
    prisma.businessHours.findMany({
      where: { isActive: true },
      orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }],
    }),
  ]);

  // Se a semana inteira senta gente numa hora só, a página diz qual — é a
  // primeira dúvida de quem chega ("que horas?") e o calendário sozinho não
  // responde. Derivado da grade, não escrito à mão: no dia em que abrir um
  // segundo serviço passam a existir dois horários e a frase some sozinha,
  // em vez de virar mentira. (A grade semanal manda; uma data especial com
  // janela própria continua aparecendo no calendário como sempre.)
  const weeklyTimes = new Set(
    seatingTimesFromWindows(
      hours.map((h) => ({
        opensAt: h.opensAt,
        closesAt: h.closesAt,
        shiftName: h.shiftName,
      })),
      capacity,
    ),
  );
  const singleSeatingTime =
    weeklyTimes.size === 1 ? [...weeklyTimes][0] : null;

  return (
    <main className="mx-auto w-full max-w-xl px-5 pb-16 pt-10 sm:pt-16">
      {/* A casa no topo: quem chega pelo Instagram via só um calendário, sem
          saber onde fica nem como falar com ela. Cada linha só aparece se o
          dono preencheu (Regras de reserva → Página de reserva). */}
      <header className="mb-10">
        {rules.fotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- link livre do dono, de qualquer site
          <img
            src={rules.fotoUrl}
            alt={capacity.name}
            className="mb-6 aspect-[16/9] w-full rounded-xl object-cover"
          />
        )}
        <p className="text-xs font-semibold tracking-[0.22em] text-[var(--muted-foreground)]">
          {capacity.name.toUpperCase()} · IVOTI
        </p>
        {rules.sobreACasa && <p className="mt-2 text-[15px]">{rules.sobreACasa}</p>}
        {rules.endereco && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{rules.endereco}</p>}
        {(rules.endereco || rules.whatsapp) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {rules.endereco && (
              <a
                href={linkDoMapa(rules.endereco)}
                target="_blank"
                rel="noopener"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm font-medium hover:border-[var(--primary)]"
              >
                <MapPin aria-hidden className="size-4" />
                Como chegar
              </a>
            )}
            {rules.whatsapp && (
              <a
                href={linkDoWhatsApp(rules.whatsapp, `Olá! Tenho uma dúvida sobre o ${capacity.name}.`)}
                target="_blank"
                rel="noopener"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm font-medium hover:border-[var(--primary)]"
              >
                <MessageCircle aria-hidden className="size-4" />
                WhatsApp
              </a>
            )}
          </div>
        )}
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">
          Escolha e pronto: a mesa fica guardada na hora.
        </p>
      </header>

      <ReservationForm
        minPartySize={rules.minPartySize}
        maxPartySize={rules.maxPartySize}
        autoApproveUpTo={rules.autoApproveUpTo}
        manualIfOverLimit={rules.manualIfOverLimit}
        minDate={minDate}
        maxDate={maxDate}
        initialDate={firstAvailable ?? minDate}
        restaurantName={capacity.name}
        bookingNotice={rules.bookingNotice}
        singleSeatingTime={singleSeatingTime}
        whatsapp={rules.whatsapp}
      >
        {/* Contexto da casa — o formulário mostra só enquanto se escolhe o
            dia; nas etapas seguintes seria ruído entre a pessoa e a reserva. */}
        <section className="mt-14 border-t border-[var(--border)] pt-8">
          <h2 className="section-label">Quando abrimos</h2>
          <dl className="mt-4 space-y-2 text-sm">
            {groupByDay(hours).map(({ day, label, closed }) => (
              <div
                key={day}
                className="flex items-baseline justify-between gap-4 border-b border-dotted border-[var(--border)] pb-2"
              >
                <dt className={closed ? "text-[var(--muted-foreground)]" : ""}>
                  {day}
                </dt>
                <dd
                  className={`text-right tabular-nums ${
                    closed ? "text-[var(--muted-foreground)]" : "font-medium"
                  }`}
                >
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Só aparece se a fila de espera estiver realmente ligada. */}
        {rules.waitlistEnabled && (
          <p className="mt-8 text-sm text-[var(--muted-foreground)]">
            Sem horário livre? A gente avisa se abrir uma vaga.
          </p>
        )}

        <p className="mt-8 text-xs leading-relaxed text-[var(--muted-foreground)]">
          Guardamos a mesa por {rules.delayToleranceMinutes} minutos depois do
          horário. Se for atrasar mais que isso, é só avisar
          {rules.whatsapp ? (
            <>
              {" "}
              <a
                href={linkDoWhatsApp(rules.whatsapp, `Olá! Tenho reserva no ${capacity.name} e vou atrasar.`)}
                className="text-[var(--primary)] underline underline-offset-4"
              >
                pelo WhatsApp
              </a>
            </>
          ) : null}
          .
        </p>
      </ReservationForm>
    </main>
  );
}

const DAY_NAMES = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

/**
 * Os horários da semana resumidos: dias seguidos com o mesmo horário viram
 * uma linha ("Segunda a sábado"). Eram sete linhas quase iguais. A semana
 * começa na segunda, que é como a casa fala dela.
 */
function groupByDay(hours: { dayOfWeek: number; opensAt: string; closesAt: string }[]) {
  const byDay = new Map<number, string[]>();
  for (const h of hours) {
    const list = byDay.get(h.dayOfWeek) ?? [];
    list.push(`${h.opensAt}–${h.closesAt}`);
    byDay.set(h.dayOfWeek, list);
  }
  const semana = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ d, label: byDay.get(d)?.join("  ·  ") ?? "fechado" }));

  const grupos: { dias: number[]; label: string }[] = [];
  for (const { d, label } of semana) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.label === label) ultimo.dias.push(d);
    else grupos.push({ dias: [d], label });
  }
  return grupos.map(({ dias, label }) => {
    const primeiro = DAY_NAMES[dias[0]];
    const fim = DAY_NAMES[dias[dias.length - 1]].toLowerCase();
    const nome = dias.length === 1 ? primeiro : dias.length === 2 ? `${primeiro} e ${fim}` : `${primeiro} a ${fim}`;
    return { day: nome, label, closed: label === "fechado" };
  });
}

function advanceDuration(value: number, unit: string) {
  switch (unit) {
    case "MINUTES":
      return { minutes: value };
    case "HOURS":
      return { hours: value };
    case "DAYS":
      return { days: value };
    case "WEEKS":
      return { weeks: value };
    default:
      return { months: value };
  }
}
