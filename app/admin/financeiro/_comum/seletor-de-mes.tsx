import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { nomeDoMes } from "@/lib/financeiro";
import { somarMeses } from "@/lib/financeiro-calculo";

/** Mês anterior, o mês e o seguinte, pelo endereço (`?mes=2026-10`): dá para voltar e mandar o link. */
export function SeletorDeMes({
  caminho,
  mes,
  atual,
  rotuloDoAtual = "hoje",
}: {
  caminho: string;
  mes: string;
  /** O mês que a tela abre sem `?mes=`. */
  atual: string;
  rotuloDoAtual?: string;
}) {
  const link = (m: string) => (m === atual ? caminho : `${caminho}?mes=${m}`);
  return (
    <nav aria-label="Mês" className="flex items-center gap-1">
      <Link href={link(somarMeses(mes, -1))} aria-label="Mês anterior" className="flex size-10 items-center justify-center rounded-lg hover:bg-[var(--muted)]">
        <ChevronLeft aria-hidden className="size-4" />
      </Link>
      <span className="min-w-36 text-center text-sm font-semibold">{maiuscula(nomeDoMes(mes))}</span>
      <Link href={link(somarMeses(mes, 1))} aria-label="Mês seguinte" className="flex size-10 items-center justify-center rounded-lg hover:bg-[var(--muted)]">
        <ChevronRight aria-hidden className="size-4" />
      </Link>
      {mes !== atual && (
        <Link href={caminho} className="nav-link ml-1">
          {rotuloDoAtual}
        </Link>
      )}
    </nav>
  );
}

/** "outubro de 2026" vira "Outubro de 2026" (o `capitalize` do CSS faria "Outubro De 2026"). */
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** O `?mes=` do endereço, se for um mês de verdade; senão, o mês atual. */
export function mesDoEndereco(valor: string | string[] | undefined, atual: string): string {
  return typeof valor === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : atual;
}
