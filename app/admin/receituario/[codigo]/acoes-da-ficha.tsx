"use client";

import { CircleCheck, Pencil, Printer } from "lucide-react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { marcarConferida } from "@/lib/actions/receituario";
import { useAcao } from "@/lib/use-acao";
import { pdfDe } from "@/lib/pdf-da-pagina";

/**
 * As ações da ficha numa fileira de quadrados, como nas outras telas.
 * "Conferida" quer dizer produzida, pesada e validada na cozinha: o quadrado
 * fica verde-claro quando está, e um toque desmarca. Quem não configura o
 * módulo vê só o Imprimir.
 */
export function AcoesDaFicha({
  id,
  codigo,
  conferida,
  tecnica,
  podeMudar,
}: {
  id: number;
  codigo: string;
  conferida: boolean;
  /** Está na aba técnica: o Imprimir sai a folha técnica. */
  tecnica: boolean;
  podeMudar: boolean;
}) {
  const { erro, pendente, rodar } = useAcao();
  return (
    <div className="space-y-1">
      <CartaoDeBotoes>
        {podeMudar && (
          <BotaoQuadrado
            icone={CircleCheck}
            texto={conferida ? "Conferida" : "Conferir"}
            ativo={conferida}
            desligado={pendente}
            onClick={() => rodar(() => marcarConferida(id, !conferida))}
            dica={conferida ? "Tocar para desmarcar" : "Marcar como produzida, pesada e validada"}
          />
        )}
        <BotaoQuadrado
          icone={Printer}
          texto="Imprimir"
          href={pdfDe(`/imprimir/receituario/${codigo}${tecnica ? "?tipo=tecnica" : ""}`)}
          baixar
          dica={tecnica ? "Imprimir a ficha técnica" : "Imprimir a ficha operacional"}
        />
        {podeMudar && <BotaoQuadrado icone={Pencil} texto="Editar" href={`/admin/receituario/${codigo}/editar`} />}
      </CartaoDeBotoes>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </div>
  );
}
