"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import type { Ref } from "react";

import { IconeNav } from "@/components/icone-nav";
import { atalhoAtivo, type AtalhoDaBarra } from "@/lib/barra-de-baixo";

import { NumeroDoMenu } from "./contadores-do-menu";

// O símbolo é sempre verde, como nos quadrados. A casa da tela atual ganha o
// nome em verde e um traço em cima.
const CASA =
  "relative flex h-16 min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-[11px] leading-tight font-medium transition active:scale-95";
const AQUI =
  "font-semibold text-[var(--primary)] before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-full before:bg-[var(--primary)]";
const FORA = "text-[var(--muted-foreground)]";

/**
 * A barra de baixo do celular, como a de app de loja: os quatro atalhos que
 * a pessoa escolheu e, no canto direito, o "Menu", que abre o menu lateral
 * (pela direita, do lado do polegar). No computador ela não existe: a coluna
 * da esquerda faz esse papel.
 *
 * Mora dentro do `Sidebar`, que guarda o estado do menu aberto, e fora do
 * `@container` do layout: dentro dele o `fixed` ficaria preso ao contêiner.
 * A classe `barra-de-baixo` liga a variável `--barra-de-baixo` (globals.css),
 * que faz o que também fica preso embaixo subir acima dela.
 */
export function BarraDeBaixo({
  atalhos,
  caminho,
  moduloAtual,
  menuAberto,
  aoAbrirMenu,
  menuRef,
}: {
  atalhos: AtalhoDaBarra[];
  caminho: string;
  moduloAtual?: string;
  menuAberto: boolean;
  aoAbrirMenu: () => void;
  menuRef: Ref<HTMLButtonElement>;
}) {
  const ativo = menuAberto ? null : atalhoAtivo(atalhos, caminho, moduloAtual);
  return (
    <nav
      aria-label="Atalhos"
      className="barra-de-baixo fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--card)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-[0_-1px_6px_rgb(0_0_0/0.06)] lg:hidden print:hidden"
    >
      <ul className="grid grid-cols-5">
        {atalhos.map((a) => {
          const aqui = a.chave === ativo;
          return (
            <li key={a.chave} className="min-w-0">
              <Link
                href={a.href}
                aria-current={aqui ? "page" : undefined}
                className={`${CASA} ${aqui ? AQUI : FORA}`}
              >
                <span className="relative">
                  <IconeNav nome={a.icone} className="size-6 text-[var(--primary)]" />
                  {a.contador && <NumeroDoMenu chave={a.contador} className="absolute -top-1.5 left-3.5" />}
                </span>
                <span className="max-w-full truncate">{a.nome}</span>
              </Link>
            </li>
          );
        })}
        {/* O Menu fica sempre na quinta casa, mesmo com menos atalhos. */}
        <li className="col-start-5 min-w-0">
          <button
            ref={menuRef}
            type="button"
            onClick={aoAbrirMenu}
            aria-expanded={menuAberto}
            aria-haspopup="dialog"
            className={`${CASA} w-full ${menuAberto ? AQUI : FORA}`}
          >
            <Menu aria-hidden className="size-6 text-[var(--primary)]" />
            <span>Menu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
