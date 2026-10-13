"use client";

import { Lock } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { abrirDia, fecharDia } from "@/lib/actions/settings";
import { plural } from "@/lib/format";
import { useAcao } from "@/lib/use-acao";

/**
 * O cadeado da agenda: fecha o dia inteiro (feriado, evento fechado) sem ir
 * a Configurações. Fechado, o link de reservas para de oferecer o dia e o
 * "Anotar reserva" some. As reservas já marcadas continuam: a tela avisa
 * quantas são, para quem fecha avisar os clientes pelo WhatsApp de cada linha.
 */
export function TrancarDia({ data, ativas, aoFechar }: { data: string; ativas: number; aoFechar: () => void }) {
  const { erro, pendente, rodar } = useAcao();
  const [motivo, setMotivo] = useState("");

  return (
    <div className="w-full space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <p className="font-semibold">Fechar este dia para reservas?</p>
      <label className="block">
        <span className="label">Motivo (opcional)</span>
        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Feriado, evento fechado…" />
      </label>
      {ativas > 0 && (
        <p className="msg-warn text-sm">
          {ativas === 1
            ? "Este dia tem 1 reserva. Ela continua marcada: avise o cliente pelo WhatsApp."
            : `Este dia tem ${plural(ativas, "reserva", "reservas")}. Elas continuam marcadas: avise os clientes pelo WhatsApp de cada uma.`}
        </p>
      )}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pendente}
          onClick={() =>
            rodar(() => fecharDia(data, motivo), aoFechar, {
              aviso: "Dia fechado",
              desfazer: () => abrirDia(data),
            })
          }
        >
          <Lock aria-hidden className="size-4" />
          Fechar o dia
        </Button>
        <Button type="button" variant="ghost" onClick={aoFechar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
