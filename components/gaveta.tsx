"use client";

import { useEffect, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A janela por cima da tela: no celular sobe de baixo, encostada no pé (é
 * onde o polegar está); no computador fica no meio. Fecha tocando fora ou
 * com Esc. Não sai na impressão.
 */
export function Gaveta({ rotulo, aoFechar, className, children }: { rotulo: string; aoFechar: () => void; className?: string; children: ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center print:hidden" onClick={aoFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={rotulo}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-[var(--card)] pb-[env(safe-area-inset-bottom)] shadow-xl sm:rounded-2xl sm:pb-0",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
