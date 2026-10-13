/**
 * De quanto em quanto a casa compra, num lugar só.
 *
 * Três lugares precisam da MESMA resposta: a conta da sugestão (servidor, em
 * `Decimal`), a tela de conferência (navegador, em `number`) e a recusa do que
 * foi digitado (servidor de novo). Escrever a regra duas vezes, uma em cada
 * aritmética, é o erro que `lib/sugestao.ts` foi escrito para não deixar
 * acontecer — e aqui ele seria pior: a tela aceitaria 13 e o servidor
 * recusaria, ou o contrário.
 *
 * Este arquivo não importa Prisma nem banco. É o que permite o componente
 * cliente usá-lo: `lib/sugestao.ts` importa `@/lib/db`, e a tela só consegue
 * pegar TIPOS de lá porque tipo some na compilação.
 *
 * A conta é em MILÉSIMOS INTEIROS, e não em ponto flutuante nem em `Decimal`.
 *
 * Milésimo porque é o que o banco guarda: `Decimal(10, 3)`. Convertido, todo
 * número deste domínio vira inteiro exato em IEEE — o maior possível é
 * 999.999.999 e o limite seguro é 2^53 — e o resto de divisão volta a valer o
 * que se espera. Em ponto flutuante direto não vale: `0.3 % 0.1` dá 0,0999…, e
 * a tela recusaria 0,3 num produto de lote 0,1.
 *
 * `Decimal` ficaria correto e custaria caro: jogaria decimal.js dentro do
 * pacote do painel e criaria uma segunda classe `Decimal` dentro do processo
 * do servidor, com o `instanceof` do Prisma passando a depender de qual
 * entrada foi importada. Nenhum arquivo do projeto faz isso hoje.
 *
 * Quem tem `Decimal` converte na fronteira, com `.toNumber()`. É uma linha, e
 * só `lib/sugestao.ts` precisa dela.
 */

/** O banco guarda três casas. Abaixo disso não existe número neste domínio. */
const ESCALA = 1000;

/**
 * Para milésimo inteiro.
 *
 * O `Math.round` corta a quarta casa em diante, e isso é deliberado: é o mesmo
 * corte que o `Decimal(10, 3)` do banco faria na gravação. Um lote digitado
 * como "12,0004" é tratado como 12 aqui e vira 12 lá — fingir que a diferença
 * existe seria a tela recusando um número que o banco aceitaria.
 */
function emMilesimos(n: number): number {
  return Math.round(n * ESCALA);
}

/**
 * A falta, arredondada ao lote mais perto. Zero quer dizer "não compra".
 *
 * Meio lote arredonda para cima: faltando 6 de um lote de 12, compra 12.
 * Faltando 5, não compra nada — e esse zero não é erro, é a regra de "só vale
 * a pena se faltar pelo menos meio lote" caindo de graça do arredondamento ao
 * mais perto. As duas decisões do dono são uma fórmula só.
 *
 * Sem lote, devolve a falta como ela é. É o caso da maioria dos produtos, e é
 * por isso que o orégano continua podendo pedir cem gramas.
 */
export function arredondarAoLote(faltando: number, lote: number | null): number {
  if (lote === null || !Number.isFinite(faltando) || !Number.isFinite(lote)) {
    return faltando;
  }

  const f = emMilesimos(faltando);
  const l = emMilesimos(lote);
  // Lote zero ou negativo não é lote. O Zod barra na digitação; aqui a guarda
  // existe porque uma divisão por zero em silêncio viraria NaN percorrendo a
  // cotação inteira.
  if (l <= 0) return faltando;

  const resto = f % l;
  const cheios = (f - resto) / l;
  const lotes = resto * 2 >= l ? cheios + 1 : cheios;
  return (lotes * l) / ESCALA;
}

/**
 * Este número fecha o lote?
 *
 * Irmã de `arredondarAoLote` e não a mesma função, ainda que para número
 * positivo as duas concordem sempre. São perguntas de tipos diferentes: uma
 * transforma, e o zero dela é decisão de compra; esta decide, e o zero dela é
 * só um número que não fecha. Amarrar a recusa da tela a um arredondamento
 * obrigaria a mensagem de erro a explicar um resultado que ninguém pediu.
 *
 * O que amarra as duas é teste, não código — ver `scripts/test-lote.ts`.
 *
 * Sem lote, qualquer número fecha.
 */
export function serveNoLote(quantidade: number, lote: number | null): boolean {
  if (lote === null || !Number.isFinite(quantidade) || !Number.isFinite(lote)) {
    return true;
  }

  const l = emMilesimos(lote);
  if (l <= 0) return true;

  return emMilesimos(quantidade) % l === 0;
}

/**
 * Quantos lotes inteiros são.
 *
 * Só para a tela escrever "2 × 12" ao lado do número. É derivada, não é regra:
 * nada decide nada com o que sai daqui. Nulo quando não há lote ou quando a
 * quantidade não fecha, que são os dois casos em que a frase não faria sentido.
 */
export function lotesDe(quantidade: number, lote: number | null): number | null {
  if (lote === null || !serveNoLote(quantidade, lote)) return null;

  const l = emMilesimos(lote);
  if (l <= 0) return null;

  return emMilesimos(quantidade) / l;
}

/**
 * Os dois lotes fechados que cercam um número que não fecha, e o quanto falta
 * para chegar ao de cima.
 *
 * "215 não fecha o lote de 12" é a acusação; "faltam 1 para 216" é o que ele
 * faz com ela. Sem a conta pronta, quem confere 126 linhas divide de cabeça,
 * item por item, que é exatamente o trabalho que esta tela existe para tirar.
 *
 * `abaixo` é nulo quando o número está dentro do primeiro lote: aí não existe
 * compra menor, e oferecer zero como saída seria oferecer "não comprar" no
 * lugar onde ele está tentando comprar. Para isso a tela tem o ✕.
 *
 * Devolve nulo quando não há lote ou quando o número já fecha — os dois casos
 * em que não falta nada e a frase não teria o que dizer.
 */
export function faltaParaOLote(
  quantidade: number,
  lote: number | null,
): { falta: number; acima: number; abaixo: number | null } | null {
  if (lote === null || serveNoLote(quantidade, lote)) return null;

  const q = emMilesimos(quantidade);
  const l = emMilesimos(lote);
  if (l <= 0 || !Number.isFinite(q)) return null;

  /* O múltiplo de cima, direto do resto — e não por `arredondarAoLote`, que é
     o mais PERTO e devolveria o de baixo quando o resto passa da metade. */
  const resto = ((q % l) + l) % l;
  const acima = q - resto + l;
  const abaixo = acima - l;

  return {
    falta: (l - resto) / ESCALA,
    acima: acima / ESCALA,
    abaixo: abaixo > 0 ? abaixo / ESCALA : null,
  };
}
