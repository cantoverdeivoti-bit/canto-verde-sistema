"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * A faixa curta que aparece embaixo da tela depois de salvar ou apagar
 * ("Salvo", "Tarefa excluída · Desfazer"), como nos apps de banco. Antes cada
 * tela escrevia o seu "Salvo." pequeno ao lado do botão, cada uma de um
 * jeito, e quem já tinha rolado a tela nem via.
 *
 * Uma faixa por vez: a nova troca a anterior. Some sozinha em 4 segundos, ou
 * em 8 quando tem "Desfazer", para dar tempo de ler e tocar.
 */
type Opcoes = { desfazer?: () => void | Promise<void> };
type Mostrar = (texto: string, opcoes?: Opcoes) => void;

const Contexto = createContext<Mostrar>(() => {});

/** `mostrar("Salvo")`; fora do painel (sem o provedor), não faz nada. */
export const useAviso = () => useContext(Contexto);

export function AvisoDoTopo({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<{
    id: number;
    texto: string;
    desfazer?: Opcoes["desfazer"];
  } | null>(null);
  const contador = useRef(0);

  const mostrar = useCallback<Mostrar>((texto, opcoes) => {
    contador.current += 1;
    setAviso({ id: contador.current, texto, desfazer: opcoes?.desfazer });
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(
      () => setAviso((a) => (a?.id === aviso.id ? null : a)),
      aviso.desfazer ? 8000 : 4000,
    );
    return () => clearTimeout(t);
  }, [aviso]);

  return (
    <Contexto.Provider value={mostrar}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[var(--barra-de-baixo)] z-50 flex justify-center px-4 pb-[max(1rem,calc(env(safe-area-inset-bottom)-var(--barra-de-baixo)))] print:hidden"
      >
        {aviso && (
          <div
            key={aviso.id}
            role="status"
            className="pointer-events-auto flex max-w-md items-center gap-4 rounded-xl bg-[#1b1f1d] py-3 pr-2 pl-4 text-sm font-medium text-white shadow-lg motion-safe:animate-[subir_.18s_ease-out]"
          >
            <span className="min-w-0 flex-1">{aviso.texto}</span>
            {aviso.desfazer ? (
              <button
                type="button"
                onClick={async () => {
                  const desfazer = aviso.desfazer!;
                  setAviso(null);
                  await desfazer();
                }}
                className="shrink-0 rounded-lg px-3 py-1.5 font-semibold text-[#00d700] hover:bg-white/10"
              >
                Desfazer
              </button>
            ) : (
              <button
                type="button"
                aria-label="Fechar o aviso"
                onClick={() => setAviso(null)}
                className="shrink-0 rounded-lg px-2 py-1 text-white/60 hover:bg-white/10"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>
    </Contexto.Provider>
  );
}
