"use client";

import { Loader2, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { Grupo } from "@/lib/busca";

/**
 * A lupa do topo: acha colaborador, ficha, produto, fornecedor, pedido,
 * reserva e as telas do menu, de qualquer lugar do painel, sem precisar
 * saber em que módulo cada coisa mora. Quem busca é `app/admin/busca/route.ts`,
 * que só olha os módulos que a pessoa pode abrir.
 *
 * Abre por cima da tela, com o teclado já no campo. Espera a pessoa parar de
 * digitar (250 ms) para buscar, e só mostra a resposta da última busca: uma
 * resposta atrasada de "ar" não apaga a de "arroz".
 */
export function BuscaDoTopo() {
  const [aberta, setAberta] = useState(false);
  const pathname = usePathname();
  const [tela, setTela] = useState(pathname);
  if (pathname !== tela) {
    setTela(pathname);
    setAberta(false);
  }

  useEffect(() => {
    if (!aberta) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberta(false);
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener("keydown", esc);
    };
  }, [aberta]);

  return (
    <>
      <button
        type="button"
        aria-label="Buscar"
        onClick={() => setAberta(true)}
        className="flex size-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <Search aria-hidden className="size-5" />
      </button>
      {aberta && <Painel fechar={() => setAberta(false)} />}
    </>
  );
}

function Painel({ fechar }: { fechar: () => void }) {
  const [q, setQ] = useState("");
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const ultima = useRef(0);

  useEffect(() => {
    const termo = q.trim();
    if (termo.replace(/#/g, "").length < 2) return;
    const esta = ++ultima.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/admin/busca?q=${encodeURIComponent(termo)}`);
        if (!r.ok) throw new Error(String(r.status));
        const dados = (await r.json()) as { grupos: Grupo[] };
        if (esta !== ultima.current) return;
        setGrupos(dados.grupos);
        setFalhou(false);
      } catch {
        if (esta === ultima.current) setFalhou(true);
      } finally {
        if (esta === ultima.current) setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const curta = q.trim().replace(/#/g, "").length < 2;

  return (
    <div
      className="tema-claro fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Buscar"
    >
      <button
        type="button"
        aria-label="Fechar a busca"
        onClick={fechar}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative mx-auto flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden bg-[var(--card)] text-[var(--foreground)] shadow-xl sm:mt-16 sm:rounded-xl">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          <Search
            aria-hidden
            className="size-5 shrink-0 text-[var(--muted-foreground)]"
          />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pessoa, ficha, produto, fornecedor, pedido…"
            aria-label="O que buscar"
            enterKeyHint="search"
            className="min-w-0 flex-1 border-0 bg-transparent px-1 text-base outline-none"
          />
          {buscando && (
            <Loader2
              aria-label="Buscando"
              className="size-4 shrink-0 animate-spin text-[var(--muted-foreground)]"
            />
          )}
          <button
            type="button"
            aria-label="Fechar a busca"
            onClick={fechar}
            className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-[var(--muted)]"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain">
          {curta ? (
            <p className="px-4 py-5 text-sm text-[var(--muted-foreground)]">
              Digite pelo menos 2 letras. Para um pedido, o número com # (#23).
            </p>
          ) : falhou ? (
            <p
              role="alert"
              className="px-4 py-5 text-sm text-[var(--destructive)]"
            >
              Não deu para buscar. Confira a internet e tente de novo.
            </p>
          ) : grupos && grupos.length === 0 && !buscando ? (
            <p className="px-4 py-5 text-sm text-[var(--muted-foreground)]">
              Nada encontrado para &ldquo;{q.trim()}&rdquo;.
            </p>
          ) : (
            grupos?.map((g) => (
              <section
                key={g.nome}
                className="border-b border-[var(--border)] last:border-b-0"
              >
                <h2 className="section-label px-4 pt-3 pb-1">{g.nome}</h2>
                <ul>
                  {g.itens.map((i) => (
                    <li key={i.href + i.titulo}>
                      <Link
                        href={i.href}
                        onClick={fechar}
                        className="flex flex-col px-4 py-2.5 hover:bg-[var(--muted)]"
                      >
                        <span
                          className={`text-[15px] font-medium ${i.apagado ? "text-[var(--muted-foreground)]" : ""}`}
                        >
                          {i.titulo}
                        </span>
                        {i.detalhe && (
                          <span className="text-xs text-[var(--muted-foreground)]">
                            {i.detalhe}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
