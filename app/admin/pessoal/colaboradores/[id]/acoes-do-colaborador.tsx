"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";

import { LinkDeAtualizacao } from "./link-de-atualizacao";
import { VirarTerceirizado } from "./virar-terceirizado";

/**
 * Os quadrados de ação da ficha, logo embaixo do nome: o link para a pessoa
 * atualizar o cadastro, a conversa no WhatsApp e, no free que é empresa, o
 * passar para Terceirizados. Um painel aberto por vez, dentro do cartão.
 *
 * Num arquivo de cliente porque os ícones são componentes, e a página do
 * servidor não pode passá-los adiante.
 */
export function AcoesDoColaborador({
  colaboradorId,
  nome,
  whatsApp,
  podeAtualizar,
  podeVirarTerceirizado,
}: {
  colaboradorId: number;
  nome: string;
  /** O wa.me da pessoa, quando o telefone é de celular. */
  whatsApp: string | null;
  /** O link de atualizar: só para quem está ativo. */
  podeAtualizar: boolean;
  /** Só o free ativo pode virar terceirizado. */
  podeVirarTerceirizado: boolean;
}) {
  const [aberto, setAberto] = useState<"link" | "terceirizado" | null>(null);
  if (!podeAtualizar && !podeVirarTerceirizado && !whatsApp) return null;

  return (
    <CartaoDeBotoes>
      {podeAtualizar && (
        <LinkDeAtualizacao
          colaboradorId={colaboradorId}
          nome={nome}
          whatsApp={whatsApp}
          aberto={aberto === "link"}
          setAberto={(abrir) => setAberto(abrir ? "link" : null)}
        />
      )}
      {whatsApp && <BotaoQuadrado icone={MessageCircle} texto="WhatsApp" href={whatsApp} externo dica={`Conversar com ${nome}`} />}
      {podeVirarTerceirizado && (
        <VirarTerceirizado
          colaboradorId={colaboradorId}
          nome={nome}
          aberto={aberto === "terceirizado"}
          setAberto={(abrir) => setAberto(abrir ? "terceirizado" : null)}
        />
      )}
    </CartaoDeBotoes>
  );
}
