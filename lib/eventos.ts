import type {
  CategoriaLinha,
  EtapaCardapio,
  EtapaChecklist,
  FormatoEvento,
  MotivoPerda,
  OrigemCliente,
  StatusEvento,
  TipoCliente,
  TipoEvento,
  TipoInteracao,
} from "@/generated/prisma/client";

import type { Tom } from "@/lib/cotacao-labels";

/**
 * Os nomes do módulo Eventos na tela, num lugar só.
 *
 * Só tipos do Prisma entram aqui, e tipo some na compilação: os componentes
 * cliente importam este arquivo sem arrastar o driver do banco.
 *
 * `Record` completo de propósito, como em `lib/cotacao-labels.ts`: um valor
 * novo no enum quebra o build aqui em vez de vazar o nome cru para a tela.
 */

export const STATUS_EVENTO: Record<StatusEvento, { texto: string; tom: Tom }> = {
  RASCUNHO: { texto: "rascunho", tom: "pendente" },
  ENVIADO: { texto: "esperando o cliente", tom: "pendente" },
  CONFIRMADO: { texto: "confirmado", tom: "feito" },
  REALIZADO: { texto: "realizado", tom: "neutro" },
  PERDIDO: { texto: "perdido", tom: "neutro" },
  CANCELADO: { texto: "cancelado", tom: "neutro" },
};

/** As abas da lista. A ordem é a do funil. */
export const ABAS_DE_EVENTO = [
  { chave: "orcamentos", nome: "Orçamentos", status: ["RASCUNHO", "ENVIADO"] },
  { chave: "andamento", nome: "Em andamento", status: ["CONFIRMADO"] },
  { chave: "concluidos", nome: "Concluídos", status: ["REALIZADO"] },
  { chave: "perdidos", nome: "Perdidos", status: ["PERDIDO", "CANCELADO"] },
] as const satisfies readonly { chave: string; nome: string; status: readonly StatusEvento[] }[];

export type ChaveDaAba = (typeof ABAS_DE_EVENTO)[number]["chave"];

export const TIPO_EVENTO: Record<TipoEvento, string> = {
  ANIVERSARIO: "Aniversário",
  CASAMENTO: "Casamento",
  CORPORATIVO: "Corporativo",
  FORMATURA: "Formatura",
  CONFRATERNIZACAO: "Confraternização",
  RELIGIOSO: "Batizado, comunhão",
  OUTRO: "Outro",
};

export const FORMATO_EVENTO: Record<FormatoEvento, string> = {
  SENTADO: "Sentado, à mesa",
  EM_PE: "Em pé, coquetel",
};

export const MOTIVO_PERDA: Record<MotivoPerda, string> = {
  PRECO: "Achou caro",
  DATA_INDISPONIVEL: "Data já ocupada",
  FECHOU_COM_OUTRO: "Fechou com outro lugar",
  DESISTIU: "Desistiu do evento",
  SEM_RESPOSTA: "Parou de responder",
  OUTRO: "Outro motivo",
};

export const CATEGORIA_LINHA: Record<CategoriaLinha, string> = {
  ESPACO: "Espaço",
  CARDAPIO: "Comida",
  BEBIDA: "Bebida",
  EQUIPE: "Equipe",
  DECORACAO: "Decoração",
  TERCEIRO: "Terceiros",
  CUSTO_INTERNO: "Custo interno",
  OUTRO: "Outro",
};

/** A etapa do menu em que o prato entra. A proposta agrupa o cardápio por ela. */
export const ETAPA_CARDAPIO: Record<EtapaCardapio, string> = {
  ENTRADA: "Entrada",
  PRINCIPAL: "Prato principal",
  ACOMPANHAMENTO: "Acompanhamento",
  SOBREMESA: "Sobremesa",
  FINGER_FOOD: "Finger food, salgadinho",
  BEBIDA: "Bebida",
  OUTRO: "Outro",
};

export const TIPO_CLIENTE: Record<TipoCliente, string> = {
  PESSOA: "Pessoa",
  EMPRESA: "Empresa",
};

