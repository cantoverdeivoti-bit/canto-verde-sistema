"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarPainelReservas } from "@/lib/actions/painel-reservas";

export function FormLink({ atual }: { atual?: string | null }) {
  const [estado, salvar, salvando] = useActionState(salvarPainelReservas, null);
  return (
    <form action={salvar} className="space-y-2">
      <label htmlFor="url" className="text-sm font-medium">
        Link do painel de reservas
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="url"
          name="url"
          type="url"
          defaultValue={atual ?? ""}
          placeholder="https://script.google.com/macros/s/…/exec?painel=…"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </div>
      {estado?.message && <p className="text-sm text-[var(--destructive)]">{estado.message}</p>}
      {estado?.ok && <p className="text-sm text-[var(--primary)]">Salvo.</p>}
    </form>
  );
}
