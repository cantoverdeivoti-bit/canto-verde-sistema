"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";

import { useAviso } from "@/components/aviso-do-topo";

/**
 * Botão de salvar + feedback, compartilhados pelas telas de configuração.
 *
 * Mora na raiz do painel, e não dentro de um módulo: comercial e compras usam
 * o mesmo, e um importar de dentro do outro criaria entre módulos a
 * dependência que o registro de lib/modules.ts promete não existir.
 */
export function SaveRow({
  pending,
  error,
  saved,
}: {
  pending: boolean;
  error: string | null;
  saved: boolean;
}) {
  // O "Salvo" vai para a faixa de baixo da tela (`components/aviso-do-topo.tsx`),
  // a mesma de todo o painel, e não fica mais solto ao lado do botão. Avisa
  // quando `saved` vira verdadeiro; a tela volta para falso ao salvar de novo.
  const mostrar = useAviso();
  useEffect(() => {
    if (saved) mostrar("Salvo");
  }, [saved, mostrar]);

  return (
    <div className="flex items-center gap-3">
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Salvando…" : "Salvar"}
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
