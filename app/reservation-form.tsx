"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { BookingCalendar } from "./booking-calendar";
import { BookingNotice } from "./booking-notice";
import {
  fetchMonthDays,
  fetchSlots,
  type SlotsResult,
} from "@/lib/actions/availability";
import { createReservation } from "@/lib/actions/reservations";
import type { DayStatus } from "@/lib/availability";
import { MONTH_NAMES } from "@/lib/calendar-grid";
import { maskPhoneBR } from "@/lib/phone-mask";

type Props = {
  minPartySize: number;
  maxPartySize: number;
  autoApproveUpTo: number;
  manualIfOverLimit: boolean;
  minDate: string;
  maxDate: string;
  /** Primeiro dia com vaga — atalho e mês de abertura do calendário. */
  initialDate: string;
  restaurantName: string;
  /** Aviso da casa, escrito em Configurações. Nulo quando não há. */
  bookingNotice: string | null;
  /** Hora única da semana, quando existe só uma. Nulo com dois serviços. */
  singleSeatingTime: string | null;
  /** WhatsApp da casa (só dígitos, com 55), para quem precisa falar com ela. */
  whatsapp: string | null;
  /** Horários da casa e nota de tolerância: só fazem sentido na etapa 1. */
  children?: React.ReactNode;
};

/** Onde o celular guarda nome, telefone e e-mail de quem já reservou. */
const CHAVE_DO_CLIENTE = "cv-reserva-cliente";

/**
 * A reserva em duas etapas: o dia (com quantas pessoas, na mesma tela) e
 * quem é você. Eram três; "quantas pessoas" virou uma fileira de botões
 * acima do calendário, e tocar no dia já leva aos dados.
 *
 * A frase falada não morreu com as etapas — ela virou o indicador de
 * progresso. Em vez de bolinhas 01-02-03, o cliente lê em português o que já
 * decidiu; o que falta aparece como lacuna. Cada trecho preenchido é tocável
 * e leva de volta à etapa que o define. É o mesmo objeto sendo formulário,
 * resumo e mapa de onde se está.
 *
 * A hora nunca é uma etapa: ela deriva do dia. Com um serviço só, o dia
 * escolhido já resolve o horário e avança sozinho; se um dia houver dois
 * serviços, as fichas aparecem na própria etapa 1.
 */
