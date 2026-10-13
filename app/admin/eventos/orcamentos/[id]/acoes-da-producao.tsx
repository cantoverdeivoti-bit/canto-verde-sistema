"use client";

import { Printer } from "lucide-react";

import { BotaoQuadrado, FileiraDeBotoes } from "@/components/botao-quadrado";
import { pdfDe } from "@/lib/pdf-da-pagina";

/** O quadrado de imprimir a ordem de produção (componente cliente por causa do ícone). */
export function AcoesDaProducao({ eventoId }: { eventoId: number }) {
  return (
    <div className="border-t border-[var(--border)] pt-1">
      <FileiraDeBotoes>
        <BotaoQuadrado icone={Printer} texto="Imprimir" href={pdfDe(`/imprimir/eventos/producao/${eventoId}`)} baixar />
      </FileiraDeBotoes>
    </div>
  );
}
