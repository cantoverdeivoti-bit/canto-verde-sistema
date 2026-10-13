"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { formatarQuantoFalta } from "@/lib/format";

/**
 * O relógio de quanto falta até um prazo: "Faltam 3 h 20 min".
 *
 * A data sozinha obriga a fazer a conta de cabeça ("hoje é que dia?"); o
 * tempo que falta responde a pergunta que importa, e muda sozinho a cada
 * meio minuto. Perto do fim (`urgenteEm`) fica vermelho. Vencido, diz
 * "Prazo encerrado" — e quem precisa reagir a isso recebe `aoTerminar`.
 */
export function TempoRestante({
  fimIso,
  urgenteEm = 2 * 60 * 60 * 1000,
  aoTerminar,
  className = "",
}: {
  fimIso: string;
  /** Quanto antes do fim a cor vira vermelha. Duas horas, se nada disser. */
  urgenteEm?: number;
  aoTerminar?: () => void;
  className?: string;
}) {
  const fim = new Date(fimIso).getTime();
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setAgora(t);
      if (t >= fim) {
        clearInterval(id);
        aoTerminar?.();
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [fim, aoTerminar]);

  const falta = fim - agora;
  const acabou = falta <= 0;
  const cor = acabou || falta < urgenteEm ? "text-[var(--destructive)]" : "text-[var(--warn)]";

  return (
    <span
      suppressHydrationWarning
      className={`inline-flex items-center gap-1 font-semibold ${cor} ${className}`}
    >
      <Clock aria-hidden className="size-4 shrink-0" />
      {acabou ? "Prazo encerrado" : `Faltam ${formatarQuantoFalta(falta)}`}
    </span>
  );
}
