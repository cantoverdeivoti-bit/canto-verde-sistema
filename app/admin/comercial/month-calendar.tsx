import { Lock } from "lucide-react";
import Link from "next/link";

/**
 * Calendário do mês na lateral da agenda — navegação, não decoração.
 * Dia com reserva ativa ganha um ponto pinho; data especial, um anel latão;
 * dia fechado (o cadeado da agenda), o número riscado e um cadeado;
 * clicar num dia abre a agenda dele. Tudo server-rendered: os dias são
 * links com ?date=, os meses links com ?month= — nenhum estado no cliente.
 */

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type Props = {
  /** "YYYY-MM" exibido. */
  month: string;
  /** Data selecionada na agenda ("YYYY-MM-DD"). */
  selected: string;
  /** Hoje, no fuso do restaurante. */
  today: string;
  /** Dias (ISO) com pelo menos uma reserva ativa. */
  busyDays: ReadonlySet<string>;
  /** Dias (ISO) cadastrados como data especial. */
  specialDays: ReadonlySet<string>;
  /** Dos especiais, os fechados (o cadeado da agenda). */
  closedDays?: ReadonlySet<string>;
};

export function MonthCalendar({ month, selected, today, busyDays, specialDays, closedDays = new Set() }: Props) {
  const [year, monthIndex] = [Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1];

  const first = new Date(Date.UTC(year, monthIndex, 1));
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const leadingBlanks = first.getUTCDay();

  const prev = new Date(Date.UTC(year, monthIndex - 1, 1));
  const next = new Date(Date.UTC(year, monthIndex + 1, 1));
  const monthParam = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const cells: Array<string | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => {
      const day = String(i + 1).padStart(2, "0");
      return `${month}-${day}`;
    }),
  ];

  return (
    <nav aria-label="Calendário do mês">
      <div className="flex items-baseline justify-between">
        <p className="section-label">
          {MONTHS[monthIndex]} {year}
        </p>
        <div className="flex gap-1">
          <Link
            href={`?date=${selected}&month=${monthParam(prev)}`}
            aria-label="Mês anterior"
            className="nav-link px-2"
          >
            ←
          </Link>
          <Link
            href={`?date=${selected}&month=${monthParam(next)}`}
            aria-label="Próximo mês"
            className="nav-link px-2"
          >
            →
          </Link>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            {d}
          </span>
        ))}

        {cells.map((iso, i) =>
          iso === null ? (
            <span key={`blank-${i}`} />
          ) : (
            <Link
              key={iso}
              href={`?date=${iso}`}
              aria-label={closedDays.has(iso) ? `${iso}, fechado` : iso}
              aria-current={iso === selected ? "date" : undefined}
              className={`relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-md text-sm tabular-nums transition ${
                iso === selected
                  ? "bg-[var(--botao)] font-semibold text-[var(--botao-texto)]"
                  : iso === today
                    ? "font-semibold text-[var(--primary)] hover:bg-[var(--accent)]"
                    : iso < today
                      ? "text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
                      : "hover:bg-[var(--accent)]"
              }`}
            >
              <span className={closedDays.has(iso) ? "line-through opacity-60" : undefined}>{Number(iso.slice(8, 10))}</span>
              <span className="flex h-1.5 items-center gap-0.5">
                {busyDays.has(iso) && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      background: iso === selected ? "var(--surface)" : "var(--primary)",
                    }}
                  />
                )}
                {closedDays.has(iso) ? (
                  <Lock aria-hidden className="size-2.5" />
                ) : specialDays.has(iso) && (
                  <span
                    className="h-1.5 w-1.5 rounded-full border"
                    style={{ borderColor: "var(--ring)" }}
                  />
                )}
              </span>
            </Link>
          ),
        )}
      </div>

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted-foreground)]">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
          com reservas
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full border" style={{ borderColor: "var(--ring)" }} />
          data especial
        </span>
        {closedDays.size > 0 && (
          <span className="flex items-center gap-1">
            <Lock aria-hidden className="size-2.5" />
            fechado
          </span>
        )}
      </p>
    </nav>
  );
}
