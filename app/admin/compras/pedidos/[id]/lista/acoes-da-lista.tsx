"use client";

import { Copy, Printer } from "lucide-react";
import { useState } from "react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";

/** Copiar a lista (para o WhatsApp de quem vai comprar) e imprimir a folha. */
export function AcoesDaLista({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro(true);
    }
  }

  return (
    <div className="space-y-2 print:hidden">
      <CartaoDeBotoes>
        <BotaoQuadrado icone={Copy} texto={copiado ? "Copiado" : "Copiar lista"} tom="primario" onClick={copiar} dica="Para mandar no WhatsApp de quem vai comprar" />
        <BotaoQuadrado icone={Printer} texto="Imprimir" onClick={() => window.print()} />
      </CartaoDeBotoes>
      {erro && (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          Não consegui copiar. Selecione a lista e copie à mão.
        </p>
      )}
    </div>
  );
}
