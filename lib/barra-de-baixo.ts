import { atalhosDo, MODULES, type NomeDoIcone } from "@/lib/modules";

/**
 * A barra de baixo do celular: quatro atalhos e o "Menu". Cada pessoa
 * escolhe os seus em Configurações gerais → Página inicial, e a escolha fica
 * no mesmo campo da página inicial (`AdminUser.paginaInicial`, chave `barra`).
 *
 * Sem banco e sem sessão, como `lib/pagina-inicial.ts`: quem chama passa
 * `pode`, a pergunta de permissão, para a regra caber num teste.
 */

/** O número de cada módulo, igual ao do menu: o que espera alguém decidir. */
export const NUMERO_DO_MODULO: Record<string, "pendencias" | "cadastrosPendentes" | "sugestoesBuffet" | "treinamentosPendentes"> = {
  compras: "pendencias",
  pessoal: "cadastrosPendentes",
  buffet: "sugestoesBuffet",
  operacional: "treinamentosPendentes",
};

export type AtalhoDaBarra = {
  chave: string;
  /** O nome embaixo do símbolo, curto para caber em um quinto da tela. */
  nome: string;
  /** O nome na tela de escolher, onde cabe inteiro. */
  completo: string;
  icone: NomeDoIcone;
  href: string;
  /** Aparece para quem entra em pelo menos um deles. Vazio: para todos. */
  modulos: string[];
  /** Marca só no endereço exato (a raiz de um módulo não marca as telas dele). */
  exato?: boolean;
  /** Atalho de módulo: marca em qualquer tela do módulo que não tenha atalho próprio. */
  modulo?: string;
  contador?: (typeof NUMERO_DO_MODULO)[string];
};

/** As telas do dia a dia, as que se abrem várias vezes no expediente. */
const TELAS: AtalhoDaBarra[] = [
  { chave: "inicio", nome: "Início", completo: "Painel central", icone: "inicio", href: "/admin", modulos: [], exato: true },
  {
    chave: "programacao",
    nome: "Programação",
    completo: "Programação da casa",
    icone: "programacao",
    href: "/admin/agenda",
    modulos: ["comercial", "compras", "pessoal", "eventos", "tarefas", "financeiro"],
  },
  { chave: "reservas", nome: "Reservas", completo: "Painel de reservas", icone: "agenda", href: "/admin/comercial/painel", modulos: ["comercial"], exato: true },
  {
    chave: "pendencias",
    nome: "Pendências",
    completo: "Pendências de compras",
    icone: "pendencias",
    href: "/admin/compras/pendencias",
    modulos: ["compras"],
    contador: "pendencias",
  },
  { chave: "contagem", nome: "Contar", completo: "Contar estoque", icone: "contagem", href: "/admin/compras/contagem", modulos: ["compras"] },
  { chave: "recebimentos", nome: "Receber", completo: "Receber pedidos", icone: "recebimentos", href: "/admin/compras/recebimentos", modulos: ["compras"] },
  { chave: "pedidos", nome: "Pedidos", completo: "Pedidos de compra", icone: "pedidos", href: "/admin/compras/pedidos", modulos: ["compras"] },
  { chave: "produtos", nome: "Produtos", completo: "Produtos", icone: "produtos", href: "/admin/compras", modulos: ["compras"], exato: true },
  { chave: "escala", nome: "Escala", completo: "Escala da equipe", icone: "escala", href: "/admin/pessoal", modulos: ["pessoal"], exato: true },
  { chave: "pagar", nome: "A pagar", completo: "Contas a pagar", icone: "pagar", href: "/admin/financeiro/pagar", modulos: ["financeiro"] },
  { chave: "producao", nome: "Produção", completo: "Produção do buffet", icone: "producao", href: "/admin/buffet/producao", modulos: ["buffet"] },
  { chave: "fichas", nome: "Fichas", completo: "Fichas técnicas", icone: "receitas", href: "/admin/receituario", modulos: ["receituario"] },
  { chave: "tarefas", nome: "Tarefas", completo: "Quadros de tarefas", icone: "tarefas", href: "/admin/tarefas", modulos: ["tarefas"] },
];

