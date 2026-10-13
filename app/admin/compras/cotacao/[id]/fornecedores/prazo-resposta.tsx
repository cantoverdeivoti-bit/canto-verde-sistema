"use client";

import { useState, useTransition } from "react";

import { definirPrazoResposta } from "@/lib/actions/cotacao";

const OPCOES = [6, 12, 24, 48, 72] as const;
type Horas = (typeof OPCOES)[number];
const rotulo = (h: Horas) => (h < 48 ? `${h} h` : `${h / 24} dias`);

/**
 * Até quando os fornecedores desta cotação podem responder.
 *
 * Botões — de 6 horas a 3 dias a partir de agora —, a pedido do dono, no
 * lugar de data e hora para digitar: o prazo de cotação é "hoje à tarde",
 * "até amanhã", "até depois de amanhã", e escolher é mais rápido que calcular.
 *
 * Mora aqui, na tela de onde os links saem, e não no comparativo: o prazo é
 * combinado na hora de chamar, e é o que vai escrito na mensagem do WhatsApp.
 * Depois dele o link fecha sozinho. Prorrogar é escolher de novo.
 */
export function PrazoResposta({
  cotacaoId,
  fechada,
  texto,
}: {
  cotacaoId: number;
  fechada: boolean;
  /** "quinta-feira, 24 de setembro às 18:00", já no fuso da casa. */
  texto: string | null;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar(horas: Horas | null) {
    setErro(null);
    startTransition(async () => {
      const r = await definirPrazoResposta(cotacaoId, horas);
      if (!r.ok) setErro(r.message);
    });
  }

  if (fechada) return null;

  return (
    <div className="card mt-3 max-w-2xl p-3">
      <p className="text-sm font-semibold">Prazo para os fornecedores responderem</p>
      <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">
        {texto
          ? `Até ${texto}. Depois disso o link fecha.`
          : "Sem prazo: o link fica aberto até a cotação ser fechada."}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {OPCOES.map((h) => (
          <button
            key={h}
            type="button"
            disabled={pendente}
            onClick={() => salvar(h)}
            className="chip px-4 py-1.5 text-sm disabled:opacity-50"
          >
            {rotulo(h)}
          </button>
        ))}
        {texto && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => salvar(null)}
            className="text-sm text-[var(--muted-foreground)] underline underline-offset-4"
          >
            tirar prazo
          </button>
        )}
      </div>
      <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
        Conta a partir de agora. Escolher de novo recomeça a conta.
      </p>
      {erro && (
        <p role="alert" className="mt-2 text-sm text-[var(--destructive)]">
          {erro}
        </p>
      )}
    </div>
  );
}
