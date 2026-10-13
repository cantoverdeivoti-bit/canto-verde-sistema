"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { fetchSeatingTimes } from "@/lib/actions/availability";
import { createAdminReservation } from "@/lib/actions/reservations";
import { maskPhoneBR } from "@/lib/phone-mask";

/**
 * O telefone tocou. Formulário de balcão: rápido, sem as regras da página
 * pública. A HORA NÃO SE DIGITA — o serviço é assento único e o horário
 * deriva do dia escolhido (decisão do dono). Dia fechado bloqueia com aviso.
 */
export function NewReservation({ defaultDate, aoFechar }: { defaultDate: string; aoFechar: () => void }) {
  const router = useRouter();
  // Quem abre é o botão redondo da agenda (`acoes-do-dia.tsx`): o formulário
  // nasce aberto e, ao fechar, avisa quem o abriu.
  const open = true;
  const setOpen = (v: boolean) => {
    if (!v) aoFechar();
  };
  const [date, setDate] = useState(defaultDate);
  const [times, setTimes] = useState<string[] | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadingTimes, startLoadingTimes] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // A hora deriva do dia: escolheu a data, o horário do serviço aparece. A
  // hora antiga sai no próprio render da troca, e o efeito só busca a nova.
  const diaAberto = open ? date : null;
  const [diaAnterior, setDiaAnterior] = useState(diaAberto);
  if (diaAberto !== diaAnterior) {
    setDiaAnterior(diaAberto);
    if (diaAberto !== null) setTime(null);
  }

  useEffect(() => {
    if (!open) return;
    startLoadingTimes(async () => {
      const result = await fetchSeatingTimes(date);
      setTimes(result);
      if (result.length === 1) setTime(result[0]);
    });
  }, [date, open]);

  const closedDay = times !== null && times.length === 0;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await createAdminReservation({
        customerName: String(data.get("customerName") ?? ""),
        customerPhone: String(data.get("customerPhone") ?? ""),
        partySize: Number(data.get("partySize")),
        date,
        time: time ?? undefined,
        notes: String(data.get("notes") ?? ""),
      });

      if (result.ok) {
        form.reset();
        setOpen(false);
        router.refresh();
        return;
      }
      setError(result.message);
      setFieldErrors(result.fieldErrors ?? {});
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">Anotar reserva</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          fechar
        </button>
      </div>
      <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
        O horário é o do serviço do dia — só a lotação do salão é conferida.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Nome</span>
          <Input name="customerName"  autoFocus required />
          {fieldErrors.customerName && <span className="error">{fieldErrors.customerName}</span>}
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Telefone</span>
          <Input
            name="customerPhone"
            
            inputMode="tel"
            placeholder="(51) 99999-9999"
            onChange={(e) => {
              e.target.value = maskPhoneBR(e.target.value);
            }}
            required
          />
          {fieldErrors.customerPhone && <span className="error">{fieldErrors.customerPhone}</span>}
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Pessoas</span>
          <Input name="partySize" type="number" min={1} defaultValue={2}  required />
          {fieldErrors.partySize && <span className="error">{fieldErrors.partySize}</span>}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Data</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              
              required
            />
          </label>
          <div className="text-sm">
            <span className="mb-1 block font-medium">Horário</span>
            {loadingTimes || times === null ? (
              <p className="py-2.5 text-[var(--muted-foreground)]">…</p>
            ) : closedDay ? (
              <p className="py-2.5 text-xs font-semibold" style={{ color: "var(--warn)" }}>
                dia fechado
              </p>
            ) : times.length === 1 ? (
              <p className="num-display py-1.5 text-xl">{times[0]}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {times.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTime(t)}
                    aria-pressed={time === t}
                    className="chip px-2.5 py-1.5 text-sm"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium">
            Observações <span className="font-normal text-[var(--muted-foreground)]">(opcional)</span>
          </span>
          <Input name="notes"  placeholder="mesa perto da janela, aniversário…" />
        </label>
      </div>

      {closedDay && (
        <p className="msg-warn mt-3">
          Esse dia está marcado como fechado. Se for atender, abra-o em{" "}
          <a href="/admin/comercial/configuracoes" className="font-semibold underline underline-offset-2">
            Configurações de reservas
          </a>
          .
        </p>
      )}

      {error && (
        <p role="alert" className="msg-error mt-3">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg" className="mt-4"
        disabled={pending || closedDay || time === null}
      >
        {pending ? "Registrando…" : "Registrar"}
      </Button>
    </form>
  );
}
