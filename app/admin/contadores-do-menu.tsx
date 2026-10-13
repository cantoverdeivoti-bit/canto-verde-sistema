"use client";

import { createContext, Suspense, use, useContext } from "react";

/** Os números ao lado das seções do menu, por chave (`ModuleSection.contador`). */
export type Contadores = Partial<Record<"pendencias" | "cadastrosPendentes" | "sugestoesBuffet" | "treinamentosPendentes", number>>;

const Contexto = createContext<Promise<Contadores>>(Promise.resolve({}));

/**
 * Leva os números do layout (servidor, que sabe contar) aos módulos do menu
 * (cliente, na lateral do computador e no painel do celular), sem passar por
 * cada componente no meio.
 *
 * Chega como promessa, e não como número pronto: contar as pendências são
 * sete consultas, e esperar por elas segurava a tela inteira (até o
 * "carregando") em toda navegação. Agora a tela aparece e o número chega
 * depois, sozinho, quando a conta termina.
 */
export function ContadoresDoMenu({ valor, children }: { valor: Promise<Contadores>; children: React.ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** A promessa dos números, para quem soma vários (o sino do topo). */
export const useContadores = () => useContext(Contexto);

/**
 * O número de uma seção do menu, quando há o que contar. Nada enquanto conta.
 * `className` troca o lugar dele (na barra de baixo, preso no canto do símbolo).
 */
export function NumeroDoMenu({ chave, className = "ml-auto" }: { chave: keyof Contadores; className?: string }) {
  return (
    <Suspense fallback={null}>
      <Numero chave={chave} className={className} />
    </Suspense>
  );
}

function Numero({ chave, className }: { chave: keyof Contadores; className: string }) {
  const n = use(useContext(Contexto))[chave] ?? 0;
  if (n <= 0) return null;
  return (
    <span className={`${className} inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--botao)] px-1.5 text-[11px] leading-5 font-semibold text-[var(--botao-texto)]`}>
      {n}
    </span>
  );
}
