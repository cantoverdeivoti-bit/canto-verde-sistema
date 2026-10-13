"use client";

import { Pencil, Power, Printer, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { ConfirmarNaLinha } from "@/components/confirmar-na-linha";
import { apagarProcesso, ligarProcesso } from "@/lib/actions/operacional";

import { useAcao } from "@/lib/use-acao";
import { pdfDe } from "@/lib/pdf-da-pagina";

/**
 * As ações do processo em botões de símbolo: imprimir, e para quem muda,
 * editar, desligar (sai das listas, o histórico fica) e apagar (só sem
 * treinamento registrado).
 */
export function AcoesDoProcesso({
  id,
  ativo,
  temTreinamento,
  podeMudar,
}: {
  id: number;
  ativo: boolean;
  temTreinamento: boolean;
  podeMudar: boolean;
}) {
  const router = useRouter();
  const { erro, pendente, rodar } = useAcao();
  return (
    <div className="space-y-2">
      <CartaoDeBotoes>
        <BotaoQuadrado icone={Printer} texto="Imprimir" href={pdfDe(`/imprimir/operacional/processo/${id}`)} baixar />
        {podeMudar && (
          <>
            <BotaoQuadrado icone={Pencil} texto="Editar" href={`/admin/operacional/processos/${id}?editar=1`} />
            <BotaoQuadrado icone={Power} texto={ativo ? "Desligar" : "Ligar"} desligado={pendente} onClick={() => rodar(() => ligarProcesso(id, !ativo))} />
            {!temTreinamento && (
              <ConfirmarNaLinha
                pergunta="Apagar este processo?"
                aoConfirmar={() => rodar(() => apagarProcesso(id), () => router.push("/admin/operacional/processos"))}
                pendente={pendente}
              >
                {(abrir) => <BotaoQuadrado icone={Trash2} texto="Apagar" tom="perigo" desligado={pendente} onClick={abrir} />}
              </ConfirmarNaLinha>
            )}
          </>
        )}
      </CartaoDeBotoes>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </div>
  );
}
