import type { NomeDoIcone } from "@/lib/modules";

/**
 * O que pode aparecer na página inicial e o que aparece para quem nunca
 * mexeu. Cada pessoa escolhe a sua (AdminUser.paginaInicial); a tela de
 * edição mora em Configurações gerais → Página inicial.
 *
 * Sem banco e sem sessão: quem chama passa `pode`, a pergunta de permissão,
 * para a regra caber num teste.
 */

type Item = { chave: string; nome: string; icone: NomeDoIcone; modulos: string[] };

/**
 * Os números do topo. `modulos`: aparece para quem entra em pelo menos um
 * deles (pendências soma Compras e Departamento pessoal).
 */
export const NUMEROS = [
  { chave: "reservas", nome: "Reservas hoje", icone: "agenda", modulos: ["comercial"] },
  { chave: "pendencias", nome: "Pendências", icone: "pendencias", modulos: ["compras", "pessoal"] },
  { chave: "receber", nome: "A receber", icone: "recebimentos", modulos: ["compras"] },
  { chave: "notificacoes", nome: "Notificações", icone: "notificacoes", modulos: ["compras"] },
] as const satisfies readonly Item[];

export type ChaveDeNumero = (typeof NUMEROS)[number]["chave"];

/** Os atalhos, quadrados grandes de tocar. */
export const ATALHOS_DA_INICIAL = [
  // A Programação da casa (a antiga Agenda; a chave fica, para não perder a escolha de ninguém): vale para quem entra em qualquer módulo que tem data.
  {
    chave: "agenda-geral",
    nome: "Programação",
    icone: "programacao",
    modulos: ["comercial", "compras", "pessoal", "eventos", "tarefas", "financeiro"],
    href: "/admin/agenda",
  },
  { chave: "agenda", nome: "Reservas do dia", icone: "agenda", modulos: ["comercial"], href: "/admin/comercial" },
  { chave: "contagem", nome: "Contar estoque", icone: "contagem", modulos: ["compras"], href: "/admin/compras/contagem" },
  { chave: "requisicoes", nome: "Compras de rotina", icone: "listas", modulos: ["compras"], href: "/admin/compras/listas" },
  { chave: "cotacao", nome: "Fazer cotação", icone: "cotacao", modulos: ["compras"], href: "/admin/compras/cotacao" },
  { chave: "pedido-manual", nome: "Pedido manual", icone: "manual", modulos: ["compras"], href: "/admin/compras/pedido-manual" },
  { chave: "pedidos", nome: "Pedidos", icone: "pedidos", modulos: ["compras"], href: "/admin/compras/pedidos" },
  { chave: "recebimentos", nome: "Receber pedidos", icone: "recebimentos", modulos: ["compras"], href: "/admin/compras/recebimentos" },
  { chave: "pendencias-compras", nome: "Pendências de compras", icone: "pendencias", modulos: ["compras"], href: "/admin/compras/pendencias" },
  { chave: "escala", nome: "Escala", icone: "escala", modulos: ["pessoal"], href: "/admin/pessoal" },
  { chave: "colaboradores", nome: "Colaboradores", icone: "colaboradores", modulos: ["pessoal"], href: "/admin/pessoal/colaboradores" },
  { chave: "ferias", nome: "Férias", icone: "ferias", modulos: ["pessoal"], href: "/admin/pessoal/ferias" },
  { chave: "cmo", nome: "CMO", icone: "relatorios", modulos: ["pessoal"], href: "/admin/pessoal/relatorios" },
  // Vale para quem entra em qualquer módulo: cada um escolhe os avisos do que vê.
  {
    chave: "minhas-notificacoes",
    nome: "Minhas notificações",
    icone: "notificacoes",
    modulos: ["comercial", "compras", "pessoal"],
    href: "/admin/sistema/notificacoes",
  },
] as const satisfies readonly (Item & { href: string })[];

export type ChaveDeAtalho = (typeof ATALHOS_DA_INICIAL)[number]["chave"];

/** O que vê quem nunca editou: os quatro números e os atalhos de sempre. */
export const PADRAO: { numeros: ChaveDeNumero[]; atalhos: ChaveDeAtalho[] } = {
  numeros: ["reservas", "pendencias", "receber", "notificacoes"],
  atalhos: ["agenda-geral", "agenda", "contagem", "cotacao", "pedido-manual", "pedidos", "recebimentos"],
};

export type PreferenciaDaInicial = { numeros: string[]; atalhos: string[] };

/** Lê o JSON gravado no usuário; o que não tiver a forma certa vira nulo (o padrão). */
export function lerPreferencia(json: unknown): PreferenciaDaInicial | null {
  if (!json || typeof json !== "object") return null;
  const { numeros, atalhos } = json as Record<string, unknown>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
  const n = lista(numeros);
  const a = lista(atalhos);
  return n && a ? { numeros: n, atalhos: a } : null;
}

/**
 * O que a pessoa vê, na ordem: a escolha dela (ou o padrão), sem o que ela
 * não pode abrir e sem chave que saiu do catálogo. `pode(slug)` responde se
 * a pessoa entra no módulo.
 */
export function montarPagina(preferencia: PreferenciaDaInicial | null, pode: (modulo: string) => boolean) {
  const escolha = preferencia ?? PADRAO;
  const permitido = (i: { modulos: readonly string[] }) => i.modulos.some(pode);
  const pegar = <T extends { chave: string; modulos: readonly string[] }>(catalogo: readonly T[], chaves: readonly string[]) =>
    [...new Set(chaves)]
      .map((c) => catalogo.find((i) => i.chave === c))
      .filter((i): i is T => i !== undefined && permitido(i));
  return {
    numeros: pegar(NUMEROS, escolha.numeros),
    atalhos: pegar(ATALHOS_DA_INICIAL, escolha.atalhos),
  };
}

/** O catálogo que a pessoa pode escolher: só o que ela consegue abrir. */
export function catalogoPermitido(pode: (modulo: string) => boolean) {
  const permitido = (i: { modulos: readonly string[] }) => i.modulos.some(pode);
  return { numeros: NUMEROS.filter(permitido), atalhos: ATALHOS_DA_INICIAL.filter(permitido) };
}
