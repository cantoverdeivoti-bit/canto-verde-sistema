"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState, useTransition } from "react";

import { addSpecialDate, removeSpecialDate } from "@/lib/actions/settings";
import { formatDateString } from "@/lib/format";

type Item = {
  id: number;
  date: string;
  isClosed: boolean;
  opensAt: string | null;
  closesAt: string | null;
  capacityOverride: number | null;
  note: string | null;
  isPast: boolean;
};

export function SpecialDates({ items }: { items: Item[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [isClosed, setIsClosed] = useState(true);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [capacityOverride, setCapacityOverride] = useState("");
  const [note, setNote] = useState("");

  function onAdd(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await addSpecialDate({
        date,
        isClosed,
        opensAt,
        closesAt,
        capacityOverride: capacityOverride ? Number(capacityOverride) : null,
        note,
      });
      if (result.ok) {
        setDate("");
        setNote("");
        setCapacityOverride("");
      } else {
        setError(result.message ?? "Falhou.");
      }
    });
  }

  function onRemove(id: number) {
    startTransition(async () => {
      await removeSpecialDate(id);
    });
  }

  return (
    <div className="space-y-5">
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm ${
                item.isPast ? "opacity-50" : ""
              }`}
            >
              <span className="font-medium tabular-nums">{item.date}</span>
              <span className="text-[var(--muted-foreground)]">
                {formatDateString(item.date)}
              </span>
              <span>
                {item.isClosed
                  ? "Fechado"
                  : `${item.opensAt}–${item.closesAt}`}
                {item.capacityOverride
                  ? ` · lotação ${item.capacityOverride}`
                  : ""}
              </span>
              {item.note && (
                <span className="text-[var(--muted-foreground)]">({item.note})</span>
              )}
              {item.isPast && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  já passou — ignorada
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                disabled={pending}
                className="ml-auto text-xs text-[var(--muted-foreground)] transition hover:text-[var(--destructive)]"
              >
                remover
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-[var(--muted-foreground)]">Data</span>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-auto py-1.5"
            required
          />
        </label>

        <label className="text-sm">
          <span className="mb-1 block text-[var(--muted-foreground)]">Situação</span>
          <select
            value={isClosed ? "closed" : "special"}
            onChange={(e) => setIsClosed(e.target.value === "closed")}
            className="w-auto py-1.5"
          >
            <option value="closed">Fechado o dia todo</option>
            <option value="special">Horário/lotação especial</option>
          </select>
        </label>

        {!isClosed && (
          <>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted-foreground)]">Abre</span>
              <Input
                type="time"
                value={opensAt}
                onChange={(e) => setOpensAt(e.target.value)}
                className="w-auto py-1.5"
                required={!isClosed}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted-foreground)]">Fecha</span>
              <Input
                type="time"
                value={closesAt}
                onChange={(e) => setClosesAt(e.target.value)}
                className="w-auto py-1.5"
                required={!isClosed}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-[var(--muted-foreground)]">Lotação</span>
              <Input
                type="number"
                min={1}
                value={capacityOverride}
                onChange={(e) => setCapacityOverride(e.target.value)}
                placeholder="normal"
                className="w-24 py-1.5"
              />
            </label>
          </>
        )}

        <label className="text-sm">
          <span className="mb-1 block text-[var(--muted-foreground)]">Motivo</span>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ex.: Natal"
            className="w-36 py-1.5"
          />
        </label>

        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          Adicionar
        </Button>
      </form>

      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--destructive)]">
          {error}
        </p>
      )}
    </div>
  );
}
