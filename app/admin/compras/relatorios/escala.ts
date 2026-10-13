import { formatMoney } from "@/lib/format";

/**
 * A escala dos eixos: valores redondos (1, 2, 2,5 ou 5 vezes uma potência de
 * dez), para o eixo ler "R$ 0 · R$ 5 mil · R$ 10 mil" e não "R$ 0 · R$ 4.873".
 */
function passoRedondo(bruto: number): number {
  if (bruto <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const n = bruto / potencia;
  const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return m * potencia;
}

/** Eixo que começa no zero: 0, um passo e dois passos, com o maior valor dentro. */
export function escalaDoZero(maior: number): { topo: number; marcas: number[] } {
  const passo = passoRedondo(maior / 2);
  const topo = Math.max(passo * 2, passo * Math.ceil(maior / passo));
  const marcas: number[] = [];
  for (let v = 0; v <= topo + passo / 2; v += passo) marcas.push(v);
  return { topo, marcas };
}

/**
 * Eixo que não começa no zero, para preço: do redondo abaixo do menor ao
 * redondo acima do maior. Preço sempre igual ganha uma faixa em volta.
 */
export function escalaDaFaixa(menor: number, maior: number): { base: number; topo: number; marcas: number[] } {
  const faixa = maior > menor ? maior - menor : Math.max(menor * 0.2, 0.1);
  const passo = passoRedondo(faixa / 2);
  let base = Math.max(0, Math.floor(menor / passo) * passo);
  let topo = Math.ceil(maior / passo) * passo;
  if (topo - base < passo) {
    base = Math.max(0, base - passo);
    topo += passo;
  }
  const marcas: number[] = [];
  for (let v = base; v <= topo + passo / 2; v += passo) marcas.push(Math.round(v * 10000) / 10000);
  return { base, topo, marcas };
}

/** "R$ 12,3 mil", "R$ 850" — curto, para eixo e rótulo. */
export function dinheiroCurto(valor: number): string {
  if (valor >= 1000) return `R$ ${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  if (valor >= 100 || Number.isInteger(valor)) return `R$ ${Math.round(valor).toLocaleString("pt-BR")}`;
  return formatMoney(valor);
}
