"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { cancelByToken } from "@/lib/actions/reservations";

export function CancelConfirm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelByToken(token);
      if (result.ok) {
        // Recarrega a própria página — ela renderiza o estado "cancelada".
        router.refresh();
        return;
      }
      setError(
        result.reason === "TOO_LATE"
          ? "O horário já chegou: ligue para o restaurante."
          : "Não foi possível cancelar. Tente de novo ou ligue para o restaurante.",
      );
    });
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="inline-flex items-center justify-center rounded-lg px-5 py-3.5 text-[15px] font-semibold text-[var(--surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        style={{ background: "var(--destructive)" }}
      >
        {pending ? "Cancelando…" : "Cancelar a reserva"}
      </button>

      {error && (
        <p role="alert" className="msg-error mt-4">
          {error}
        </p>
      )}
    </div>
  );
}
