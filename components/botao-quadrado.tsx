"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { ICONE_DO_TILE, TILE, TILE_EM_DESTAQUE } from "@/components/estilo-do-atalho";

/**
 * O botão de ação das telas, no desenho das abas dos Relatórios: símbolo
 * verde em cima e nome pequeno embaixo, sem caixa em volta. Numa fileira
 * dentro de um cartão branco (Reservas do dia, o pedido de compra). Com
 * `href` vira link; com `externo`, abre em outra aba.
 *
 * `tom`: "primario" é a ação principal da fileira, em destaque como a aba
 * aberta; "perigo" a que desfaz (cancelar), em vermelho.
 */
export function BotaoQuadrado({
  icone: Icone,
  texto,
  onClick,
  href,
  externo = false,
  baixar = false,
  ativo = false,
  desligado = false,
  tom = "normal",
  dica,
}: {
  icone: LucideIcon;
  texto: string;
  onClick?: () => void;
  href?: string;
  externo?: boolean;
  /** O `href` é um arquivo para baixar (planilha): vira um `<a>` simples, sem pré-carregar. */
  baixar?: boolean;
  /** O painel dele está aberto: o quadrado fica verde-claro. */
  ativo?: boolean;
  desligado?: boolean;
  tom?: "normal" | "primario" | "perigo";
  /** O texto que aparece ao segurar o dedo (title). */
  dica?: string;
}) {
  const visual =
    tom === "perigo"
      ? "text-[var(--destructive)] hover:bg-[var(--danger-soft)]"
      : tom === "primario" || ativo
        ? TILE_EM_DESTAQUE
        : "text-[var(--foreground)] hover:bg-[var(--muted)]";
  const corDoIcone = tom === "perigo" || tom === "primario" || ativo ? "" : "text-[var(--primary)]";
  const conteudo = (
    <>
      <Icone aria-hidden className={`${ICONE_DO_TILE} ${corDoIcone}`} />
      {texto}
    </>
  );
  // No computador, cada botão com a mesma largura, lado a lado.
  const classe = `${TILE} ${visual} sm:w-32 disabled:opacity-50 aria-disabled:opacity-50`;

  if (href && baixar) {
    return (
      <a href={href} download title={dica} className={classe}>
        {conteudo}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} title={dica} className={classe} {...(externo ? { target: "_blank", rel: "noopener" } : {})}>
        {conteudo}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={desligado} title={dica} aria-expanded={ativo || undefined} className={classe}>
      {conteudo}
    </button>
  );
}

/** A fileira de botões: quatro por linha no celular, como as abas dos Relatórios; lado a lado no computador. */
export function FileiraDeBotoes({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-4 gap-1 sm:flex sm:flex-wrap">{children}</div>;
}

/** A fileira num cartão branco, sozinha na tela: o jeito mais comum de usar. */
export function CartaoDeBotoes({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
      <FileiraDeBotoes>{children}</FileiraDeBotoes>
    </div>
  );
}
