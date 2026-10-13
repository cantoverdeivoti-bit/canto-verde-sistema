import { addMinutes } from "date-fns";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import Link from "next/link";

import {
  getDayWindows,
  getSettings,
  peakOccupancy,
  toDateOnly,
  todayInTimezone,
} from "@/lib/availability";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { can, getCurrentUser } from "@/lib/permissions";
import {
  formatDateString,
  formatDayAndMonth,
  formatPhone,
  formatTime,
  plural,
  STATUS_LABEL,
} from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";
import type { Reservation, ReservationStatus } from "@/generated/prisma/client";

import { AcoesDoDia } from "./acoes-do-dia";
import { MonthCalendar } from "./month-calendar";
import { ReservationActions } from "./reservation-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agenda — Reservas" };

export default async function ReservationsPage({
  searchParams,
}: PageProps<"/admin/comercial">) {
  const params = await searchParams;
  const { rules, capacity } = await getSettings();

  const date =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : todayInTimezone(capacity.timezone);

  const query = typeof params.q === "string" ? params.q.trim() : "";
  const today = todayInTimezone(capacity.timezone);

  // Mês do calendário lateral: ?month=YYYY-MM, ou o mês do dia selecionado.
  const month =
    typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : date.slice(0, 7);
  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  // A agenda e o calendário do mês saem juntos: um não depende do outro.
  const [reservations, busyRows, specialRows] = await Promise.all([
    // Com busca, o dia deixa de importar: quem liga raramente lembra a data.
    // Varre de hoje em diante; sem busca, é a agenda do dia selecionado.
    prisma.reservation.findMany({
      where: query
        ? {
            serviceDate: { gte: toDateOnly(today) },
            OR: [
              { customerName: { contains: query, mode: "insensitive" } },
              { customerPhone: { contains: query.replace(/\D/g, "") || query } },
            ],
          }
        : { serviceDate: toDateOnly(date) },
      orderBy: { startTime: "asc" },
    }),
    prisma.reservation.groupBy({
      by: ["serviceDate"],
      where: {
        serviceDate: { gte: monthStart, lt: monthEnd },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    }),
    prisma.specialDate.findMany({
      where: { date: { gte: monthStart, lt: monthEnd } },
      select: { date: true, isClosed: true },
    }),
  ]);
  // Como fica o dia escolhido (fechado pelo cadeado, pela grade da semana ou
  // aberto) e se quem olha pode trancar: a mesma trava de Configurações.
  const [user, diaDaAgenda, especialDoDia] = await Promise.all([
    getCurrentUser(),
    getDayWindows(date, capacity),
    prisma.specialDate.findUnique({ where: { date: toDateOnly(date) }, select: { isClosed: true, note: true } }),
  ]);
  const podeTrancar = can(user, "comercial", { configure: true }) && date >= today;
  const fechadoPeloCadeado = especialDoDia?.isClosed === true;
  const busyDays = new Set(busyRows.map((r) => r.serviceDate.toISOString().slice(0, 10)));
  const specialDays = new Set(specialRows.map((r) => r.date.toISOString().slice(0, 10)));
  const closedDays = new Set(specialRows.filter((r) => r.isClosed).map((r) => r.date.toISOString().slice(0, 10)));

  // Havia aqui uma consulta de histórico por telefone — "3ª visita", "2
  // faltas" ao lado do nome. Saiu junto com os botões de chegou/não veio: ela
  // contava reservas COMPLETED e NO_SHOW, status que ninguém marca mais, e
  // seria uma ida ao banco a cada carga da agenda para devolver sempre zero.

  const occupying = reservations.filter(
    (r) => r.status === "PENDING" || r.status === "CONFIRMED",
  );
  const pendingCount = reservations.filter((r) => r.status === "PENDING").length;

  // O número que importa: quantas pessoas sentadas AO MESMO TEMPO no pior
  // momento — almoço e jantar não disputam as mesmas cadeiras.
  const { peak } = peakOccupancy(
    occupying.map((r) => ({
      startTime: r.startTime,
      endTime: r.endTime,
      partySize: r.partySize,
    })),
  );

  const now = new Date();

  // Turnos: a equipe pensa em almoço e jantar, a lista respeita isso.
  const LUNCH_CUTOFF = 16; // hora local
  const byShift = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const hour = Number(formatTime(r.startTime, capacity.timezone).slice(0, 2));
    const shift = hour < LUNCH_CUTOFF ? "Almoço" : "Jantar";
    byShift.set(shift, [...(byShift.get(shift) ?? []), r]);
  }

  // Uma linha da agenda — compartilhada entre a visão do dia e a busca
  // global (que mostra a data junto da hora).
  function row(r: Reservation, showDate: boolean) {
    const late =
      r.status === "CONFIRMED" &&
      now > addMinutes(r.startTime, rules.delayToleranceMinutes);
    const closed =
      r.status === "CANCELLED" ||
      r.status === "NO_SHOW" ||
      r.status === "COMPLETED";
    const wa = whatsappLink(r, {
      timezone: capacity.timezone,
      restaurantName: capacity.name,
      late,
    });

    return (
      <li
        key={r.id}
        className={`flex flex-wrap items-start gap-x-5 gap-y-2 py-3.5 ${
          closed ? "opacity-55" : ""
        }`}
      >
        {/* O número grande é o tamanho do grupo, não a hora.

            A hora era o que gritava em cada linha, e num dia inteiro de
            almoço ela se repete quase igual — enquanto o que de fato separa
            uma reserva da outra, quantas pessoas chegam, ficava miúdo
            embaixo. Os dois trocaram de lugar. A lista continua ordenada por
            horário, e na busca a data fica por cima para situar no tempo. */}
        <div className="w-20 shrink-0">
          {showDate && (
            <p className="text-xs font-medium text-[var(--muted-foreground)]">
              {formatDateString(r.serviceDate.toISOString().slice(0, 10))}
            </p>
          )}
          <p className="num-display text-2xl leading-none">{r.partySize}</p>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            {r.partySize === 1 ? "pessoa" : "pessoas"}
          </p>
        </div>

        <div className="min-w-44 flex-1">
          <p className="font-medium">
            <span className={closed ? "line-through" : ""}>{r.customerName}</span>
            {r.source === "ADMIN" && (
              <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">
                balcão
              </span>
            )}
            {/* Numa lista cheia o leitor de tela anunciaria vinte
                "WhatsApp" iguais — o nome desempata. */}
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-sm font-normal text-[var(--primary)] underline-offset-4 hover:underline"
              >
                WhatsApp
                <span className="sr-only">
                  {" "}
                  — abrir conversa com {r.customerName} (nova aba)
                </span>
              </a>
            )}
          </p>
          <p className="text-sm text-[var(--muted-foreground)]">
            <a href={`tel:${r.customerPhone}`} className="hover:underline">
              {formatPhone(r.customerPhone)}
            </a>
            {/* Sem link do WhatsApp o motivo é sempre o número: dizer isso
                é melhor que uma ausência que parece funcionalidade quebrada. */}
            {!wa && (
              <span className="ml-2 text-xs font-semibold" style={{ color: "var(--warn)" }}>
                telefone incompleto
              </span>
            )}
          </p>
          {r.notes && (
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{r.notes}</p>
          )}
          <StatusLine status={r.status} />
        </div>

        <ReservationActions
          id={r.id}
          status={r.status}
          customerName={r.customerName.split(" ")[0]}
          partySize={r.partySize}
          date={r.serviceDate.toISOString().slice(0, 10)}
          time={formatTime(r.startTime, capacity.timezone)}
          notes={r.notes ?? ""}
        />
      </li>
    );
  }

  return (
    <Pagina largura="larga">
      {/* O título primeiro, sobre a faixa verde do alto; o calendário vem embaixo. */}
      {query ? (
        <CabecalhoDaPagina
          titulo={<>Resultados para &ldquo;{query}&rdquo;</>}
          subtitulo={
            reservations.length === 0
              ? "Nada de hoje em diante. Confira a grafia ou tente só o começo do nome."
              : `${plural(reservations.length, "reserva")} de hoje em diante.`
          }
        />
      ) : (
        <CabecalhoDaPagina
          titulo={capitalizeFirst(formatDayAndMonth(toDateOnly(date), "UTC"))}
          subtitulo={date === today ? "Hoje" : undefined}
          acoes={
            // Trocar de dia pelas setas, como na Escala; "Hoje" volta quando se saiu dele.
            <div className="flex items-center gap-1">
              <Link href={`?date=${somarUmDia(date, -1)}`} aria-label="Dia anterior" className={SETA}>
                <ChevronLeft aria-hidden className="size-5" />
              </Link>
              {date !== today && (
                <Button asChild size="sm">
                  <Link href="/admin/comercial">Hoje</Link>
                </Button>
              )}
              <Link href={`?date=${somarUmDia(date, 1)}`} aria-label="Próximo dia" className={SETA}>
                <ChevronRight aria-hidden className="size-5" />
              </Link>
            </div>
          }
        />
      )}
      {/* No celular: o resumo, os botões e a lista primeiro; o calendário do
          mês embaixo, para escolher outro dia. No computador, o calendário
          fica na coluna da esquerda. Num cartão branco nos dois. */}
      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[18rem_1fr] lg:items-start lg:gap-10">
        <aside className="order-last rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 lg:sticky lg:top-6 lg:order-none lg:max-w-xs">
          <MonthCalendar
            month={month}
            selected={date}
            today={today}
            busyDays={busyDays}
            specialDays={specialDays}
            closedDays={closedDays}
          />
        </aside>

        <div>

        {/* O resumo do dia num cartão (quantos lugares, ou dia fechado) e,
            embaixo, as duas ações lado a lado. Aberto, o formulário de anotar
            ou a confirmação de fechar ocupam a linha inteira. */}
        {!query && (
          <div className="space-y-3">
            {diaDaAgenda.closed ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <Lock aria-hidden className="size-4" />
                    Dia fechado
                  </p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {fechadoPeloCadeado
                      ? (especialDoDia?.note ?? "Não aceita reservas neste dia.")
                      : "Sem horário neste dia da semana. Para abrir, use Configurações de reservas."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-baseline gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
                {occupying.length > 0 ? (
                  <>
                    <span className="num-display text-4xl leading-none text-[var(--primary)]">{peak}</span>
                    <span className="text-sm font-medium">
                      de {capacity.totalCapacity} lugares · {plural(occupying.length, "reserva", "reservas")}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-[var(--muted-foreground)]">Nenhuma reserva ainda. O dia está todo livre.</span>
                )}
              </div>
            )}

            <AcoesDoDia
              data={date}
              ativas={occupying.length}
              fechado={diaDaAgenda.closed}
              fechadoPeloCadeado={fechadoPeloCadeado}
              motivo={especialDoDia?.note ?? null}
              podeTrancar={podeTrancar}
              podeConfigurar={can(user, "comercial", { configure: true })}
            />
          </div>
        )}

        {pendingCount > 0 && (
          <p className="msg-warn mt-4 font-medium">
            {pendingCount === 1
              ? "1 reserva esperando você aprovar."
              : `${pendingCount} reservas esperando você aprovar.`}
          </p>
        )}

        {/* Havia aqui um "Resumo do dia" recolhível, com as mesmas reservas em
            lista corrida. Saiu: a lista por turno logo abaixo já é o resumo, e
            a mesma informação escrita duas vezes na mesma tela obriga a pessoa
            a conferir qual das duas está certa. */}

        {query ? (
          reservations.length > 0 && (
            <ul className="mt-8 divide-y divide-dotted divide-[var(--border)]">
              {reservations.map((r) => row(r, true))}
            </ul>
          )
        ) : (
          ["Almoço", "Jantar"].map((shift) => {
            const rows = byShift.get(shift);
            if (!rows?.length) return null;

            return (
              <section key={shift} className="mt-8">
                <h2 className="section-label">{shift}</h2>
                <ul className="mt-2 divide-y divide-dotted divide-[var(--border)]">
                  {rows.map((r) => row(r, false))}
                </ul>
              </section>
            );
          })
        )}
        </div>
      </div>
    </Pagina>
  );
}

/** "sábado, 29 de agosto" -> "Sábado, 29 de agosto" — só a primeira letra. */
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Status como texto, não como pílula colorida. Confirmada é o estado normal
 * e fica em silêncio; só a exceção fala.
 *
 * Havia aqui um aviso de "Atrasada — passou dos N min de tolerância". Saiu:
 * a casa não confere quem chegou, então o aviso não descrevia um atraso, só o
 * relógio passando da hora — e pintava de ocre toda reserva do almoço a
 * partir das 11h45.
 */
function StatusLine({ status }: { status: ReservationStatus }) {
  if (status === "CONFIRMED") return null;

  const color =
    status === "PENDING"
      ? "var(--warn)"
      : status === "NO_SHOW"
        ? "var(--destructive)"
        : "var(--muted-foreground)";

  return (
    <p className="mt-1 text-xs font-semibold" style={{ color }}>
      {STATUS_LABEL[status]}
    </p>
  );
}

const SETA = "flex size-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]";

/** "2026-10-20" mais `dias`, em UTC (datas sem hora). */
function somarUmDia(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
