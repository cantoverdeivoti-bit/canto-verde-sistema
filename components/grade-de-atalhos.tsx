import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { ICONE_DO_TILE, TILE } from "@/components/estilo-do-atalho";

/** `externo`: abre em outra aba. `baixar`: é um arquivo (o PDF de uma folha), um `<a>` simples, sem pré-carregar. */
export type Atalho = { href: string; nome: string; icone: LucideIcon; externo?: boolean; baixar?: boolean };

/**
 * Os atalhos de uma tela num cartão branco, como as abas dos Relatórios no
 * celular: o símbolo verde em cima e o nome embaixo, quatro por linha. No
 * computador ficam lado a lado, cada um do mesmo tamanho.
 */
export function GradeDeAtalhos({ atalhos, rotulo }: { atalhos: Atalho[]; rotulo: string }) {
  return (
    <nav aria-label={rotulo}>
      <ul className="grid grid-cols-4 gap-1 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 sm:flex sm:flex-wrap">
        {atalhos.map((a) => {
          const Icone = a.icone;
          return (
            <li key={a.href} className="sm:w-32">
              {a.baixar ? (
                <a href={a.href} download className={`${TILE} text-[var(--foreground)] hover:bg-[var(--muted)]`}>
                  <Icone aria-hidden className={`${ICONE_DO_TILE} text-[var(--primary)]`} />
                  {a.nome}
                </a>
              ) : (
                <Link
                  href={a.href}
                  {...(a.externo ? { target: "_blank", rel: "noopener" } : {})}
                  className={`${TILE} text-[var(--foreground)] hover:bg-[var(--muted)]`}
                >
                  <Icone aria-hidden className={`${ICONE_DO_TILE} text-[var(--primary)]`} />
                  {a.nome}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
