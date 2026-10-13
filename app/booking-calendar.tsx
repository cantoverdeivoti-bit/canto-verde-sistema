"use client";

import type { DayStatus } from "@/lib/availability";
import {
  WEEKDAY_LABELS,
  dayNumber,
  monthCells,
  monthLabel,
  shiftMonth,
} from "@/lib/calendar-grid";

/**
 * O calendário da primeira etapa.
 *
 * Cada dia carrega informação de verdade, não enfeite: fechado é riscado e
 * não clica, fora do prazo de reserva apaga, hoje ganha o anel do pinho.
 * Quem escolhe um dia está escolhendo um dia que existe — o erro não sobra
 * para depois do toque.
 *
 * Sem estado próprio: mês, seleção e dados vêm de cima. Aqui só se desenha.
 */

type Props = {
  /** "YYYY-MM" exibido. */
  month: string;
  /** Dia escolhido, ou null enquanto ninguém escolheu. */
  selected: string | null;
  /** Hoje, no fuso do restaurante. */
  today: string;
  /** Primeiro e último dia reserváveis (regras de antecedência). */
  minDate: string;
  maxDate: string;
  /** Situação de cada dia do mês; null enquanto carrega. */
  days: Record<string, DayStatus> | null;
  onPick: (date: string) => void;
  onMonthChange: (month: string) => void;
};

export function BookingCalendar({
  month,
  selected,
  today,
  minDate,
  maxDate,
  days,
  onPick,
  onMonthChange,
}: Props) {
  const cells = monthCells(month);

  // Setas param nos limites: não há o que procurar fora da janela de reservas.
  const prevMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const canGoBack = prevMonth >= minDate.slice(0, 7);
  const canGoForward = nextMonth <= maxDate.slice(0, 7);

  // Um dia fechado só conta como tal se estiver dentro do prazo de reserva —
  // fechamento em dia que já não dá para reservar não vira legenda.
  const hasClosedDay = cells.some(
    (iso) => iso !== null && iso >= minDate && iso <= maxDate && days?.[iso]?.closed,
  );

  return (
    <div>
      {/* items-center, não baseline: com o botão redondo de 44px a linha de
          base do texto jogaria os círculos para cima do nome do mês. */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-[15px] font-semibold lowercase">{monthLabel(month)}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onMonthChange(prevMonth)}
            disabled={!canGoBack}
            aria-label="Mês anterior"
            className="cal-arrow"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(nextMonth)}
            disabled={!canGoForward}
            aria-label="Próximo mês"
            className="cal-arrow"
          >
            →
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((d) => (
          <span
            key={d}
            className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
          >
            {d}
          </span>
        ))}

        {cells.map((iso, i) => {
          if (iso === null) return <span key={`blank-${i}`} />;

          const status = days?.[iso];
          const outOfRange = iso < minDate || iso > maxDate;
          const closed = status?.closed ?? false;
          // Aberto, mas sem horário que ainda caiba na antecedência: não é
          // fechamento (não leva risco), é um dia que passou da hora.
          const tooLate = status ? !closed && status.times.length === 0 : false;
          // Enquanto o mês carrega ninguém clica: melhor esperar meio segundo
          // do que escolher um dia que vai se revelar fechado.
          const disabled = days === null || outOfRange || closed || tooLate;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onPick(iso)}
              disabled={disabled}
              aria-pressed={iso === selected}
              aria-label={ariaLabel(iso, closed, outOfRange, tooLate, status)}
              data-state={closed && !outOfRange ? "closed" : undefined}
              data-today={iso === today ? "" : undefined}
              data-open={disabled ? undefined : ""}
              className="cal-day"
            >
              {dayNumber(iso)}
            </button>
          );
        })}
      </div>

      {/* Legenda só quando há o que legendar — num mês sem fechamento ela
          seria uma linha explicando algo que não está na tela. */}
      {hasClosedDay && (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">
          Nos dias riscados a casa não abre.
        </p>
      )}
    </div>
  );
}

function ariaLabel(
  iso: string,
  closed: boolean,
  outOfRange: boolean,
  tooLate: boolean,
  status: DayStatus | undefined,
): string {
  const day = dayNumber(iso);
  if (outOfRange) return `Dia ${day} — fora do período de reservas`;
  if (tooLate) return `Dia ${day} — já passou do prazo para reservar`;
  if (closed) {
    return status?.note
      ? `Dia ${day} — fechado (${status.note})`
      : `Dia ${day} — fechado`;
  }
  return `Dia ${day}`;
}
