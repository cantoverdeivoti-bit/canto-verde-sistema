"use client";

import { Clock } from "lucide-react";

import { TempoRestante } from "@/components/tempo-restante";

/**
 * O prazo no alto do link: até quando, e quanto falta.
 *
 * Quando zera, a página recarrega e mostra o aviso de prazo encerrado — o
 * servidor também recusa o envio, então não há como mandar depois da hora.
 */
export function PrazoDoLink({ prazoIso, texto }: { prazoIso: string; texto: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border-2 border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2.5">
      <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--warn)]" />
      <p className="text-base leading-snug">
        Você tem até <strong>{texto}</strong> para preencher.
        <TempoRestante
          fimIso={prazoIso}
          aoTerminar={recarregar}
          className="mt-0.5 flex text-sm [&>svg]:hidden"
        />
      </p>
    </div>
  );
}

function recarregar() {
  window.location.reload();
}
