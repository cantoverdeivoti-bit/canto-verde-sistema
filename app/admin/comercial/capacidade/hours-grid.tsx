"use client";

import { Input } from "@/components/ui/input";
import { useState, useTransition } from "react";

import { updateBusinessHours } from "@/lib/actions/settings";

import { SaveRow } from "../../save-button";

type Row = {
  dayOfWeek: number;
  shiftName: string;
  opensAt: string;
  closesAt: string;
  isActive: boolean;
};

const DAY_NAMES = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

/** Cabeçalho das colunas. Mesmas abreviações do calendário da agenda. */
const DAY_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export function HoursGrid({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(index: number, patch: Partial<Row>) {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, ...patch } : row)));
    setSaved(false);
  }

  function remove(index: number) {
    setRows((r) => r.filter((_, i) => i !== index));
    setSaved(false);
  }

  function addShift(day: number) {
    setRows((r) => [
      ...r,
      { dayOfWeek: day, shiftName: "", opensAt: "18:30", closesAt: "23:00", isActive: true },
    ]);
    setSaved(false);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateBusinessHours(
        rows.map((r) => ({ ...r, shiftName: r.shiftName || undefined })),
      );
      setError(result.ok ? null : (result.message ?? "Falhou."));
      setSaved(result.ok);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* A semana deitada: um dia por coluna, os turnos empilhados dentro
          dela. Empilhada na vertical, a grade obrigava a rolar sete blocos
          para responder "a gente abre no domingo?" — deitada, a semana
          inteira cabe num olhar, que é a pergunta que esta tela existe para
          responder.

          Sete colunas não cabem em tela de celular, e espremê-las deixaria
          os campos de hora impossíveis de tocar. Por isso a grade tem
          largura mínima e rola na horizontal dentro da própria caixa, sem
          empurrar a página junto. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-2">
        {/* 54rem não é número redondo à toa: abaixo disso a coluna aperta o
            campo de hora e o navegador corta o texto, e "11:3" com o
            relógio do lado é pior que rolar um pouco. */}
        <div className="grid min-w-[54rem] grid-cols-7 gap-2">
          {Array.from({ length: 7 }, (_, day) => {
            const dayRows = rows
              .map((row, index) => ({ row, index }))
              .filter(({ row }) => row.dayOfWeek === day);

            return (
              <div
                key={day}
                className="rounded-md border border-[var(--border)] p-2"
              >
                <p className="mb-2 text-center text-xs font-semibold tracking-wider text-[var(--muted-foreground)]">
                  {DAY_SHORT[day]}
                </p>

                {dayRows.length === 0 && (
                  <p className="py-1 text-center text-xs text-[var(--muted-foreground)]">
                    Fechado
                  </p>
                )}

                {dayRows.map(({ row, index }) => (
                  <div
                    key={index}
                    className="mb-2 space-y-1 border-b border-dotted border-[var(--border)] pb-2 last:border-0"
                  >
                    <Input
                      type="time"
                      value={row.opensAt}
                      onChange={(e) => update(index, { opensAt: e.target.value })}
                      className="w-full px-1 py-1 text-center"
                      aria-label={`${DAY_NAMES[day]} abre às`}
                    />
                    <Input
                      type="time"
                      value={row.closesAt}
                      onChange={(e) => update(index, { closesAt: e.target.value })}
                      className="w-full px-1 py-1 text-center"
                      aria-label={`${DAY_NAMES[day]} fecha às`}
                    />
                    <Input
                      value={row.shiftName}
                      onChange={(e) => update(index, { shiftName: e.target.value })}
                      placeholder="nome"
                      className="w-full px-1 py-1 text-center text-xs"
                      aria-label={`Nome do turno de ${DAY_NAMES[day]}`}
                    />
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="block w-full text-center text-xs text-[var(--muted-foreground)] transition hover:text-[var(--destructive)]"
                      aria-label={`Remover turno de ${DAY_NAMES[day]}`}
                    >
                      remover
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => addShift(day)}
                  className="block w-full text-center text-xs font-medium text-[var(--primary)] hover:underline"
                  aria-label={`Adicionar turno em ${DAY_NAMES[day]}`}
                >
                  + turno
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <SaveRow pending={pending} error={error} saved={saved} />
    </form>
  );
}
