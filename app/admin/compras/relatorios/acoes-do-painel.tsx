"use client";

import { Download } from "lucide-react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";

/**
 * Os quadrados de ação do Painel. Fica num arquivo de cliente porque a página
 * é de servidor e não pode passar o ícone (um componente) para o
 * BotaoQuadrado.
 */
export function AcoesDoPainel({ de, ate }: { de: string; ate: string }) {
  return (
    <CartaoDeBotoes>
      <BotaoQuadrado
        icone={Download}
        texto="Baixar PDF"
        href={`/admin/compras/relatorios/pdf?de=${de}&ate=${ate}`}
        baixar
        dica="O mesmo PDF do relatório por e-mail, para o período da tela"
      />
    </CartaoDeBotoes>
  );
}