export function ReservationForm({
  minPartySize,
  maxPartySize,
  autoApproveUpTo,
  manualIfOverLimit,
  minDate,
  maxDate,
  initialDate,
  restaurantName,
  bookingNotice,
  singleSeatingTime,
  whatsapp,
  children,
}: Props) {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);

  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [partySize, setPartySize] = useState(2);
  const [month, setMonth] = useState(initialDate.slice(0, 7));

  const [monthDays, setMonthDays] = useState<Record<string, DayStatus> | null>(null);
  const [slots, setSlots] = useState<SlotsResult | null>(null);
  const [loadingSlots, startLoadingSlots] = useTransition();
  const [submitting, startSubmitting] = useTransition();

  // Controlados, não lidos do DOM no envio: voltar uma etapa desmonta os
  // campos, e o que a pessoa digitou não pode evaporar por causa disso.
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [notes, setNotes] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Trocou o mês: os dias antigos saem no mesmo render, e o efeito só busca.
  const [mesAnterior, setMesAnterior] = useState(month);
  if (month !== mesAnterior) {
    setMesAnterior(month);
    setMonthDays(null);
  }

  useEffect(() => {
    let cancelled = false;
    fetchMonthDays(month).then((days) => {
      if (!cancelled) setMonthDays(days);
    });
    return () => {
      cancelled = true;
    };
  }, [month]);

  // Erro fora da tela não é erro visto: leva o foco até ele.
  useEffect(() => {
    if (formError) errorRef.current?.focus();
  }, [formError]);

  const needsApproval = manualIfOverLimit && partySize > autoApproveUpTo;
  const linkDoWhatsApp = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Quero falar sobre uma reserva no ${restaurantName}.`)}`
    : null;
  // Hoje (o primeiro dia da janela) aberto, mas já sem horário que caiba na
  // antecedência: o dia aparece apagado, e aqui se diz por quê.
  const hoje = monthDays?.[minDate];
  const hojeJaPassou = hoje !== undefined && !hoje.closed && hoje.times.length === 0;
  const vagasNoDia = date ? (monthDays?.[date]?.vagas ?? null) : null;

  /** Mudar o número de pessoas desfaz o dia escolhido: o que cabe muda. */
  function pickParty(n: number) {
    setPartySize(n);
    if (date !== null) {
      setDate(null);
      setTime(null);
      setSlots(null);
    }
  }

  /**
   * Os dados de quem já reservou neste celular vêm preenchidos. Só quando
   * os campos estão vazios: o que a pessoa digitou nesta reserva manda.
   */
  function goDados() {
    if (!customerName && !customerPhone && !customerEmail) {
      try {
        const salvo = JSON.parse(localStorage.getItem(CHAVE_DO_CLIENTE) ?? "null") as {
          nome?: string;
          telefone?: string;
          email?: string;
        } | null;
        if (salvo) {
          setCustomerName(salvo.nome ?? "");
          setCustomerPhone(salvo.telefone ?? "");
          setCustomerEmail(salvo.email ?? "");
        }
      } catch {}
    }
    setStep(2);
  }

  /** Tocar no dia É a resposta: busca os horários e segue sozinho. */
  function pickDate(iso: string) {
    setDate(iso);
    setTime(null);
    setFormError(null);
    startLoadingSlots(async () => {
      const result = await fetchSlots(iso, partySize);
      setSlots(result);
      // Serviço único: o dia resolve o horário e a etapa passa na hora.
      if (result.slots.length === 1) {
        setTime(result.slots[0].time);
        goDados();
      }
      // Dois ou mais: as fichas aparecem aqui mesmo, sem virar outra etapa.
      // Nenhum: a explicação aparece abaixo do calendário e ninguém avança.
    });
  }

  function pickTime(t: string) {
    setTime(t);
    goDados();
  }

  function backToCalendar() {
    setStep(1);
    setFormError(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== 2 || !date || !time) return;

    setFormError(null);
    setFieldErrors({});

    startSubmitting(async () => {
      const result = await createReservation({
        customerName,
        customerPhone,
        customerEmail,
        notes,
        partySize,
        date,
        time,
      });

      if (result.ok) {
        // Lembrado no próprio celular, para a próxima reserva vir preenchida.
        try {
          localStorage.setItem(
            CHAVE_DO_CLIENTE,
            JSON.stringify({ nome: customerName, telefone: customerPhone, email: customerEmail }),
          );
        } catch {}
        router.push(`/reserva/${result.reservationId}`);
        return;
      }

      setFormError(result.message);
      setFieldErrors(result.fieldErrors ?? {});
      // Alguém pode ter reservado enquanto esta pessoa preenchia: recarrega a
      // grade para que a próxima tentativa parta do que existe agora.
      setSlots(await fetchSlots(date, minPartySize));
    });
  }

  return (
    <form onSubmit={onSubmit}>
      {/* --- o passo a passo: 1 → 2 → 3 ------------------------------------
          Passo feito é botão e leva de volta à etapa que ele nomeia; o
          futuro não promete atalho — quem não escolheu o dia não tem para
          onde pular. A seta é texto, não ícone. */}
      <ol aria-label="Etapas da reserva" className="mb-7 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {STEPS.map(({ n, label }, i) => {
          const done = step > n;
          const current = step === n;
          return (
            <li key={n} className="flex items-center gap-x-2">
              {i > 0 && (
                <span
                  aria-hidden
                  className={step > n - 1 ? "text-[var(--primary)]" : "text-[var(--border)]"}
                >
                  →
                </span>
              )}
              <button
                type="button"
                disabled={!done}
                onClick={backToCalendar}
                aria-current={current ? "step" : undefined}
                className={`flex items-center gap-1.5 rounded-md transition ${
                  current ? "font-semibold" : "text-[var(--muted-foreground)]"
                } ${done ? "hover:text-[var(--primary)]" : "disabled:pointer-events-none"}`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums ${
                    current
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : done
                        ? "border border-[var(--primary)] text-[var(--primary)]"
                        : "border border-[var(--border)]"
                  }`}
                >
                  {n}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      {/* --- a frase: o que já foi decidido, e o que falta ----------------- */}
      {/* Na etapa 1 a frase ainda é pergunta — não mostra um número de
          pessoas que ninguém escolheu. Da etapa 2 em diante vira registro. */}
      <h1 className={`phrase ${step === 1 ? "" : "phrase--compact"}`}>
        Mesa para{" "}
        {step === 1 ? (
          // Texto normal: numa caixa cinza, "que dia?" parecia um campo
          // desligado ou um botão quebrado.
          "que dia?"
        ) : (
          <>
            <button
              type="button"
              onClick={backToCalendar}
              className="phrase-slot"
            >
              {peopleLabel(partySize)}
            </button>
            ,{" "}
            <button
              type="button"
              onClick={backToCalendar}
              className="phrase-slot"
            >
              {longDate(date!)}
            </button>
            , às{" "}
            <button
              type="button"
              onClick={backToCalendar}
              className="phrase-slot"
            >
              {time}
            </button>
            .
          </>
        )}
      </h1>

      {/* ============ ETAPA 1: quantas pessoas e que dia ================== */}
      {step === 1 && (
        <>
          {/* Quantas pessoas, acima do calendário: era uma etapa só para
              isso. Mudar o número desfaz o dia (o que cabe muda). */}
          <fieldset className="mt-6">
            <legend className="label">Quantas pessoas?</legend>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {Array.from({ length: maxPartySize - minPartySize + 1 }, (_, i) => minPartySize + i).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pickParty(n)}
                  aria-pressed={partySize === n}
                  aria-label={peopleLabel(n)}
                  className="chip h-11 w-full"
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="hint">
              {needsApproval ? (
                `Para ${partySize} pessoas o ${restaurantName} confirma na mão. Você recebe o retorno em seguida.`
              ) : (
                <>
                  Mais de {maxPartySize} pessoas?{" "}
                  {linkDoWhatsApp ? (
                    <a href={linkDoWhatsApp} className="text-[var(--primary)] underline underline-offset-4">
                      Fale com a gente pelo WhatsApp
                    </a>
                  ) : (
                    "Fale com o restaurante"
                  )}
                  : mesas grandes a gente organiza junto.
                </>
              )}
            </p>
          </fieldset>

          {/* Observação, não manchete: responde "que horas?" antes do
              toque e sai da frente. Derivada da grade: com dois serviços
              some sozinha. */}
          {singleSeatingTime && (
            <p className="mt-6 text-sm text-[var(--muted-foreground)]">
              Todas as reservas são para as {singleSeatingTime}.
            </p>
          )}

          {/* O primeiro dia livre, num toque: é o que a maioria quer
              ("amanhã"), sem procurar no calendário. */}
          {date === null && initialDate >= minDate && (
            <Button
              type="button"
              size="lg"
              className="mt-4 h-auto w-full py-3 whitespace-normal"
              onClick={() => {
                setMonth(initialDate.slice(0, 7));
                pickDate(initialDate);
              }}
            >
              Reservar para {quandoE(initialDate, minDate)}
            </Button>
          )}

          <div className="mt-6">
            {initialDate >= minDate && date === null && (
              <p className="mb-2 text-sm text-[var(--muted-foreground)]">Ou escolha outro dia:</p>
            )}
            <BookingCalendar
              month={month}
              selected={date}
              today={minDate}
              minDate={minDate}
              maxDate={maxDate}
              days={monthDays}
              onPick={pickDate}
              onMonthChange={setMonth}
            />
          </div>

          {hojeJaPassou && month === minDate.slice(0, 7) && (
            <p className="mt-3 text-xs text-[var(--muted-foreground)]">
              Hoje já passou do horário de reservar pelo site.
              {linkDoWhatsApp && (
                <>
                  {" "}
                  <a href={linkDoWhatsApp} className="text-[var(--primary)] underline underline-offset-4">
                    Chame no WhatsApp
                  </a>{" "}
                  para ver se ainda dá.
                </>
              )}
            </p>
          )}

          {loadingSlots && (
            <p className="mt-5 text-sm text-[var(--muted-foreground)]">
              Vendo o que temos nesse dia…
            </p>
          )}

          {/* Dois serviços ou mais: a escolha vive aqui, não em outra etapa. */}
          {!loadingSlots && date && slots && slots.slots.length > 1 && (
            <fieldset className="mt-6">
              <legend className="text-sm font-medium">
                Que horário você prefere?
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {slots.slots.map((slot) => (
                  <button
                    key={slot.time}
                    type="button"
                    onClick={() => pickTime(slot.time)}
                    aria-label={`${slot.time}, ${slot.remaining} lugares livres`}
                    className="chip"
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {!loadingSlots && date && slots?.emptyReason === "CLOSED" && (
            <p className="msg-warn mt-5">
              Nesta data o restaurante está fechado
              {slots.note ? ` (${slots.note})` : ""}. Escolha outro dia.
            </p>
          )}

          {!loadingSlots && date && slots?.emptyReason === "FULL" && (
            <p className="msg-warn mt-5">
              {vagasNoDia !== null && vagasNoDia >= minPartySize && vagasNoDia < partySize
                ? `Nesse dia ainda cabem ${peopleLabel(vagasNoDia)}, não ${partySize}. Escolha outro dia ou diminua o grupo.`
                : "Esse dia já lotou. Escolha outro dia."}
              {linkDoWhatsApp && (
                <>
                  {" "}
                  <a href={linkDoWhatsApp} className="underline underline-offset-4">
                    Ou chame no WhatsApp
                  </a>
                  : às vezes abre uma vaga.
                </>
              )}
            </p>
          )}

          {children}
        </>
      )}

      {/* ================== ETAPA 2: quem é você? ======================== */}
      {step === 2 && (
        <>
          {needsApproval && (
            <p className="mt-7 rounded-lg bg-[var(--accent)] px-4 py-3 text-sm">
              Para {partySize} pessoas o {restaurantName} confirma na mão. Você
              recebe o retorno em seguida.
            </p>
          )}

          <div className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="customerName">
                Em nome de quem?
              </label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                autoComplete="name"
                autoFocus={customerName === ""}
                required
              />
              {fieldErrors.customerName && (
                <p className="error">{fieldErrors.customerName}</p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="customerPhone">
                Telefone
              </label>
              <Input
                id="customerPhone"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(maskPhoneBR(e.target.value))}
                inputMode="tel"
                autoComplete="tel"
                placeholder="(51) 99999-9999"
                required
              />
              <p className="hint">Para falar com você se precisar.</p>
              {fieldErrors.customerPhone && (
                <p className="error">{fieldErrors.customerPhone}</p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="customerEmail">
                E-mail{" "}
                <span className="font-normal text-[var(--muted-foreground)]">(opcional)</span>
              </label>
              <Input
                id="customerEmail"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                autoComplete="email"
              />
              <p className="hint">Recebe a confirmação por escrito.</p>
              {fieldErrors.customerEmail && (
                <p className="error">{fieldErrors.customerEmail}</p>
              )}
            </div>

            <div>
              <label className="label" htmlFor="notes">
                Alguma coisa que devemos saber?{" "}
                <span className="font-normal text-[var(--muted-foreground)]">(opcional)</span>
              </label>
              <Textarea
                id="notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="resize-y"
                placeholder="Aniversário, cadeirinha, restrição alimentar…"
              />
            </div>
          </div>

          {/* O último texto antes de decidir: na etapa 1 seria contexto que
              se rola sem ler, aqui é a condição sob a qual se confirma. */}
          <BookingNotice text={bookingNotice} className="mt-8" />

          {formError && (
            <div className="mt-6">
              <p ref={errorRef} tabIndex={-1} role="alert" className="msg-error">
                {formError}
              </p>
              <button
                type="button"
                onClick={backToCalendar}
                className="mt-2 text-sm font-medium text-[var(--primary)] underline underline-offset-4"
              >
                escolher outro dia
              </button>
            </div>
          )}

          <Button
            type="submit"
            size="lg" className="mt-8 w-full"
            disabled={submitting}
          >
            {submitting ? "Guardando a mesa…" : "Reservar a mesa"}
          </Button>
          <BackLink onClick={backToCalendar}>voltar</BackLink>
        </>
      )}
    </form>
  );
}

const STEPS = [
  { n: 1, label: "Dia e pessoas" },
  { n: 2, label: "Seus dados" },
] as const;

function BackLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto mt-4 block text-sm text-[var(--muted-foreground)] underline underline-offset-4 transition hover:text-[var(--foreground)]"
    >
      {children}
    </button>
  );
}

function peopleLabel(n: number): string {
  return `${n} ${n === 1 ? "pessoa" : "pessoas"}`;
}

/** "hoje, sábado, 3 de outubro", "amanhã, domingo, 4 de outubro" ou só a data. */
function quandoE(iso: string, hoje: string): string {
  const amanha = new Date(`${hoje}T00:00:00.000Z`);
  amanha.setUTCDate(amanha.getUTCDate() + 1);
  const rotulo = iso === hoje ? "hoje, " : iso === amanha.toISOString().slice(0, 10) ? "amanhã, " : "";
  return `${rotulo}${longDate(iso)}`;
}

/** "2026-08-30" -> "sábado, 30 de agosto", lido em UTC, sem deslocar o dia. */
function longDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const weekday = [
    "domingo",
    "segunda",
    "terça",
    "quarta",
    "quinta",
    "sexta",
    "sábado",
  ][d.getUTCDay()];
  return `${weekday}, ${d.getUTCDate()} de ${MONTH_NAMES[d.getUTCMonth()]}`;
}
