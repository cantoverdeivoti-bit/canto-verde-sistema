import { ChevronRight, Circle, CircleCheck } from "lucide-react";
import Link from "next/link";

import { IconeNav } from "@/components/icone-nav";
import type { ItemParaFazer } from "@/lib/para-fazer";

/**
 * O cartão "Para fazer hoje" da página inicial: as tarefas da pessoa e o que
 * os módulos pedem no dia, numa lista só. O que falta fica em cima; o que já
 * foi feito desce para uma linha que abre, riscado.
 */
export function ParaFazerHoje({ itens }: { itens: ItemParaFazer[] }) {
  const faltam = itens.filter((i) => !i.feito);
  const feitos = itens.filter((i) => i.feito);

  return (
    <section aria-labelledby="titulo-para-fazer" className="mt-8">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="titulo-para-fazer" className="section-label">
          Para fazer hoje
        </h2>
        {itens.length > 0 && (
          <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
            {feitos.length} de {itens.length} {itens.length === 1 ? "feita" : "feitas"}
          </span>
        )}
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {faltam.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[var(--muted-foreground)]">
            {itens.length === 0 ? "Nada marcado para hoje." : "Tudo feito por hoje."}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {faltam.map((i) => (
              <Linha key={i.chave} item={i} />
            ))}
          </ul>
        )}
        {feitos.length > 0 && (
          <details className="group border-t border-[var(--border)]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm text-[var(--muted-foreground)] [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-4 transition-transform group-open:rotate-90" />
              {feitos.length === 1 ? "1 feita hoje" : `${feitos.length} feitas hoje`}
            </summary>
            <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
              {feitos.map((i) => (
                <Linha key={i.chave} item={i} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function Linha({ item: i }: { item: ItemParaFazer }) {
  return (
    <li>
      <Link href={i.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--muted)]">
        {i.feito ? (
          <CircleCheck aria-label="feito" className="size-5 shrink-0" style={{ color: "var(--ok-strong)" }} />
        ) : (
          <Circle
            aria-label={i.atrasado ? "atrasado" : "a fazer"}
            className="size-5 shrink-0"
            style={{ color: i.atrasado ? "var(--destructive)" : "var(--muted-foreground)" }}
          />
        )}
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-sm font-medium ${i.feito ? "text-[var(--muted-foreground)] line-through" : ""}`}>
            {i.titulo}
          </span>
          {(i.detalhe || i.atrasado) && (
            <span className="block truncate text-xs text-[var(--muted-foreground)]">
              {i.atrasado && (
                <span className="font-semibold" style={{ color: "var(--destructive)" }}>
                  atrasado{i.detalhe ? " · " : ""}
                </span>
              )}
              {i.detalhe}
            </span>
          )}
        </span>
        <IconeNav nome={i.icone} className="size-4 shrink-0 text-[var(--muted-foreground)]" />
      </Link>
    </li>
  );
}
