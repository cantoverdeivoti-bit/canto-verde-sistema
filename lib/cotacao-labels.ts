import type { Tom } from "@/lib/tom";
import type {
  CotacaoFornecedorStatus,
  CotacaoStatus,
  MotivoSemPedido,
  PedidoCompraStatus,
  ProdutoNovoStatus,
} from "@/generated/prisma/client";

/**
 * Como cada estado da cotação se chama na tela, num lugar só.
 *
 * Estava escrito duas vezes e já tinha divergido: a lista dizia "comparando"
 * e o detalhe dizia "Comparando" para o mesmo estado. Pior, os estados sem
 * rótulo caíam num `toLowerCase()` do enum e a tela mostrava
 * "aguardando_entrega", com underline, para quem nunca ouviu falar de enum.
 *
 * `Record` completo de propósito: um estado novo no schema quebra o build
 * aqui em vez de vazar o nome cru para a tela.
 */

/**
 * O tom diz o papel, e o papel escolhe a cor — nunca o contrário.
 *
 * Mudou de casa para `lib/tom.ts` quando o módulo Tarefas precisou da mesma
 * decisão, e é reexportado daqui para nenhum dos arquivos que já o importavam
 * precisar mudar de import.
 */
export type { Tom } from "@/lib/tom";
export { corDoTom } from "@/lib/tom";

export const COTACAO_LABEL: Record<CotacaoStatus, { texto: string; tom: Tom }> = {
  CONTANDO: { texto: "contando", tom: "neutro" },
  ABERTA: { texto: "chame os fornecedores", tom: "pendente" },
  RESPONDENDO: { texto: "esperando preço", tom: "pendente" },
  FECHADA: { texto: "hora de comparar", tom: "neutro" },
  APROVADA: { texto: "pedidos gerados", tom: "feito" },
  DESCARTADA: { texto: "descartada", tom: "neutro" },
};

export const CHAMADO_LABEL: Record<
  CotacaoFornecedorStatus,
  { texto: string; tom: Tom }
> = {
  ENVIADA: { texto: "esperando resposta", tom: "pendente" },
  RESPONDIDA: { texto: "respondeu", tom: "feito" },
  RECUSADA: { texto: "recusou cotar", tom: "neutro" },
  EXPIRADA: { texto: "link venceu", tom: "neutro" },
};

/**
 * Em que pé está cada pedido.
 *
 * `CRIADO` volta a dizer "a enviar", e `ENVIADO` passa a existir de fato: a
 * página do pedido ganhou "Marcar como enviado" (`marcarEnviado`), e é ele
 * que separa "montei o pedido" de "o fornecedor já tem". Antes o rótulo dizia
 * "esperando chegar" para os dois, porque não havia passo de envio nenhum.
 *
 * `AGUARDANDO_FORNECEDOR` continua no enum só por causa das linhas antigas —
 * era o pedido direto esperando o exclusivo preencher o preço pelo link. Lê
 * como "a enviar", que é o que ele é hoje.
 */
/**
 * O rótulo do pedido, sabendo se ele é de atacado. No atacado não há o que
 * enviar a ninguém — a casa vai buscar —, então "a enviar" e "enviado" dizem
 * outra coisa: é uma lista esperando alguém ir comprar.
 */
export function rotuloDoPedido(estatus: PedidoCompraStatus, atacado = false): { texto: string; tom: Tom } {
  if (atacado && (estatus === "CRIADO" || estatus === "ENVIADO" || estatus === "AGUARDANDO_FORNECEDOR")) {
    return { texto: "a comprar no atacado", tom: "pendente" };
  }
  return PEDIDO_LABEL[estatus];
}

export const PEDIDO_LABEL: Record<PedidoCompraStatus, { texto: string; tom: Tom }> = {
  AGUARDANDO_FORNECEDOR: { texto: "a enviar", tom: "pendente" },
  CRIADO: { texto: "a enviar", tom: "pendente" },
  ENVIADO: { texto: "enviado · esperando chegar", tom: "pendente" },
  ENTREGUE: { texto: "entregue", tom: "feito" },
  PARCIAL_ENTREGUE: { texto: "entregue em parte", tom: "pendente" },
  CANCELADO: { texto: "cancelado", tom: "neutro" },
};

/** A mercadoria que chegou sem pedido: o nome do motivo e o que ele quer dizer. */
export const MOTIVO_SEM_PEDIDO: Record<MotivoSemPedido, { texto: string; dica: string }> = {
  BONIFICACAO: { texto: "Bonificação", dica: "brinde, sem custo" },
  TROCA: { texto: "Troca", dica: "repõe o que voltou" },
  BALCAO: { texto: "Compra de balcão", dica: "comprado na hora, com nota" },
};

/**
 * O produto que o estoquista achou fora do cadastro.
 *
 * "esperando você autorizar" e não "pendente": quem lê esta tela é quem tem
 * de fazer alguma coisa, e o rótulo diz o que é, não em que estado está.
 */
export const PRODUTO_NOVO_LABEL: Record<
  ProdutoNovoStatus,
  { texto: string; tom: Tom }
> = {
  PENDENTE: { texto: "esperando você autorizar", tom: "pendente" },
  APROVADO: { texto: "virou produto", tom: "feito" },
  RECUSADO: { texto: "recusado", tom: "neutro" },
};

/**
 * "3 de 5 fornecedores responderam".
 *
 * Vive aqui pela mesma razão dos rótulos acima: estava escrito nas duas telas
 * com grafias diferentes — a lista dizia "1/3 fornecedores responderam" e o
 * detalhe, "1 de 3 fornecedores respondeu" — para exatamente o mesmo fato.
 *
 * E o verbo concordava com o total em vez de com quantos responderam, então
 * cinco chamados com três respostas viravam "3 de 5 fornecedores respondeu".
 * Aqui cada número manda no que lhe cabe: o total escolhe entre fornecedor e
 * fornecedores, e quem respondeu escolhe o verbo.
 */
export function respostasLabel(respondidos: number, chamados: number): string {
  const substantivo = chamados === 1 ? "fornecedor" : "fornecedores";
  const verbo = respondidos === 1 ? "respondeu" : "responderam";
  return `${respondidos} de ${chamados} ${substantivo} ${verbo}`;
}
