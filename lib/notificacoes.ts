/**
 * Os avisos que o sistema manda, e o que cada pessoa escolheu receber.
 *
 * Cada pessoa escolhe a sua (AdminUser.notificacoes), por evento e por
 * canal: celular (o pop-up do Web Push) e e-mail. Só aparece o evento do
 * módulo em que ela entra. A tela mora em Configurações gerais → Minhas
 * notificações; quem manda é `lib/notificar.ts`.
 *
 * Sem banco e sem sessão: quem chama passa `pode`, a pergunta de permissão,
 * para a regra caber num teste.
 */

export const EVENTOS = [
  {
    chave: "compras-divergencia",
    nome: "Pedido com divergência",
    detalhe: "Chegou faltando, sobrando ou diferente do pedido.",
    modulo: "compras",
    secao: "Com divergência",
  },
  {
    chave: "compras-recebimento",
    nome: "Pedido recebido certo",
    detalhe: "Chegou tudo como foi pedido.",
    modulo: "compras",
    secao: "Recebido",
  },
  {
    chave: "compras-fornecedor",
    nome: "Fornecedor respondeu",
    detalhe: "Pedido ou cotação respondida, cotação recusada, item em falta.",
    modulo: "compras",
    secao: "Outros",
  },
  {
    chave: "compras-pedido-para-enviar",
    nome: "Pedido da rotina para enviar",
    detalhe: "O estoquista contou a compra de rotina e o pedido espera você revisar e mandar ao fornecedor.",
    modulo: "compras",
    secao: "Outros",
    // Só quem pode mandar o pedido: o estoquista conta, mas não envia.
    soQuemConfigura: true,
  },
  {
    chave: "compras-contagem",
    nome: "Contagem finalizada",
    detalhe: "A contagem geral do estoque, com a lista do que comprar.",
    modulo: "compras",
    secao: "Outros",
  },
  {
    chave: "compras-atrasado",
    nome: "Pedidos atrasados",
    detalhe: "Uma vez por dia, de manhã: os que passaram da data de entrega.",
    modulo: "compras",
    secao: "Outros",
  },
  {
    chave: "compras-prazo",
    nome: "Prazos vencidos",
    detalhe: "Cotação sem resposta ou contagem sem finalizar quando o prazo acabou.",
    modulo: "compras",
    secao: "Outros",
  },
  {
    chave: "compras-relatorio",
    nome: "Relatório semanal de compras",
    detalhe: "Quando o relatório agendado fica pronto, com o link para baixar o PDF.",
    modulo: "compras",
    secao: "Outros",
  },
  {
    chave: "reserva-nova",
    nome: "Reserva nova",
    detalhe: "Feita pelo site.",
    modulo: "comercial",
  },
  {
    chave: "reserva-cancelada",
    nome: "Reserva cancelada",
    detalhe: "O cliente cancelou pelo link.",
    modulo: "comercial",
  },
  {
    chave: "buffet-sugestao",
    nome: "Sugestão no buffet",
    detalhe: "Alguém mudou o cardápio, uma troca do dia ou um prato, e espera a sua aprovação.",
    modulo: "buffet",
    // Só quem aprova: o colaborador que sugeriu não precisa ser avisado da própria sugestão.
    soQuemConfigura: true,
  },
  {
    chave: "pessoal-cadastro",
    nome: "Cadastro novo",
    detalhe: "Alguém se cadastrou pelo link e espera aprovação.",
    modulo: "pessoal",
  },
] as const;

export type ChaveDeEvento = (typeof EVENTOS)[number]["chave"];
export type Canal = "celular" | "email";
export type Escolha = { celular: boolean; email: boolean };
export type Preferencias = Partial<Record<ChaveDeEvento, Partial<Escolha>>>;

/** O padrão de quem nunca mexeu: celular ligado (quem já recebia continua), e-mail desligado. */
export const PADRAO: Escolha = { celular: true, email: false };

export function ehEvento(chave: string): chave is ChaveDeEvento {
  return EVENTOS.some((e) => e.chave === chave);
}

/** Lê o JSON gravado na pessoa; o que não tiver a forma certa é ignorado (vale o padrão). */
export function lerPreferencias(json: unknown): Preferencias {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: Preferencias = {};
  for (const [chave, valor] of Object.entries(json as Record<string, unknown>)) {
    if (!ehEvento(chave) || !valor || typeof valor !== "object") continue;
    const v = valor as Record<string, unknown>;
    const escolha: Partial<Escolha> = {};
    if (typeof v.celular === "boolean") escolha.celular = v.celular;
    if (typeof v.email === "boolean") escolha.email = v.email;
    out[chave] = escolha;
  }
  return out;
}

/**
 * O evento que nasceu de outro herda a escolha dele até a pessoa mexer:
 * "Pedido com divergência" saiu de "Pedido recebido", e quem recebia o
 * recebimento continua recebendo a divergência.
 */
const HERDA_DE: Partial<Record<ChaveDeEvento, ChaveDeEvento>> = {
  "compras-divergencia": "compras-recebimento",
  // O pedido da rotina vinha no aviso de contagem: quem tinha desligado, continua desligado.
  "compras-pedido-para-enviar": "compras-contagem",
};

/** O que vale para um evento: a escolha da pessoa por cima do padrão. */
export function escolhaDe(prefs: Preferencias, evento: ChaveDeEvento): Escolha {
  const origem = HERDA_DE[evento];
  return { ...PADRAO, ...(origem ? prefs[origem] : undefined), ...prefs[evento] };
}

/** Grava uma escolha, sem mexer nas outras. */
export function comEscolha(prefs: Preferencias, evento: ChaveDeEvento, canal: Canal, ligado: boolean): Preferencias {
  return { ...prefs, [evento]: { ...prefs[evento], [canal]: ligado } };
}

/**
 * Os eventos que a pessoa pode receber: só os dos módulos em que ela entra,
 * e os marcados `soQuemConfigura` só se ela configura o módulo.
 */
export function eventosPermitidos(pode: (modulo: string, configurar: boolean) => boolean) {
  return EVENTOS.filter((e) => pode(e.modulo, soQuemConfigura(e.chave)));
}

/** O evento é só de quem configura o módulo (quem decide, não quem executa). */
export const soQuemConfigura = (evento: ChaveDeEvento) => {
  const e = EVENTOS.find((x) => x.chave === evento)!;
  return "soQuemConfigura" in e && e.soQuemConfigura === true;
};

/** O módulo de um evento. */
export const moduloDo = (evento: ChaveDeEvento) => EVENTOS.find((e) => e.chave === evento)!.modulo;

/** E-mail simples o bastante para não aceitar erro de digitação óbvio. */
export function emailValido(texto: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto) && texto.length <= 200;
}
