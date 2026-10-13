import type { CargaForno, CorForno, JanelaProducao, PostoBuffet, ViabilidadeForno } from "@/generated/prisma/client";

/**
 * Os nomes do Cardápio buffet para a tela. Sem banco: serve à página e ao
 * componente do navegador.
 */

export const POSTO_BUFFET: Record<PostoBuffet, string> = {
  FORNO_COMBINADO: "Forno combinado",
  COMBINADO_APOIO: "Combinado + apoio",
  FOGAO_FRITADEIRA: "Fogão / fritadeira",
  PRACA_FRIA: "Praça fria",
};

/** Os patamares de carga do forno, como na aba 4. FLUXO da planilha. */
export const CARGA_FORNO: Record<CargaForno, { nome: string; temperatura: string; umidade: string; dica: string }> = {
  DEFUMACAO: { nome: "0 · Defumação", temperatura: "80–110 °C", umidade: "0–20%", dica: "Carnes que passam por fumaça antes de assar ou brasear." },
  NOTURNO: { nome: "N · Noturno", temperatura: "65–85 °C", umidade: "20–40%", dica: "Cocção noturna de carnes com sonda e retenção (cook & hold)." },
  VAPOR: { nome: "1 · Vapor", temperatura: "90–100 °C", umidade: "100%", dica: "Legumes, ovos, aipim, grãos, massas e arroz." },
  BRASEADO: { nome: "2 · Braseado", temperatura: "120–140 °C", umidade: "50–80%", dica: "Carnes longas, pernil, costela, pururuca." },
  MEDIO: { nome: "3 · Médio", temperatura: "160–170 °C", umidade: "20–40%", dica: "Pescados, medalhões, risotos, lasanhas e massas gratinadas." },
  ASSADO: { nome: "4 · Assado", temperatura: "180 °C", umidade: "20–30%", dica: "Assados de volume, refogados em GN, batatas e legumes corados." },
  AR_SECO: { nome: "5 · Ar seco", temperatura: "200–240 °C", umidade: "0%", dica: "Empanados adaptados da fritura e douramento final." },
  SEM_FORNO: { nome: "Sem forno", temperatura: "—", umidade: "—", dica: "Praça fria, fogão com mexedura e fritura por imersão." },
};

export const JANELA_PRODUCAO: Record<JanelaProducao, { nome: string; dica: string }> = {
  D1_VESPERA: { nome: "D-1 · Véspera", dica: "Brasear carnes longas, defumar, assar sobremesas de forno e deixar bases prontas." },
  D1_NOITE: { nome: "D-1 · Noite", dica: "Carnes em cocção noturna de baixa temperatura, com o forno trabalhando sozinho." },
  J1: { nome: "J1", dica: "Primeira carga: assados de volume e itens de maior tempo." },
  J2: { nome: "J2", dica: "Vapor (legumes, ovos, aipins), arroz e massas. Corte e montagem da praça fria." },
  J3: { nome: "J3", dica: "Finalização: ar seco para dourar, empanados adaptados e gratinados." },
  J4_SERVICO: { nome: "J4 · Serviço", dica: "Reposição durante o serviço: cargas curtas sob demanda." },
  J5_POS_SERVICO: { nome: "J5 · Pós-serviço", dica: "Iniciar a defumação e os braseados do dia seguinte, higienizar." },
};

export const VIABILIDADE_FORNO: Record<ViabilidadeForno, string> = {
  TOTAL: "Total no combinado",
  PARCIAL: "Parcial",
  NAO_RECOMENDADO: "Não recomendado",
  NAO_APLICAVEL: "Não se aplica",
};

/** Verde = 100% no forno combinado; azul = uma etapa fora antes de finalizar nele. */
export const COR_FORNO: Record<CorForno, { nome: string; cor: string | null }> = {
  VERDE: { nome: "Verde: 100% no combinado", cor: "#22b14c" },
  AZUL: { nome: "Azul: parcial no combinado", cor: "#2f7de1" },
  NENHUMA: { nome: "Sem cor", cor: null },
};

/** "R$ 18,13/kg", ou "sem custo". */
export function custoKgTexto(custo: number | null): string {
  if (custo === null) return "sem custo";
  return `${custo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}/kg`;
}

/** "2026-10-01" -> "01/10". */
export const ddmm = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/** O tom de cada situação contra a meta: verde, ouro e vinho da casa. */
export const TOM_DA_SITUACAO = {
  ok: { texto: "dentro da meta", cor: "var(--ok-strong)", fundo: "var(--ok-soft)" },
  atencao: { texto: "prato acima da meta", cor: "var(--warn)", fundo: "var(--warn-soft)" },
  acima: { texto: "média acima da meta", cor: "var(--destructive)", fundo: "var(--danger-soft)" },
} as const;

/** "Forno combinado · 4 · Assado · J1": o como e o quando do prato, numa linha. */
export function comoFazer(p: { posto: PostoBuffet | null; carga: CargaForno | null; janela: JanelaProducao | null }) {
  return [p.posto && POSTO_BUFFET[p.posto], p.carga && CARGA_FORNO[p.carga].nome, p.janela && JANELA_PRODUCAO[p.janela].nome].filter(Boolean).join(" · ");
}
