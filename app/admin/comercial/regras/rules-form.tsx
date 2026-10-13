"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useTransition } from "react";

import { updateRules } from "@/lib/actions/settings";

import { SaveRow } from "../../save-button";

type Values = {
  isActive: boolean;
  maxAdvanceValue: number;
  maxAdvanceUnit: string;
  minAdvanceValue: number;
  minAdvanceUnit: string;
  delayToleranceMinutes: number;
  minPartySize: number;
  maxPartySize: number;
  autoApproveUpTo: number;
  manualIfOverLimit: boolean;
  waitlistEnabled: boolean;
  bookingNotice: string;
  endereco: string;
  whatsapp: string;
  sobreACasa: string;
  fotoUrl: string;
};

const UNITS = [
  ["MINUTES", "minutos"],
  ["HOURS", "horas"],
  ["DAYS", "dias"],
  ["WEEKS", "semanas"],
  ["MONTHS", "meses"],
] as const;

export function RulesForm({ initial }: { initial: Values }) {
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
      const result = await updateRules(values);
      setError(result.ok ? null : (result.message ?? "Falhou."));
      setSaved(result.ok);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={values.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
          className="h-4 w-4"
        />
        <span className="text-sm font-medium">Reservas online ativas</span>
      </label>

      <fieldset className="space-y-3">
        <legend className="label">Antecedência</legend>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-40 text-[var(--muted-foreground)]">Reservar com pelo menos</span>
          <Input
            type="number"
            min={0}
            value={values.minAdvanceValue}
            onChange={(e) => set("minAdvanceValue", Number(e.target.value))}
            className="w-20"
          />
          <select
            value={values.minAdvanceUnit}
            onChange={(e) => set("minAdvanceUnit", e.target.value)}
            className="w-32"
          >
            {UNITS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="w-40 text-[var(--muted-foreground)]">Reservar com no máximo</span>
          <Input
            type="number"
            min={1}
            value={values.maxAdvanceValue}
            onChange={(e) => set("maxAdvanceValue", Number(e.target.value))}
            className="w-20"
          />
          <select
            value={values.maxAdvanceUnit}
            onChange={(e) => set("maxAdvanceUnit", e.target.value)}
            className="w-32"
          >
            {UNITS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="label">Grupos e aprovação</legend>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-[var(--muted-foreground)]">Mínimo</span>
            <Input
              type="number"
              min={1}
              value={values.minPartySize}
              onChange={(e) => set("minPartySize", Number(e.target.value))}
              
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[var(--muted-foreground)]">Máximo</span>
            <Input
              type="number"
              min={1}
              value={values.maxPartySize}
              onChange={(e) => set("maxPartySize", Number(e.target.value))}
              
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[var(--muted-foreground)]">Confirma sozinho até</span>
            <Input
              type="number"
              min={1}
              value={values.autoApproveUpTo}
              onChange={(e) => set("autoApproveUpTo", Number(e.target.value))}
              
            />
          </label>
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={values.manualIfOverLimit}
            onChange={(e) => set("manualIfOverLimit", e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span className="text-sm">
            Grupos acima de {values.autoApproveUpTo} pessoas entram como{" "}
            <strong>pendentes</strong> para eu aprovar
            <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
              Desligado, esses grupos são recusados na hora — você nem fica
              sabendo que tentaram.
            </span>
          </span>
        </label>
      </fieldset>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Tolerância de atraso (minutos)</span>
        <Input
          type="number"
          min={0}
          max={240}
          value={values.delayToleranceMinutes}
          onChange={(e) => set("delayToleranceMinutes", Number(e.target.value))}
          className="w-28"
        />
        <span className="hint">
          Passado esse tempo, a agenda destaca a reserva como atrasada.
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={values.waitlistEnabled}
          onChange={(e) => set("waitlistEnabled", e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span className="text-sm">
          Mencionar fila de espera na página pública
          <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
            Ligue apenas se vocês realmente mantêm uma fila — a página só
            promete o que está ativo aqui.
          </span>
        </span>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Aviso antes de reservar</span>
        <Textarea
          rows={6}
          maxLength={2000}
          value={values.bookingNotice}
          onChange={(e) => set("bookingNotice", e.target.value)}
          className="resize-y"
          placeholder={NOTICE_PLACEHOLDER}
        />
        <span className="hint">
          Aparece na última etapa da reserva e na página da reserva feita. As
          quebras de linha são respeitadas; a primeira linha costuma ser o
          título. Em branco, nenhum aviso é mostrado.
        </span>
      </label>

      {/* O que a página de reserva mostra da casa. Quem chega pelo Instagram
          via só o calendário: nem onde fica, nem como falar com a casa. */}
      <fieldset className="space-y-4">
        <legend className="label">Página de reserva</legend>
        <p className="hint mt-0">
          Aparece no topo da página de reserva e na confirmação. Em branco, a linha não aparece.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Uma frase sobre o almoço</span>
          <Input
            value={values.sobreACasa}
            maxLength={200}
            onChange={(e) => set("sobreACasa", e.target.value)}
            placeholder="Buffet livre com churrasco, de segunda a domingo"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Endereço</span>
          <Input
            value={values.endereco}
            maxLength={200}
            onChange={(e) => set("endereco", e.target.value)}
            placeholder="Rua Exemplo, 123, Centro, Ivoti/RS"
            autoComplete="street-address"
          />
          <span className="hint">O botão &quot;Como chegar&quot; abre o mapa com este endereço.</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">WhatsApp da casa</span>
          <Input
            value={values.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
            placeholder="(51) 99999-9999"
            inputMode="tel"
          />
          <span className="hint">Para o cliente falar com vocês e avisar atraso.</span>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Foto da casa (link)</span>
          <Input
            value={values.fotoUrl}
            maxLength={500}
            onChange={(e) => set("fotoUrl", e.target.value)}
            placeholder="https://…"
            inputMode="url"
          />
          <span className="hint">Um link de imagem que começa com https://. Também vai na prévia do link no WhatsApp.</span>
        </label>
      </fieldset>

      <SaveRow pending={pending} error={error} saved={saved} />
    </form>
  );
}

const NOTICE_PLACEHOLDER = `ATENÇÃO — leia antes de reservar
A mesa será liberada mediante a presença de todo o grupo dentro do horário de tolerância.`;
