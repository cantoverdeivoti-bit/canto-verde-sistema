import type {
  GrupoDre,
  OrigemLancamento,
  TipoConta,
  TipoFormaRecebimento,
  TipoLancamento,
} from "@/generated/prisma/client";

import type { Tom } from "@/lib/cotacao-labels";

/**
 * Os nomes do módulo Financeiro na tela, num lugar só.
 *
 * Só tipos do Prisma entram aqui, como em `lib/eventos.ts`: os componentes
 * cliente importam este arquivo sem arrastar o driver do banco. `Record`
 * completo de propósito, para um valor novo no enum quebrar o build aqui.
 */

export const TIPO_CONTA: Record<TipoConta, string> = {
  CAIXA: "Caixa (dinheiro)",
  BANCO: "Banco",
  CARTEIRA: "Carteira digital ou maquininha",
};

export const TIPO_LANCAMENTO: Record<TipoLancamento, string> = {
  PAGAR: "A pagar",
  RECEBER: "A receber",
};

/** Como a categoria se apresenta: receita ou despesa, e não "a receber". */
export const NATUREZA_DA_CATEGORIA: Record<TipoLancamento, string> = {
  PAGAR: "Despesa",
  RECEBER: "Receita",
};

export const TIPO_FORMA: Record<TipoFormaRecebimento, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  DEBITO: "Débito",
  CREDITO: "Crédito",
  VOUCHER: "Vale-refeição",
  OUTRO: "Outro",
};

export const ORIGEM_LANCAMENTO: Record<OrigemLancamento, string> = {
  MANUAL: "lançado à mão",
  RECORRENCIA: "conta fixa",
  FECHAMENTO: "fechamento do dia",
  COMPRA: "pedido de compra",
  EVENTO: "evento",
  EXTRATO: "extrato do banco",
};

/** A linha da DRE de cada grupo, na ordem do relatório. */
export const GRUPO_DRE: Record<GrupoDre, string> = {
  RECEITA_VENDAS: "Vendas",
  OUTRAS_RECEITAS: "Outras receitas",
  TAXA_SERVICO: "Taxa de serviço (da equipe)",
  IMPOSTOS: "Impostos sobre a venda",
  TAXAS_E_APPS: "Taxas de cartão e apps",
  CMV: "Custo da mercadoria (CMV)",
  PESSOAL: "Pessoal",
  OCUPACAO: "Ocupação",
  OPERACIONAL: "Operacional",
  ADMINISTRATIVO: "Administrativo",
  MARKETING: "Marketing",
  FINANCEIRO: "Financeiro",
  FORA_DO_RESULTADO: "Fora do resultado",
};

/** Uma frase do que cai em cada grupo: é o que ajuda a escolher. */
export const DICA_DO_GRUPO: Record<GrupoDre, string> = {
  RECEITA_VENDAS: "salão, eventos, delivery",
  OUTRAS_RECEITAS: "couvert, rolha, óleo usado",
  TAXA_SERVICO: "os 10% que vão para a equipe",
  IMPOSTOS: "DAS do Simples, ICMS, ISS",
  TAXAS_E_APPS: "maquininha, comissão do iFood",
  CMV: "insumos, bebidas, embalagens",
  PESSOAL: "salários, encargos, freelas",
  OCUPACAO: "aluguel, luz, água, IPTU",
  OPERACIONAL: "gás, manutenção, limpeza",
  ADMINISTRATIVO: "contador, sistemas, internet",
  MARKETING: "anúncios, redes sociais",
  FINANCEIRO: "tarifas, juros, rendimentos",
  FORA_DO_RESULTADO: "retirada de sócio, investimento, empréstimo",
};

/**
 * Que natureza cada grupo aceita. Venda é sempre receita; custo é sempre
 * despesa; financeiro e fora do resultado têm os dois lados (rendimento e
 * tarifa, aporte e retirada).
 */
export const NATUREZAS_DO_GRUPO: Record<GrupoDre, TipoLancamento[]> = {
  RECEITA_VENDAS: ["RECEBER"],
  OUTRAS_RECEITAS: ["RECEBER"],
  TAXA_SERVICO: ["PAGAR"],
  IMPOSTOS: ["PAGAR"],
  TAXAS_E_APPS: ["PAGAR"],
  CMV: ["PAGAR"],
  PESSOAL: ["PAGAR"],
  OCUPACAO: ["PAGAR"],
  OPERACIONAL: ["PAGAR"],
  ADMINISTRATIVO: ["PAGAR"],
  MARKETING: ["PAGAR"],
  FINANCEIRO: ["PAGAR", "RECEBER"],
  FORA_DO_RESULTADO: ["PAGAR", "RECEBER"],
};

/** As categorias que o sistema usa ao gerar lançamento (`CategoriaFinanceira.chave`). */
export const CHAVE_CATEGORIA = {
  vendasDoSalao: "VENDAS_SALAO",
  repasseTaxaServico: "REPASSE_TAXA_SERVICO",
  /** Não recebe lançamento: guarda o código contábil das taxas das maquininhas. */
  taxasDeCartao: "TAXAS_CARTAO",
  /** Contrapartida dos juros e multas das baixas, nas partidas para o contador. */
  jurosEMultas: "JUROS_MULTAS",
  /** Não recebe lançamento: guarda o código dos descontos das baixas. */
  descontos: "DESCONTOS",
} as const;

/**
 * As categorias que só guardam código contábil: o valor delas mora no campo
 * da baixa (taxa, desconto), e lançá-las à mão contaria duas vezes. Ficam
 * fora dos formulários de lançamento.
 */
export const SO_CODIGO: string[] = [CHAVE_CATEGORIA.taxasDeCartao, CHAVE_CATEGORIA.descontos];

/** O centro de custo que recebe as vendas do fechamento do dia. */
export const CHAVE_CENTRO_SALAO = "SALAO";

export type Situacao = "pago" | "cancelado" | "vencido" | "hoje" | "aberto";

export const SITUACAO: Record<Situacao, { texto: string; tom: Tom }> = {
  pago: { texto: "pago", tom: "feito" },
  cancelado: { texto: "cancelado", tom: "neutro" },
  vencido: { texto: "vencido", tom: "destrutivo" },
  hoje: { texto: "vence hoje", tom: "pendente" },
  aberto: { texto: "em aberto", tom: "neutro" },
};

/** "recebido" na tela de receber, "pago" na de pagar. */
export function textoDaSituacao(s: Situacao, tipo: TipoLancamento): string {
  if (s === "pago" && tipo === "RECEBER") return "recebido";
  return SITUACAO[s].texto;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-10" vira "outubro de 2026". */
export function nomeDoMes(mes: string): string {
  return `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
}

/** "2026-10" vira "out/26". */
export function mesCurto(mes: string): string {
  return `${MESES[Number(mes.slice(5, 7)) - 1].slice(0, 3)}/${mes.slice(2, 4)}`;
}
