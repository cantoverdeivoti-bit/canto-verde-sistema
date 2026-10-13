"use client";

import { CalendarPlus, Lock, LockOpen, Settings } from "lucide-react";
import { useState } from "react";

import { BotaoQuadrado, FileiraDeBotoes } from "@/components/botao-quadrado";
import { abrirDia, fecharDia } from "@/lib/actions/settings";
import { useAcao } from "@/lib/use-acao";

import { NewReservation } from "./new-reservation";
import { TrancarDia } from "./trancar-dia";

/**
 * As ações do dia em botões quadrados de cantos redondos, com o nome embaixo, como nos apps de
 * banco: anotar reserva, fechar ou abrir o dia e as configurações. O que
 * abre (o formulário de anotar, a confirmação de fechar) aparece embaixo da
 * fileira, dentro do mesmo cartão, e só um por vez.
 */
export function AcoesDoDia({
  data,
  ativas,
  fechado,
  fechadoPeloCadeado,
  motivo,
  podeTrancar,
  podeConfigurar,
}: {
  data: string;
  /** Reservas ativas no dia: o aviso ao fechar. */
  ativas: number;
  /** Fechado de qualquer jeito (cadeado ou grade da semana): não se anota. */
  fechado: boolean;
  /** Fechado pelo cadeado: aí dá para abrir daqui. */
  fechadoPeloCadeado: boolean;
  motivo: string | null;
  podeTrancar: boolean;
  podeConfigurar: boolean;
}) {
  const [painel, setPainel] = useState<"anotar" | "fechar" | null>(null);
  const { erro, pendente, rodar } = useAcao();
  const alternar = (p: "anotar" | "fechar") => setPainel((atual) => (atual === p ? null : p));

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
      <FileiraDeBotoes>
        {!fechado && <BotaoQuadrado icone={CalendarPlus} texto="Anotar reserva" ativo={painel === "anotar"} onClick={() => alternar("anotar")} />}
        {podeTrancar && !fechado && <BotaoQuadrado icone={Lock} texto="Fechar o dia" ativo={painel === "fechar"} onClick={() => alternar("fechar")} />}
        {podeTrancar && fechadoPeloCadeado && (
          <BotaoQuadrado
            icone={LockOpen}
            texto="Abrir o dia"
            desligado={pendente}
            onClick={() =>
              rodar(() => abrirDia(data), undefined, {
                aviso: "Dia aberto para reservas",
                desfazer: () => fecharDia(data, motivo ?? undefined),
              })
            }
          />
        )}
        {podeConfigurar && (
          <BotaoQuadrado icone={Settings} texto="Configurar" href="/admin/comercial/configuracoes" dica="Configurações de reservas" />
        )}
      </FileiraDeBotoes>
      {erro && (
        <p role="alert" className="msg-error mt-3">
          {erro}
        </p>
      )}
      {painel && (
        <div className="mt-1 border-t border-[var(--border)] p-3">
          {painel === "anotar" ? (
            <NewReservation defaultDate={data} aoFechar={() => setPainel(null)} />
          ) : (
            <TrancarDia data={data} ativas={ativas} aoFechar={() => setPainel(null)} />
          )}
        </div>
      )}
    </div>
  );
}
