"use client";

import { Input } from "@/components/ui/input";
import { useState, useTransition } from "react";

import { updateCapacity } from "@/lib/actions/settings";

import { SaveRow } from "../../save-button";

type Values = {
  name: string;
  timezone: string;
  totalCapacity: number;
  defaultDurationMinutes: number;
  bufferMinutes: number;
  slotIntervalMinutes: number;
  minSlotsWarningThreshold: number;
};

export function CapacityForm({ initial }: { initial: Values }) {
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
      const result = await updateCapacity(values);
      setError(result.ok ? null : (result.message ?? "Falhou."));
      setSaved(result.ok);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* O nome da casa saiu daqui, mas continua sendo enviado intacto no
          `values`: a coluna é obrigatória, e esta tela é sobre quantos
          lugares existem e quando o salão abre — o nome não muda nunca e
          não pertence a uma tela de capacidade. */}

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Lugares no salão</span>
        <Input
          type="number"
          min={1}
          value={values.totalCapacity}
          onChange={(e) => set("totalCapacity", Number(e.target.value))}
          className="w-28"
          required
        />
        <span className="hint mt-1 block">
          O total de pessoas que cabem ao mesmo tempo. As reservas nunca passam
          deste número.
        </span>
      </label>

      {/* Duração da mesa, folga, intervalo de horários e limiar de alerta
          continuam existindo no motor (values os reenvia intactos), mas
          saíram da tela a pedido do dono: com assento único às 11:30, são
          botões técnicos que só confundem. Se o modelo de serviço mudar,
          reexpor os campos é descomentar o bloco no histórico do git. */}

      <SaveRow pending={pending} error={error} saved={saved} />
    </form>
  );
}
