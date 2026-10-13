import { useSyncExternalStore } from "react";

/** A partir do `lg` do Tailwind: é onde as telas do painel viram tabela. */
const TELA_GRANDE = "(min-width: 1024px)";

/**
 * Se a tela é de computador — para o celular NÃO montar o que só o
 * computador mostra (e vice-versa).
 *
 * Esconder com CSS não bastava: o que ficava invisível era montado inteiro e
 * redesenhado a cada toque. O servidor dá o palpite (pelo navegador, ver
 * `pareceCelular`, em lib/parece-celular.ts) para a primeira pintura sair certa; depois a largura de
 * verdade manda, e acompanha a janela se ela mudar.
 */
export function useTelaGrande(noServidor: boolean) {
  return useSyncExternalStore(
    (avisar) => {
      const m = window.matchMedia(TELA_GRANDE);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    () => window.matchMedia(TELA_GRANDE).matches,
    () => noServidor,
  );
}

