/**
 * As regras da busca do topo (a lupa), sem banco: o que a pessoa digitou vira
 * palavras sem acento e sem caixa, e um item casa quando TODAS as palavras
 * aparecem em algum dos campos dele ("joao silva" acha "João da Silva").
 * Testado em `scripts/test-busca.ts`; quem consulta o banco é
 * `app/admin/busca/route.ts`.
 */

import { chave } from "@/lib/format";

/** Abaixo disso a lista viraria o cadastro inteiro: a lupa espera mais letras. */
export const MINIMO_DE_LETRAS = 2;
/** Por grupo: o resto se acha refinando a busca. */
export const POR_GRUPO = 5;

export type Termo = {
  /** As palavras, sem acento e sem caixa. */
  palavras: string[];
  /** Só os dígitos (telefone, CPF): nulo com menos de 4, que casaria com tudo. */
  digitos: string | null;
  /** "#23" ou "23" sozinho: pode ser o número de um pedido. */
  numero: number | null;
  /** Começou com "#": é pedido e só pedido (sem as fichas com "23" no código). */
  soPedido: boolean;
};

/** Nulo quando é curto demais para buscar. */
export function lerTermo(q: string): Termo | null {
  const texto = chave(q).replace(/\s+/g, " ");
  if (texto.replace(/[#\s]/g, "").length < MINIMO_DE_LETRAS) return null;
  const digitos = q.replace(/\D/g, "");
  const numero = /^#?\s*(\d{1,9})$/.exec(texto)?.[1];
  return {
    palavras: texto.replace(/#/g, " ").split(" ").filter(Boolean),
    digitos: digitos.length >= 4 ? digitos : null,
    numero: numero ? Number(numero) : null,
    soPedido: numero !== undefined && texto.startsWith("#"),
  };
}

/** Todas as palavras aparecem no texto dos campos (juntos). */
export function casaTexto(
  termo: Termo,
  ...campos: (string | null | undefined)[]
): boolean {
  const alvo = chave(campos.filter(Boolean).join(" "));
  return termo.palavras.every((p) => alvo.includes(p));
}

/** Os dígitos digitados aparecem no campo (telefone, CPF), ignorando a máscara. */
export function casaDigitos(
  termo: Termo,
  ...campos: (string | null | undefined)[]
): boolean {
  if (!termo.digitos) return false;
  return campos.some((c) => c && c.replace(/\D/g, "").includes(termo.digitos!));
}

/**
 * Os que casam, quem começa com a busca primeiro (digitar "arr" quer o
 * "Arroz" antes do "Feijão com arroz"), e os ativos antes dos desligados.
 */
export function melhores<T>(
  itens: T[],
  casa: (i: T) => boolean,
  nome: (i: T) => string,
  termo: Termo,
  ativo: (i: T) => boolean = () => true,
): T[] {
  const primeira = termo.palavras[0] ?? "";
  return itens
    .filter(casa)
    .map((i) => ({
      i,
      ativo: ativo(i),
      comeca: chave(nome(i)).startsWith(primeira),
    }))
    .sort(
      (a, b) =>
        Number(b.ativo) - Number(a.ativo) ||
        Number(b.comeca) - Number(a.comeca) ||
        nome(a.i).localeCompare(nome(b.i), "pt-BR"),
    )
    .slice(0, POR_GRUPO)
    .map((x) => x.i);
}

export type Resultado = {
  titulo: string;
  detalhe?: string;
  href: string;
  apagado?: boolean;
};
export type Grupo = { nome: string; itens: Resultado[] };