/** O nome curto de cada módulo, quando o nome do menu não cabe na barra. */
const NOME_CURTO: Record<string, string> = {
  pessoal: "Pessoal",
  buffet: "Buffet",
  sistema: "Ajustes",
};

/** Cada módulo pronto, pela página de atalhos dele. */
const MODULOS: AtalhoDaBarra[] = MODULES.filter((m) => m.enabled).map((m) => ({
  chave: `mod-${m.slug}`,
  nome: NOME_CURTO[m.slug] ?? m.name,
  completo: `Módulo ${m.name}`,
  icone: m.icone,
  href: atalhosDo(m.slug),
  modulos: [m.slug],
  modulo: m.slug,
  contador: NUMERO_DO_MODULO[m.slug],
}));

export const ATALHOS_DA_BARRA: AtalhoDaBarra[] = [...TELAS, ...MODULOS];

/** Quantos atalhos cabem: o quinto lugar é do "Menu". */
export const MAXIMO_NA_BARRA = 4;

/** O que vê quem nunca escolheu. Quem não pode abrir um deles ganha o próximo do catálogo. */
export const BARRA_PADRAO = ["inicio", "pendencias", "reservas", "escala"];

/** Lê a escolha gravada; o que não tiver a forma certa vira nulo (o padrão). */
export function lerBarra(json: unknown): string[] | null {
  if (!json || typeof json !== "object") return null;
  const { barra } = json as Record<string, unknown>;
  return Array.isArray(barra) ? barra.filter((x): x is string => typeof x === "string") : null;
}

const permitido = (pode: (modulo: string) => boolean) => (i: AtalhoDaBarra) => i.modulos.length === 0 || i.modulos.some(pode);

/**
 * Os atalhos da pessoa, na ordem: a escolha dela (ou o padrão), sem o que ela
 * não pode abrir, sem chave que saiu do catálogo e no máximo quatro. Só o
 * padrão completa as vagas: quem escolheu três fica com três.
 */
export function montarBarra(escolha: string[] | null, pode: (modulo: string) => boolean): AtalhoDaBarra[] {
  const aceita = permitido(pode);
  const lista = [...new Set(escolha ?? BARRA_PADRAO)]
    .map((c) => ATALHOS_DA_BARRA.find((i) => i.chave === c))
    .filter((i): i is AtalhoDaBarra => i !== undefined && aceita(i));
  if (escolha === null) {
    for (const i of ATALHOS_DA_BARRA) {
      if (lista.length >= MAXIMO_NA_BARRA) break;
      if (aceita(i) && !lista.includes(i)) lista.push(i);
    }
  }
  return lista.slice(0, MAXIMO_NA_BARRA);
}

/** O catálogo que a pessoa pode escolher: só o que ela consegue abrir. */
export function catalogoDaBarra(pode: (modulo: string) => boolean) {
  return ATALHOS_DA_BARRA.filter(permitido(pode));
}

/**
 * Qual atalho marcar na tela atual: o de endereço mais comprido que bate; se
 * nenhum bate, o do módulo em que se está.
 */
export function atalhoAtivo(atalhos: AtalhoDaBarra[], caminho: string, moduloAtual?: string): string | null {
  const bate = (i: AtalhoDaBarra) =>
    !i.modulo && (i.exato ? caminho === i.href : caminho === i.href || caminho.startsWith(`${i.href}/`));
  const tela = atalhos.filter(bate).sort((a, b) => b.href.length - a.href.length)[0];
  if (tela) return tela.chave;
  return atalhos.find((i) => i.modulo && i.modulo === moduloAtual)?.chave ?? null;
}
