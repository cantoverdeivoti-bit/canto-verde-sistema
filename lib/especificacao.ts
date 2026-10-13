/**
 * O que o produto tem que ser ("Resfriado", obrigatória) e o que a casa
 * prefere ("Sem osso", preferência) — e o que o fornecedor respondeu sobre
 * cada uma.
 *
 * Mora em JSON no banco (`Product.especificacoes`, `Preco.especificacoes`), e
 * JSON não tem tipo. Tudo que lê do banco passa por aqui: o que vier torto
 * — linha antiga, edição à mão — vira lista vazia ou some, em vez de derrubar
 * a página pública do fornecedor.
 */

export type Especificacao = { texto: string; obrigatoria: boolean };

export type RespostaEspecificacao = Especificacao & { atende: boolean };

/** Do banco para a tela, jogando fora o que não tem o formato. */
export function lerEspecificacoes(json: unknown): Especificacao[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((e) =>
    e && typeof e === "object" && typeof e.texto === "string" && e.texto.trim() !== ""
      ? [{ texto: e.texto.trim(), obrigatoria: e.obrigatoria === true }]
      : [],
  );
}

/** As respostas gravadas no preço, com o mesmo cuidado. */
export function lerRespostas(json: unknown): RespostaEspecificacao[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((e) =>
    e && typeof e === "object" && typeof e.texto === "string" && typeof e.atende === "boolean"
      ? [{ texto: e.texto, obrigatoria: e.obrigatoria === true, atende: e.atende }]
      : [],
  );
}

/** A comparação que decide se duas escritas são a mesma especificação. */
export const chaveDaEspecificacao = (texto: string) => texto.trim().toLocaleLowerCase("pt-BR");
