"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ddmm } from "@/lib/buffet";
import { DIAS_DA_SEMANA, diaDaSemanaBuffet } from "@/lib/buffet-regras";

const somar = (data: string, dias: number) => new Date(new Date(`${data}T12:00:00Z`).getTime() + dias * 86_400_000).toISOString().slice(0, 10);

/** O dia da tela: anterior, próximo, uma data qualquer e a volta para hoje. Vai no endereço (`?data=`). */
export function EscolherData({ data, hoje, base }: { data: string; hoje: string; base: string }) {
  const router = useRouter();
  const link = (d: string) => `${base}?data=${d}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <Link href={link(somar(data, -1))} aria-label="Dia anterior" className="flex size-11 items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <ChevronLeft aria-hidden className="size-5" />
        </Link>
        <label className="relative flex min-w-36 flex-col items-center px-2 py-1 text-center">
          <span className="text-sm font-semibold">
            {DIAS_DA_SEMANA[diaDaSemanaBuffet(data) - 1]}, {ddmm(data)}
          </span>
          <span className="text-[11px] text-[var(--muted-foreground)]">{data === hoje ? "hoje" : "trocar a data"}</span>
          <input
            type="date"
            value={data}
            onChange={(e) => e.target.value && router.push(link(e.target.value))}
            aria-label="Escolher a data"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <Link href={link(somar(data, 1))} aria-label="Dia seguinte" className="flex size-11 items-center justify-center text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <ChevronRight aria-hidden className="size-5" />
        </Link>
      </div>
      {data !== hoje && (
        <Link href={link(hoje)} className="chip px-3 py-1.5 text-sm">
          Hoje
        </Link>
      )}
    </div>
  );
}
