"use client";

import { Bell, ChevronRight, House, LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, use, useEffect, useRef, useState, type ReactNode } from "react";

import { BuscaDoTopo } from "./busca-do-topo";
import { useContadores, type Contadores } from "./contadores-do-menu";

/**
 * O canto direito do topo, como nos apps de banco: a lupa, o sino com o que espera
 * alguém decidir e a bolinha com as iniciais de quem está logado. O sino não
 * inventa aviso novo: são os mesmos números do menu (`lib/contadores.ts`),
 * juntos num lugar só, cada um com o link da tela que resolve.
 */
const O_QUE_ESPERA: { chave: keyof Contadores; texto: string; href: string }[] = [
  { chave: "pendencias", texto: "Pendências de Compras", href: "/admin/compras/pendencias" },
  { chave: "cadastrosPendentes", texto: "Pendências do Pessoal", href: "/admin/pessoal/pendencias" },
  { chave: "sugestoesBuffet", texto: "Sugestões do buffet", href: "/admin/buffet/sugestoes" },
  { chave: "treinamentosPendentes", texto: "Treinamentos a fazer", href: "/admin/operacional/treinamento" },
];

/** "Jonathan Schmidt" vira "JS"; um nome só, as duas primeiras letras. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes.at(-1)![0]).toUpperCase();
}

export function AcoesDoTopo({ nome, papel, logout }: { nome: string; papel: string; logout: () => Promise<void> }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <BuscaDoTopo />
      <Suspense fallback={<BotaoDoSino total={0} />}>
        <Sino />
      </Suspense>
      <Avatar nome={nome} papel={papel} logout={logout} />
    </div>
  );
}

/** Abre embaixo do botão; fecha ao trocar de tela, ao tocar fora ou com Esc. */
function useMenu() {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const [tela, setTela] = useState(pathname);
  if (pathname !== tela) {
    setTela(pathname);
    setAberto(false);
  }
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);
  return { aberto, setAberto, caixa };
}

const BOTAO_REDONDO = "relative flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20";

function BotaoDoSino({ total, ...props }: { total: number } & React.ComponentProps<"button">) {
  return (
    <button type="button" aria-label={total > 0 ? `Avisos: ${total} esperando` : "Avisos"} className={BOTAO_REDONDO} {...props}>
      <Bell aria-hidden className="size-5" />
      {total > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d92d20] px-1 text-[11px] leading-none font-bold text-white ring-2 ring-[#00461e]">
          {total > 99 ? "99+" : total}
        </span>
      )}
    </button>
  );
}

function Sino() {
  const contadores = use(useContadores());
  const { aberto, setAberto, caixa } = useMenu();
  const itens = O_QUE_ESPERA.flatMap((i) => {
    const n = contadores[i.chave];
    return n && n > 0 ? [{ ...i, n }] : [];
  });
  const total = itens.reduce((s, i) => s + i.n, 0);
  return (
    <div ref={caixa} className="relative">
      <BotaoDoSino total={total} aria-expanded={aberto} aria-haspopup="true" onClick={() => setAberto(!aberto)} />
      {aberto && (
        <Caixa titulo="O que espera você">
          {itens.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--muted-foreground)]">Nada esperando agora.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {itens.map((i) => (
                <li key={i.chave}>
                  <Link href={i.href} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--muted)]">
                    <span className="min-w-0 flex-1">{i.texto}</span>
                    <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--warn-soft)] px-1.5 text-xs leading-6 font-semibold text-[var(--warn)]">{i.n}</span>
                    <ChevronRight aria-hidden className="size-4 text-[var(--muted-foreground)]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Caixa>
      )}
    </div>
  );
}

function Avatar({ nome, papel, logout }: { nome: string; papel: string; logout: () => Promise<void> }) {
  const { aberto, setAberto, caixa } = useMenu();
  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        aria-label={`Sua conta: ${nome}`}
        aria-expanded={aberto}
        aria-haspopup="true"
        onClick={() => setAberto(!aberto)}
        className="flex size-10 items-center justify-center rounded-full bg-[#00d700] text-sm font-bold text-[#00461e] ring-2 ring-white/25 transition hover:ring-white/50"
      >
        {iniciais(nome)}
      </button>
      {aberto && (
        <Caixa titulo={nome} subtitulo={papel}>
          <ul className="divide-y divide-[var(--border)] text-sm">
            <li>
              <Link href="/admin/sistema/pagina-inicial" className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]">
                <House aria-hidden className="size-4 text-[var(--muted-foreground)]" />
                Minha página inicial
              </Link>
            </li>
            <li>
              <Link href="/admin/sistema/notificacoes" className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]">
                <Bell aria-hidden className="size-4 text-[var(--muted-foreground)]" />
                Minhas notificações
              </Link>
            </li>
            <li>
              <Link href="/admin/sistema/lixeira" className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--muted)]">
                <Trash2 aria-hidden className="size-4 text-[var(--muted-foreground)]" />
                Lixeira
              </Link>
            </li>
            <li>
              <form action={logout}>
                <button type="submit" className="flex w-full items-center gap-3 px-4 py-3 text-left text-[var(--destructive)] hover:bg-[var(--danger-soft)]">
                  <LogOut aria-hidden className="size-4" />
                  Sair
                </button>
              </form>
            </li>
          </ul>
        </Caixa>
      )}
    </div>
  );
}

/**
 * A caixa branca que abre do topo. `tema-claro` desfaz as cores da faixa
 * verde (`.faixa-escura`) aqui dentro: a caixa é branca, com texto escuro.
 */
function Caixa({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <div className="tema-claro absolute top-full right-0 z-50 mt-2 w-72 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] shadow-xl">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <p className="truncate font-semibold">{titulo}</p>
        {subtitulo && <p className="text-xs text-[var(--muted-foreground)]">{subtitulo}</p>}
      </div>
      {children}
    </div>
  );
}
