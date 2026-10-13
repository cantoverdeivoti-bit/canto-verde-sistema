/**
 * "Escolher os melhores": a conta que pré-marca o vencedor de cada item da
 * cotação. Pura, sem banco, para dar para testar sozinha; quem lê e grava é
 * `escolherMelhores` em lib/actions/cotacao.ts.
 *
 * Três regras, nesta ordem:
 *
 * 1. Preço EFETIVO, e não o preço de tabela. Se a quantidade pedida alcança
 *    o "acima de N embalagens" que o fornecedor ofereceu, vale o preço com
 *    desconto. O menor subtotal da tela não sabe disso.
 * 2. Pedido mínimo. Um fornecedor cujo total ficaria abaixo do mínimo dele
 *    perde os itens para a segunda melhor oferta — senão a escolha mais
 *    barata no papel vira um pedido que ele não aceita. Se um item só tem
 *    ele, fica com ele: comprar caro é melhor que não comprar.
 * 3. Empate de até 3%: ganha quem entrega no prazo, depois quem tem mais
 *    estrelas. Três por cento numa caixa de tomate não paga um dia de atraso.
 *
 * Só sugere. Quem confirma é o dono, olhando o resumo.
 */

export type Oferta = {
  precoId: number;
  fornecedorId: number;
  precoUnitario: number;
  conteudo: number | null;
  descontoAcimaDe: number | null;
  descontoPrecoEmbalagem: number | null;
};

export type ItemParaEscolher = {
  itemId: number;
  quantidade: number;
  ofertas: Oferta[];
};

export type PerfilDoFornecedor = {
  /** Pedido mínimo em reais; nulo, sem mínimo. */
  minimo: number | null;
  /** Entregas no prazo, de 0 a 1; nulo, sem histórico. */
  pontualidade: number | null;
  /** Média de estrelas; nulo, sem avaliação. */
  estrelas: number | null;
};

export const EMPATE = 0.03;

/** O que custaria comprar `quantidade` desta oferta, com o desconto por volume quando ele vale. */
export function custoEfetivo(o: Oferta, quantidade: number): number {
  let unitario = o.precoUnitario;
  if (
    o.conteudo !== null &&
    o.conteudo > 0 &&
    o.descontoAcimaDe !== null &&
    o.descontoPrecoEmbalagem !== null &&
    quantidade / o.conteudo >= o.descontoAcimaDe
  ) {
    unitario = Math.min(unitario, o.descontoPrecoEmbalagem / o.conteudo);
  }
  return Math.round(unitario * quantidade * 100) / 100;
}

/** A melhor oferta de uma lista: a mais barata, ou, dentro do empate, a do fornecedor mais confiável. */
function melhor(ofertas: Oferta[], quantidade: number, perfis: Map<number, PerfilDoFornecedor>): Oferta {
  const custos = ofertas.map((o) => ({ o, c: custoEfetivo(o, quantidade) }));
  const menor = Math.min(...custos.map((x) => x.c));
  const empatados = custos.filter((x) => x.c <= menor * (1 + EMPATE));
  empatados.sort((a, b) => {
    const pa = perfis.get(a.o.fornecedorId);
    const pb = perfis.get(b.o.fornecedorId);
    const prazo = (pb?.pontualidade ?? -1) - (pa?.pontualidade ?? -1);
    if (prazo !== 0) return prazo;
    const estrelas = (pb?.estrelas ?? -1) - (pa?.estrelas ?? -1);
    if (estrelas !== 0) return estrelas;
    return a.c - b.c;
  });
  return empatados[0].o;
}

/**
 * A escolha de cada item: `itemId -> oferta`.
 *
 * `jaEscolhido` é o total, por fornecedor, do que o dono já marcou à mão:
 * ele conta para o mínimo, mas não é mexido.
 */
export function escolherMelhoresOfertas(
  itens: ItemParaEscolher[],
  perfis: Map<number, PerfilDoFornecedor>,
  jaEscolhido: Map<number, number> = new Map(),
): Map<number, Oferta> {
  const comOferta = itens.filter((i) => i.ofertas.length > 0 && i.quantidade > 0);
  const evitados = new Set<number>();

  // Cada volta tira um fornecedor abaixo do mínimo; o número de voltas é no
  // máximo o de fornecedores, então sempre termina.
  for (;;) {
    const escolha = new Map<number, Oferta>();
    for (const i of comOferta) {
      const permitidas = i.ofertas.filter((o) => !evitados.has(o.fornecedorId));
      escolha.set(i.itemId, melhor(permitidas.length > 0 ? permitidas : i.ofertas, i.quantidade, perfis));
    }

    const total = new Map(jaEscolhido);
    const quantidade = new Map(comOferta.map((i) => [i.itemId, i.quantidade]));
    for (const [itemId, o] of escolha) {
      total.set(o.fornecedorId, (total.get(o.fornecedorId) ?? 0) + custoEfetivo(o, quantidade.get(itemId)!));
    }

    // O pior caso primeiro: o que fica mais longe do próprio mínimo.
    let pior: { fornecedorId: number; falta: number } | null = null;
    for (const [fornecedorId, valor] of total) {
      if (evitados.has(fornecedorId)) continue;
      const minimo = perfis.get(fornecedorId)?.minimo ?? null;
      if (minimo === null || valor >= minimo) continue;
      // Só vale evitar se algum item dele tiver outra saída.
      const temAlternativa = comOferta.some(
        (i) =>
          escolha.get(i.itemId)?.fornecedorId === fornecedorId &&
          i.ofertas.some((o) => o.fornecedorId !== fornecedorId && !evitados.has(o.fornecedorId)),
      );
      if (!temAlternativa) continue;
      const falta = minimo - valor;
      if (pior === null || falta > pior.falta) pior = { fornecedorId, falta };
    }
    if (pior === null) return escolha;
    evitados.add(pior.fornecedorId);
  }
}
