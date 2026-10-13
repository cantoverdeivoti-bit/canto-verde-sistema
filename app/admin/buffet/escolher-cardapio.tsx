import Link from "next/link";

import { ddmm } from "@/lib/buffet";

type Cardapio = { id: number; nome: string; inicio: string; fim: string };

/**
 * A troca de cardápio-modelo no topo das telas: um link por modelo, o que
 * vale hoje marcado. Com um só, nem aparece.
 */
export function EscolherCardapio({
  todos,
  atual,
  vigenteHoje,
  base,
  extra = "",
}: {
  todos: Cardapio[];
  atual: number;
  vigenteHoje: number | null;
  base: string;
  extra?: string;
}) {
  if (todos.length < 2) return null;
  return (
    <nav aria-label="Cardápios" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {todos.map((c) => (
        <Link
          key={c.id}
          href={`${base}?cardapio=${c.id}${extra}`}
          aria-current={c.id === atual ? "page" : undefined}
          className="chip shrink-0 px-3 py-1.5 text-xs"
        >
          {c.nome}
          <span className="ml-1 opacity-70">
            {ddmm(c.inicio)}–{ddmm(c.fim)}
            {c.id === vigenteHoje && " · vale hoje"}
          </span>
        </Link>
      ))}
    </nav>
  );
}
