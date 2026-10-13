"use client";

import { Input } from "@/components/ui/input";
import { useEffect, useState, useTransition } from "react";

import { fetchSeatingTimes } from "@/lib/actions/availability";
import {
  updateReservationDetails,
  updateReservationStatus,
} from "@/lib/actions/reservations";
import type { ReservationStatus } from "@/generated/prisma/client";

type Props = {
  id: string;
  status: ReservationStatus;
  customerName: string;
  /** Valores atuais, para o formulário de edição inline. */
  partySize: number;
  date: string;
  time: string;
  notes: string;
};

type PendingAction = {
  label: string;
  question: string;
  confirmLabel: string;
  status: ReservationStatus;
  danger?: boolean;
};

/**
 * Ações por estado da reserva. Confirmação é inline — nada de diálogo do
 * navegador, nada de modal.
 *
 * A casa não controla comparecimento: uma reserva é o registro de que
 * alguém pediu lugar, e ninguém volta na tela depois do almoço para dizer
 * quem sentou. Por isso não há "chegou" nem "não veio" — havia, e viravam
 * dois botões que ninguém apertava, deixando toda reserva passada parecendo
 * pendente de uma conferência que não acontece.
 */
function actionsFor(status: ReservationStatus): PendingAction[] {
  if (status === "PENDING") {
    return [
      {
        label: "Aprovar",
        question: "Aprovar esta reserva?",
        confirmLabel: "Sim, aprovar",
        status: "CONFIRMED",
      },
      {
        label: "Recusar",
        question: "Recusar e liberar os lugares?",
        confirmLabel: "Sim, recusar",
        status: "CANCELLED",
        danger: true,
      },
    ];
  }

  if (status === "CONFIRMED") {
    // Cancelar vale antes e depois do horário: quem avisa que não vem às
    // vezes avisa tarde, e a reserva de ontem cancelada hoje continua sendo
    // a informação certa sobre aquele dia.
    return [
      {
        label: "Cancelar",
        question: "Cancelar e liberar os lugares?",
        confirmLabel: "Sim, cancelar",
        status: "CANCELLED",
        danger: true,
      },
    ];
  }

  // Encerradas: só reativar.
  return [
    {
      label: "Reativar",
      question: "Reativar? Volta a ocupar lugares no salão.",
      confirmLabel: "Sim, reativar",
      status: "CONFIRMED",
    },
  ];
}

export function ReservationActions({
  id,
  status,
  customerName,
  partySize,
  date,
  notes,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<PendingAction | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A hora deriva do dia — na edição também não se digita hora: mudou a
  // data, o horário do serviço daquele dia aparece ao lado (só leitura).
  const [editDate, setEditDate] = useState(date);
  const [editTimes, setEditTimes] = useState<string[] | null>(null);

  // Os horários antigos saem no render em que o dia (ou a edição) muda; o
  // efeito só busca os novos.
  const diaEditado = editing ? editDate : null;
  const [diaEditadoAnterior, setDiaEditadoAnterior] = useState(diaEditado);
  if (diaEditado !== diaEditadoAnterior) {
    setDiaEditadoAnterior(diaEditado);
    if (diaEditado !== null) setEditTimes(null);
  }

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    fetchSeatingTimes(editDate).then((t) => {
      if (!cancelled) setEditTimes(t);
    });
    return () => {
      cancelled = true;
    };
  }, [editing, editDate]);

  function run(action: PendingAction) {
    setError(null);
    startTransition(async () => {
      const result = await updateReservationStatus(id, action.status);
      if (!result.ok) setError(result.message ?? "Falhou.");
      setConfirming(null);
    });
  }

  function onEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await updateReservationDetails(id, {
        partySize: Number(data.get("partySize")),
        date: String(data.get("date")),
        notes: String(data.get("notes") ?? ""),
      });
      if (result.ok) setEditing(false);
      else setError(result.message);
    });
  }

  if (editing) {
    const closedDay = editTimes !== null && editTimes.length === 0;
    return (
      <form
        onSubmit={onEditSubmit}
        className="flex w-full flex-wrap items-end gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 sm:w-auto"
      >
        <label className="text-xs">
          <span className="mb-1 block font-medium">Pessoas</span>
          <Input name="partySize" type="number" min={1} defaultValue={partySize} className="w-16 py-1" required />
        </label>
        <label className="text-xs">
          <span className="mb-1 block font-medium">Data</span>
          <Input
            name="date"
            type="date"
            value={editDate}
            onChange={(e) => setEditDate(e.target.value)}
            className="w-auto py-1"
            required
          />
        </label>
        <div className="text-xs">
          <span className="mb-1 block font-medium">Horário</span>
          {editTimes === null ? (
            <p className="py-1 text-[var(--muted-foreground)]">…</p>
          ) : closedDay ? (
            <p className="py-1 font-semibold" style={{ color: "var(--warn)" }}>
              dia fechado
            </p>
          ) : (
            <p className="num-display py-0.5 text-lg">{editTimes[0]}</p>
          )}
        </div>
        <label className="text-xs">
          <span className="mb-1 block font-medium">Observações</span>
          <Input name="notes" defaultValue={notes} className="w-40 py-1" />
        </label>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={pending || closedDay} className="rounded-md bg-[var(--botao)] px-3 py-1.5 text-sm font-semibold text-[var(--botao-texto)] transition hover:opacity-90 disabled:opacity-40">
            {pending ? "…" : "Salvar"}
          </button>
          <button type="button" onClick={() => { setEditing(false); setEditDate(date); setError(null); }} className="px-1 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            voltar
          </button>
        </div>
        {error && (
          <p className="w-full text-xs font-medium" style={{ color: "var(--destructive)" }}>
            {error}
          </p>
        )}
      </form>
    );
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1.5 text-sm">
        <p className="text-right text-[var(--muted-foreground)]">
          {confirming.question.replace("esta reserva", `a de ${customerName}`)}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => run(confirming)}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-[var(--surface)] transition hover:opacity-90 disabled:opacity-40"
            style={{
              background: confirming.danger ? "var(--destructive)" : "var(--primary)",
            }}
          >
            {pending ? "…" : confirming.confirmLabel}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            disabled={pending}
            className="px-2 py-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          >
            voltar
          </button>
        </div>
      </div>
    );
  }

  const editable = status === "CONFIRMED" || status === "PENDING";

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-3">
        {editable && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={pending}
            className="-my-1 py-1 text-sm font-medium text-[var(--primary)] underline-offset-4 transition hover:underline disabled:opacity-40"
          >
            Editar
          </button>
        )}
        {actionsFor(status).map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => setConfirming(action)}
            disabled={pending}
            className={`-my-1 py-1 text-sm font-medium underline-offset-4 transition hover:underline disabled:opacity-40 ${
              action.danger ? "" : "text-[var(--primary)]"
            }`}
            style={action.danger ? { color: "var(--destructive)" } : undefined}
          >
            {action.label}
          </button>
        ))}
      </div>
      {error && (
        <p className="max-w-56 text-right text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
