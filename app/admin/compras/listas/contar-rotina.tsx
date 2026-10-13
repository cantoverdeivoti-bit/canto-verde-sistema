"use client";

import { ClipboardList, Clock, MessageCircle, PackageCheck, PencilLine, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { BotaoQuadrado, FileiraDeBotoes } from "@/components/botao-quadrado";
import { abrirContagemDaLista } from "@/lib/actions/lista-compra";
import { plural } from "@/lib/format";
import type { SituacaoDaRotina } from "@/lib/rotina-de-hoje";

/**
 * O próximo passo de uma compra de rotina, num toque: contar (ou continuar a
 * contagem aberta), mandar o link para outra pessoa contar, e, quando o
 * pedido de hoje já saiu, abrir para mandar ao fornecedor. Contar de novo
 * depois do pedido junta o que faltar nele, enquanto ele não foi enviado.
 *
 * Mandar é de quem compra (configura Compras): para o estoquista, o pedido
 * aparece esperando o comprador. Em quadrados, como as ações das outras
 * telas; o texto vai curto e o resto fica na dica (ao segurar o dedo).
 */
export function ContarRotina({
  listaId,
  nome,
  situacao,
  podeComprar,
  pedidoAMao,
}: {
  listaId: number;
  nome: string;
  situacao: SituacaoDaRotina;
  podeComprar: boolean;
  /** O endereço do pedido feito à mão, sem contar: só na tela do dia. */
  pedidoAMao?: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const { contagem, pedido } = situacao;

  const endereco = (token: string) => `${window.location.origin}/estoquista/contagem/${token}`;

  function abrir(depois: (token: string) => void) {
    setErro(null);
    startTransition(async () => {
      const r = await abrirContagemDaLista(listaId);
      if (!r.ok) return setErro(r.message);
      depois(r.data.token);
    });
  }

  const contar = () => abrir((token) => router.push(`/estoquista/contagem/${token}`));
  const mandarLink = () =>
    abrir((token) => {
      const texto = `Contagem da compra de rotina ${nome}: ${endereco(token)}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
      router.refresh();
    });

  const doPedido = pedido ? `/admin/compras/pedidos/${pedido.id}` : "";

  return (
    <div className="space-y-2">
      <FileiraDeBotoes>
        {pedido && !pedido.enviado && podeComprar && (
          <BotaoQuadrado icone={Send} texto="Mandar pedido" tom="primario" href={doPedido} dica={`Pedido #${pedido.id} · ${plural(pedido.itens, "item", "itens")}`} />
        )}
        {pedido && !pedido.enviado && !podeComprar && (
          <BotaoQuadrado icone={Clock} texto="Esperando comprador" href={doPedido} dica={`Pedido #${pedido.id} esperando o comprador`} />
        )}
        {pedido?.enviado && <BotaoQuadrado icone={PackageCheck} texto="Pedido enviado" href={doPedido} dica={`Pedido #${pedido.id} enviado`} />}
        {contagem ? (
          <BotaoQuadrado
            icone={ClipboardList}
            texto={`Continuar ${contagem.feitos}/${contagem.total}`}
            tom={pedido ? "normal" : "primario"}
            href={`/estoquista/contagem/${contagem.token}`}
            dica={`Continuar a contagem: ${contagem.feitos} de ${contagem.total}`}
          />
        ) : (
          <BotaoQuadrado
            icone={ClipboardList}
            texto={pedido ? "Contar de novo" : "Contar agora"}
            tom={pedido ? "normal" : "primario"}
            desligado={pendente}
            onClick={contar}
          />
        )}
        <BotaoQuadrado icone={MessageCircle} texto="Mandar link" desligado={pendente} onClick={mandarLink} dica="Mandar o link da contagem no WhatsApp" />
        {pedidoAMao && <BotaoQuadrado icone={PencilLine} texto="Pedido à mão" href={pedidoAMao} dica="Fazer o pedido à mão, sem contar" />}
      </FileiraDeBotoes>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </div>
  );
}
