import type { TipoAviso } from "@/generated/prisma/client";

/**
 * Os três blocos dos avisos de Compras, na ordem em que aparecem: o pedido
 * que chegou com divergência (o que pede conferência), o recebido certo e o
 * resto (respostas de fornecedor, item em falta). A aba Avisos e o cartão
 * de notificações da página inicial separam pela mesma regra.
 */
export type BlocoDeAviso = "divergencia" | "recebido" | "outros";

/**
 * A cor de cada bloco é a prioridade: vermelho pede conferência agora,
 * amarelo é para olhar, verde só informa. `fundo` é o tom claro da mesma cor.
 */
export const BLOCOS_DE_AVISO: { chave: BlocoDeAviso; nome: string; cor: string; fundo: string }[] = [
  { chave: "divergencia", nome: "Com divergência", cor: "var(--destructive)", fundo: "var(--danger-soft)" },
  { chave: "recebido", nome: "Recebidos", cor: "var(--ok-strong)", fundo: "var(--ok-soft)" },
  { chave: "outros", nome: "Outros", cor: "var(--warn)", fundo: "var(--warn-soft)" },
];

export function blocoDoAviso(tipo: TipoAviso): BlocoDeAviso {
  if (tipo === "RECEBIDO_COM_DIFERENCA") return "divergencia";
  if (tipo === "RECEBIDO_OK") return "recebido";
  return "outros";
}

export const ehBlocoDeAviso = (v: unknown): v is BlocoDeAviso => BLOCOS_DE_AVISO.some((b) => b.chave === v);
