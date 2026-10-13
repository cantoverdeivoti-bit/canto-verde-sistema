"use client";

import { Input } from "@/components/ui/input";
import { useState, useTransition } from "react";

import { updateNotifications } from "@/lib/actions/settings";

import { SaveRow } from "../../save-button";

type Values = {
  restaurantEmail: string;
  notifyRestaurant: boolean;
  notifyCustomer: boolean;
  channel: string;
  sendReminderHours: number | null;
};

export function NotificationsForm({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof Values>(key: K, value: Values[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setSaved(false);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateNotifications(values);
      setError(result.ok ? null : (result.message ?? "Falhou."));
      setSaved(result.ok);
    });
  }

  const manual = values.channel === "MANUAL";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Canal</span>
        <select
          value={values.channel}
          onChange={(e) => set("channel", e.target.value)}
          className="w-auto"
        >
          <option value="EMAIL_AUTO">E-mail automático</option>
          <option value="MANUAL">Aviso manual (a equipe manda)</option>
        </select>
        {manual && (
          <span className="mt-1 block text-xs font-medium text-[var(--warn)]">
            Atenção: com aviso manual e confirmação automática, a reserva
            confirma sozinha mas alguém precisa lembrar de avisar o cliente.
            Esse vão é a origem mais comum de no-show.
          </span>
        )}
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">E-mail do restaurante</span>
        <Input
          type="email"
          value={values.restaurantEmail}
          onChange={(e) => set("restaurantEmail", e.target.value)}
          
          required
        />
        <span className="hint">Recebe o aviso de cada reserva nova.</span>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={values.notifyRestaurant}
          onChange={(e) => set("notifyRestaurant", e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm">Avisar o restaurante a cada reserva</span>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={values.notifyCustomer}
          onChange={(e) => set("notifyCustomer", e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm">
          Enviar confirmação ao cliente (quando ele informar e-mail)
        </span>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Lembrete ao cliente</span>
        <select
          value={values.sendReminderHours === null ? "" : String(values.sendReminderHours)}
          onChange={(e) =>
            set(
              "sendReminderHours",
              e.target.value === "" ? null : Number(e.target.value),
            )
          }
          className="w-auto"
        >
          <option value="">Sem lembrete</option>
          <option value="24">24 horas antes</option>
          <option value="48">48 horas antes</option>
        </select>
        <span className="hint">
          Previsto para versão futura — o valor fica salvo, o envio ainda não é
          feito.
        </span>
      </label>

      <SaveRow pending={pending} error={error} saved={saved} />
    </form>
  );
}
