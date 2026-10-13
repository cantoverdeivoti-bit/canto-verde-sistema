import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { AjudaDoTopo } from "./ajuda-do-topo";

/**
 * As peças de toda tela do painel, para as telas terem a mesma cara: a
 * largura, o cabeçalho (voltar, título, ações e explicação), a caixa de
 * "não tem nada aqui" e a lista em cartão. Antes cada tela montava a sua, e
 * eram sete larguras, onze cabeçalhos e seis telas vazias diferentes.
 */

/** A largura da tela. O painel já não passa de `max-w-4xl` (`app/admin/layout.tsx`). */
const LARGURAS = {
  /** Formulário, detalhe e atalhos. */
  estreita: "max-w-2xl",
  /** Listas. */
  media: "max-w-3xl",
  /** Painéis, relatórios e telas largas. */
  larga: "max-w-4xl",
} as const;

export function Pagina({ largura = "media", className, children }: { largura?: keyof typeof LARGURAS; className?: string; children: ReactNode }) {
  return <div className={cn(LARGURAS[largura], "space-y-5", className)}>{children}</div>;
}

/**
 * O alto da tela: o "‹ voltar" (quando a tela é um detalhe), o título com as
 * ações à direita, e embaixo uma frase que explica a tela. O tamanho do
 * título vem do `globals.css`, igual em todas.
 *
 * Fica sobre a faixa verde que desce da barra do alto (`.cabecalho-verde`):
 * por isso tem de ser a primeira coisa da tela. Dentro dela valem as cores
 * da faixa (`.faixa-escura`), e as ações (botões, setas) se ajustam sozinhas.
 */
export function CabecalhoDaPagina({
  titulo,
  subtitulo,
  voltar,
  acoes,
  rotulo,
  ajuda,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** O resto da explicação, atrás de um "?" no fim do subtítulo: o subtítulo fica numa frase só. */
  ajuda?: ReactNode;
  voltar?: { href: string; texto: string };
  acoes?: ReactNode;
  /** A linha pequena acima do título, nas páginas de link sem a barra do alto ("Canto Verde · Ivoti"). */
  rotulo?: ReactNode;
}) {
  return (
    <header className="cabecalho-verde faixa-escura space-y-1">
      {rotulo && <p className="text-xs font-semibold tracking-wider text-[var(--muted-foreground)] uppercase">{rotulo}</p>}
      {voltar && (
        <Link href={voltar.href} className="-ml-1 inline-flex items-center gap-0.5 text-sm font-medium text-[var(--primary)] hover:underline print:hidden">
          <ChevronLeft aria-hidden className="size-4" />
          {voltar.texto}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h1 className="min-w-0">{titulo}</h1>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {subtitulo && (
        <div className="text-sm text-[var(--muted-foreground)]">
          {ajuda ? <AjudaDoTopo frase={subtitulo} ajuda={ajuda} /> : subtitulo}
        </div>
      )}
    </header>
  );
}

/** A caixa tracejada de "não tem nada aqui", com uma ação opcional embaixo. */
export function Vazio({ children, acao, className }: { children: ReactNode; acao?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-center text-sm text-[var(--muted-foreground)]", className)}>
      {children}
      {acao && <div className="mt-3 flex justify-center">{acao}</div>}
    </div>
  );
}

/** A lista em cartão: linhas separadas por um fio, canto arredondado, fundo branco. */
export function Lista({ children, className, "aria-label": rotulo }: { children: ReactNode; className?: string; "aria-label"?: string }) {
  return (
    <ul aria-label={rotulo} className={cn("divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]", className)}>
      {children}
    </ul>
  );
}

/** A linha da lista que abre outra tela: o conteúdo à esquerda e a seta no fim. */
export function LinhaComLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <li>
      <Link href={href} className={cn("flex items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]", className)}>
        <span className="min-w-0 flex-1">{children}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground)]" />
      </Link>
    </li>
  );
}

/**
 * Uma parte da tela num cartão branco: o símbolo verde, o título e uma frase
 * curta em cima, separados do conteúdo por um fio. Para telas de várias
 * partes, como as configurações; o `id` deixa a grade de atalhos do alto
 * levar direto a ela.
 */
export function CartaoDeSecao({
  id,
  icone: Icone,
  titulo,
  frase,
  children,
}: {
  id?: string;
  icone?: LucideIcon;
  titulo: ReactNode;
  frase?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <header className="flex items-start gap-3 border-b border-[var(--border)] px-4 py-3">
        {Icone && <Icone aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--primary)]" />}
        <div className="min-w-0">
          <h2 className="text-base font-bold">{titulo}</h2>
          {frase && <p className="text-sm text-[var(--muted-foreground)]">{frase}</p>}
        </div>
      </header>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}
