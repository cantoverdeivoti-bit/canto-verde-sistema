"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useAviso } from "@/components/aviso-do-topo";

/**
 * O jeito de chamar uma ação nas telas do painel: espera, mostra o
 * erro se houver e, se deu certo, roda o `depois` e recarrega os dados.
 *
 * Com `opcoes.aviso`, o acerto aparece na faixa de baixo da tela ("Salvo");
 * com `opcoes.desfazer`, a faixa ganha o botão Desfazer, que roda a ação de
 * volta e recarrega. Só onde a volta é segura: a maioria dos "apagar" é
 * definitiva e continua pedindo confirmação antes.
 */
type Resultado = { ok: boolean; message?: string };
export function useAcao() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  // Deu certo com recado (no buffet, a sugestão do colaborador que foi para
  // aprovação): a tela mostra se quiser.
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const mostrar = useAviso();

  function rodar<T extends Resultado>(
    acao: () => Promise<T>,
    depois?: (r: T) => void,
    opcoes?: { aviso?: string; desfazer?: () => Promise<Resultado> },
  ) {
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      if (r.message) setAviso(r.message);
      depois?.(r);
      if (opcoes?.aviso) {
        const desfazer = opcoes.desfazer;
        mostrar(
          opcoes.aviso,
          desfazer && {
            desfazer: async () => {
              const v = await desfazer();
              if (!v.ok) mostrar(v.message ?? "Não deu para desfazer.");
              router.refresh();
            },
          },
        );
      }
      router.refresh();
    });
  }

  return { erro, setErro, aviso, pendente, rodar };
}