export const ORIGEM_CLIENTE: Record<OrigemCliente, string> = {
  INSTAGRAM: "Instagram",
  WHATSAPP: "WhatsApp",
  INDICACAO: "Indicação",
  CLIENTE_DO_ALMOCO: "Cliente do almoço",
  PASSOU_NA_FRENTE: "Passou na frente",
  SITE: "Site",
  OUTRO: "Outro",
};

export const TIPO_INTERACAO: Record<TipoInteracao, string> = {
  LIGACAO: "Ligação",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
  VISITA: "Visita",
  REUNIAO: "Reunião",
  NOTA: "Anotação",
};

export const ETAPA_CHECKLIST: Record<EtapaChecklist, string> = {
  ANTES: "Antes",
  NO_DIA: "No dia",
  DEPOIS: "Depois",
};

/** Os alergênicos que mais se pergunta. A receita aceita outros, digitados. */
/** A etapa que a categoria da ficha sugere ao pôr o prato num cardápio. Quem monta troca se quiser. */
export function etapaDaFicha(categoria: string): EtapaCardapio {
  if (categoria === "Salada") return "ENTRADA";
  if (categoria === "Petisco/Antepasto") return "FINGER_FOOD";
  if (categoria === "Prato Principal" || categoria === "Massa") return "PRINCIPAL";
  if (categoria === "Sobremesa") return "SOBREMESA";
  if (categoria === "Bebida") return "BEBIDA";
  if (categoria === "Acompanhamento" || categoria === "Farofa/Crocante" || categoria === "Molho") return "ACOMPANHAMENTO";
  return "OUTRO";
}

/** "40 pessoas", "3 horas". Unidade abreviada ("un", "kg") fica como está. */
export function noPlural(unidade: string, n: number): string {
  return n !== 1 && ["pessoa", "hora", "unidade", "diária"].includes(unidade) ? `${unidade}s` : unidade;
}

/** Lista as chaves de um Record na ordem em que foram escritas, para montar select. */
export function opcoes<K extends string>(rotulos: Record<K, string>): { valor: K; texto: string }[] {
  return (Object.keys(rotulos) as K[]).map((valor) => ({ valor, texto: rotulos[valor] }));
}

/**
 * O checklist com que a casa começa, criado por um botão quando não existe
 * modelo nenhum. É o roteiro de quem já tocou evento: o que costuma ser
 * esquecido está aqui, e o dono edita o resto.
 *
 * `dias` é em relação ao dia do evento: -7 é uma semana antes.
 */
export const CHECKLIST_PADRAO: { texto: string; etapa: EtapaChecklist; dias: number | null }[] = [
  { texto: "Receber o sinal e mandar o comprovante", etapa: "ANTES", dias: -30 },
  { texto: "Fechar o cardápio com o cliente", etapa: "ANTES", dias: -15 },
  { texto: "Perguntar por restrições alimentares e alergias", etapa: "ANTES", dias: -15 },
  { texto: "Combinar decoração, bolo, música e fornecedores do cliente", etapa: "ANTES", dias: -10 },
  { texto: "Confirmar o número final de convidados", etapa: "ANTES", dias: -7 },
  { texto: "Escalar a equipe do evento", etapa: "ANTES", dias: -7 },
  { texto: "Fazer a compra dos insumos", etapa: "ANTES", dias: -3 },
  { texto: "Conferir bebidas, gelo e louça", etapa: "ANTES", dias: -1 },
  { texto: "Cobrar o saldo", etapa: "ANTES", dias: -1 },
  { texto: "Montar o salão e as mesas", etapa: "NO_DIA", dias: 0 },
  { texto: "Passar o roteiro do evento com a equipe", etapa: "NO_DIA", dias: 0 },
  { texto: "Recolher, limpar e conferir o salão", etapa: "DEPOIS", dias: 1 },
  { texto: "Pagar os extras e a equipe do evento", etapa: "DEPOIS", dias: 2 },
  { texto: "Agradecer e pedir a avaliação do cliente", etapa: "DEPOIS", dias: 2 },
];
