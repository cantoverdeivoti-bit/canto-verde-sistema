import { custoEfetivo, escolherMelhoresOfertas, type Oferta, type PerfilDoFornecedor } from "../lib/escolha-automatica";

/**
 * "Escolher os melhores", sem banco: a conta de `lib/escolha-automatica.ts`.
 * Desconto por volume, pedido mínimo e desempate por prazo e estrelas.
 */

let falhas = 0;
function check(label: string, ok: boolean, detalhe = "") {
  if (!ok) falhas++;
  console.log(`${ok ? "✓" : "✗"} ${label}${detalhe ? ` — ${detalhe}` : ""}`);
}
const of = (precoId: number, f: number, p: number, extra: { conteudo?: number; acima?: number; desc?: number } = {}): Oferta => ({
  precoId,
  fornecedorId: f,
  precoUnitario: p,
  conteudo: extra.conteudo ?? null,
  descontoAcimaDe: extra.acima ?? null,
  descontoPrecoEmbalagem: extra.desc ?? null,
});
const perfil = (minimo: number | null, pontualidade: number | null, estrelas: number | null): PerfilDoFornecedor => ({
  minimo,
  pontualidade,
  estrelas,
});

// Caixa de 12 a R$ 24 (R$ 2/un); acima de 5 caixas, R$ 18 (R$ 1,50/un).
const caixa = of(1, 1, 2, { conteudo: 12, acima: 5, desc: 18 });
check("desconto vale ao alcançar 5 caixas", custoEfetivo(caixa, 60) === 90);
check("desconto não vale com 4 caixas", custoEfetivo(caixa, 48) === 96);

let r = escolherMelhoresOfertas([{ itemId: 1, quantidade: 60, ofertas: [caixa, of(2, 2, 1.8)] }], new Map());
check("desconto por volume ganha da tabela menor", r.get(1)?.precoId === 1);

const minimo = new Map([
  [1, perfil(200, null, null)],
  [2, perfil(null, null, null)],
]);
r = escolherMelhoresOfertas(
  [
    { itemId: 1, quantidade: 10, ofertas: [of(1, 1, 5), of(2, 2, 6)] },
    { itemId: 2, quantidade: 10, ofertas: [of(3, 2, 7)] },
  ],
  minimo,
);
check("abaixo do pedido mínimo perde o item", r.get(1)?.fornecedorId === 2);
r = escolherMelhoresOfertas([{ itemId: 1, quantidade: 10, ofertas: [of(1, 1, 5)] }], minimo);
check("único fornecedor do item fica, mesmo abaixo do mínimo", r.get(1)?.fornecedorId === 1);
r = escolherMelhoresOfertas([{ itemId: 1, quantidade: 10, ofertas: [of(1, 1, 5), of(2, 2, 6)] }], minimo, new Map([[1, 180]]));
check("o que já foi escolhido à mão conta para o mínimo", r.get(1)?.fornecedorId === 1);

const prazo = new Map([
  [1, perfil(null, 0.5, 5)],
  [2, perfil(null, 0.95, 3)],
]);
r = escolherMelhoresOfertas([{ itemId: 1, quantidade: 10, ofertas: [of(1, 1, 10), of(2, 2, 10.2)] }], prazo);
check("empate de 2%: ganha o mais pontual", r.get(1)?.fornecedorId === 2);
r = escolherMelhoresOfertas([{ itemId: 1, quantidade: 10, ofertas: [of(1, 1, 10), of(2, 2, 11)] }], prazo);
check("diferença de 10%: ganha o preço", r.get(1)?.fornecedorId === 1);
const estrelas = new Map([
  [1, perfil(null, 0.9, 3)],
  [2, perfil(null, 0.9, 4.5)],
]);
r = escolherMelhoresOfertas([{ itemId: 1, quantidade: 10, ofertas: [of(1, 1, 10), of(2, 2, 10.1)] }], estrelas);
check("mesmo prazo: ganha quem tem mais estrelas", r.get(1)?.fornecedorId === 2);

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
