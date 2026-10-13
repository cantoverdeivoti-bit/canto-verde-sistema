"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { IconeNav } from "@/components/icone-nav";
import { IndicadorDeLink } from "@/components/indicador-de-link";
import { agruparSecoes, grupoDaTela, type ModuleSection } from "@/lib/modules";

import { NumeroDoMenu } from "./contadores-do-menu";

/**
 * As seções de um módulo em coluna, com os grupos ("Cadastros") abrindo e
 * fechando, no painel do celular (`sidebar.tsx`). No computador, as mesmas
 * seções ficam na barra do alto (`abas-do-modulo.tsx`).
 */
export function ListaDeSecoes({
  secoes,
  eAtiva,
  linkClassName,
  aoNavegar,
  caminho,
  substituir,
}: {
  /** A tela atual, para o grupo abrir também nas telas dele que não estão no menu. */
  caminho: string;
  secoes: ModuleSection[];
  eAtiva: (href: string) => boolean;
  linkClassName: string;
  /** Recebe o destino e o toque: quem chama decide se fecha algo nele. */
  aoNavegar?: (href: string, e: React.MouseEvent) => void;
  /** Troca a entrada do histórico em vez de criar outra (o menu do celular, `sidebar.tsx`). */
  substituir?: boolean;
}) {
  const link = (s: ModuleSection) => (
    <Link
      href={s.href}
      replace={substituir}
      aria-current={eAtiva(s.href) ? "page" : undefined}
      onClick={(e) => aoNavegar?.(s.href, e)}
      className={linkClassName}
    >
      <IconeNav nome={s.icone} />
      {s.label}
      {/* O número da seção, quando há o que contar. */}
      {s.contador && <NumeroDoMenu chave={s.contador} />}
      <IndicadorDeLink />
    </Link>
  );

  const grupoAtual = grupoDaTela(secoes, caminho)?.nome ?? null;

  return (
    <ul className="flex flex-col gap-0.5">
      {agruparSecoes(secoes).map((item) =>
        item.tipo === "secao" ? (
          <li key={item.secao.href}>{link(item.secao)}</li>
        ) : (
          <Grupo
            key={item.nome}
            nome={item.nome}
            icone={item.icone}
            temAtiva={item.nome === grupoAtual || item.secoes.some((s) => eAtiva(s.href))}
            linkClassName={linkClassName}
          >
            {item.secoes.map((s) => (
              <li key={s.href}>{link(s)}</li>
            ))}
          </Grupo>
        ),
      )}
    </ul>
  );
}

function Grupo({
  nome,
  icone,
  temAtiva,
  linkClassName,
  children,
}: {
  nome: string;
  icone: ModuleSection["icone"];
  temAtiva: boolean;
  linkClassName: string;
  children: React.ReactNode;
}) {
  // Sem escolha dele, segue a tela: aberto quando uma das seções de dentro é a
  // atual — ninguém precisa abrir o grupo para ver onde está. Depois que ele
  // toca, vale o toque.
  const [escolhido, setEscolhido] = useState<boolean | null>(null);
  const aberto = escolhido ?? temAtiva;

  return (
    <li>
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setEscolhido(!aberto)}
        className={`${linkClassName} w-full text-left ${temAtiva && !aberto ? "font-semibold text-[var(--primary)]" : ""}`}
      >
        <IconeNav nome={icone} />
        <span className="flex-1">{nome}</span>
        <ChevronRight
          aria-hidden
          className={`size-4 shrink-0 transition-transform ${aberto ? "rotate-90" : ""}`}
        />
      </button>
      {aberto && (
        // Recuado, com um fio à esquerda: o olho vê que são de dentro do grupo.
        <ul className="mt-0.5 ml-3.5 flex flex-col gap-0.5 border-l border-[var(--border)] pl-2">
          {children}
        </ul>
      )}
    </li>
  );
}
