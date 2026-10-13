"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

import { Lista } from "@/components/pagina";

/**
 * Lista longa em lotes: desenha 40 linhas e traz mais ao chegar perto do fim.
 *
 * Nasceu em Produtos. As fichas, as etiquetas e os insumos do Receituário
 * desenhavam tudo de uma vez (417 insumos, uma página de mais de 30 mil
 * pixels no celular), e a tela travava ao abrir e ao filtrar.
 */

/** Quantas linhas a lista desenha de cada vez. */
export const LINHAS_POR_VEZ = 40;

/**
 * O fim da parte desenhada: ao chegar perto dele (600 px antes), a lista
 * traz mais um lote. O botão fica para quem não rola (teclado, leitor de
 * tela) e para o caso raro de o observador não disparar.
 */
export function MaisAoRolar({ restam, aoChegar }: { restam: number; aoChegar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const aoChegarRef = useRef(aoChegar);
  useEffect(() => {
    aoChegarRef.current = aoChegar;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observador = new IntersectionObserver(
      (e) => {
        if (e[0]?.isIntersecting) aoChegarRef.current();
      },
      { rootMargin: "600px 0px" },
    );
    observador.observe(el);
    return () => observador.disconnect();
    // Refeito a cada lote (restam muda), para disparar de novo se o fim da
    // lista ainda estiver à vista depois de crescer.
  }, [restam]);
  return (
    <div ref={ref} className="py-4 text-center">
      <button type="button" onClick={aoChegar} className="text-sm text-[var(--primary)] underline-offset-4 hover:underline">
        Mostrar mais {restam}
      </button>
    </div>
  );
}

/**
 * O lote da vez. Quem usa reinicia a contagem trocando a `key` do componente
 * quando o filtro muda; trocar só a lista (a cada `router.refresh()` depois de
 * salvar) não pode recolher o que a pessoa já tinha aberto.
 */
export function useEmLotes<T>(itens: T[], porVez = LINHAS_POR_VEZ) {
  const [limite, setLimite] = useState(porVez);
  return {
    naTela: itens.slice(0, limite),
    restam: Math.max(itens.length - limite, 0),
    mais: () => setLimite((l) => l + porVez),
  };
}

/**
 * Para listas montadas no servidor: recebe os `<li>` prontos e mostra um lote
 * por vez dentro de uma `Lista`. Dê a ela uma `key` com os filtros da tela.
 */
export function ListaEmLotes({ children }: { children: ReactNode }) {
  const { naTela, restam, mais } = useEmLotes(Children.toArray(children));
  return (
    <>
      <Lista>{naTela}</Lista>
      {restam > 0 && <MaisAoRolar restam={restam} aoChegar={mais} />}
    </>
  );
}
