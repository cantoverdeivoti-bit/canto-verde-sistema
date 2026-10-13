/**
 * Férias pela regra geral da CLT, como aviso e não como trava: a conta é da
 * contabilidade, a tela só não deixa ninguém esquecer.
 *
 * - A cada 12 meses de casa (período aquisitivo), 30 dias de direito.
 * - Eles têm de ser tirados nos 12 meses seguintes (período concessivo).
 * - Podem ser divididos em até 3 partes: uma de 14 dias ou mais, e nenhuma
 *   com menos de 5.
 *
 * Datas são texto "2026-10-06". Funções puras, testadas em `scripts/test-escala.ts`.
 */

import { somarDias } from "@/lib/escala";

export type PedacoDeFerias = { id?: number; inicio: string; fim: string };

/** Dias corridos de um pedaço, contando o primeiro e o último. */
export function diasDe(p: PedacoDeFerias): number {
  const ms = new Date(`${p.fim}T12:00:00Z`).getTime() - new Date(`${p.inicio}T12:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** O fim de um pedaço que começa em `inicio` e tem `dias` dias. */
export function fimDe(inicio: string, dias: number): string {
  return somarDias(inicio, dias - 1);
}

/** A mesma data `n` anos depois. 29/02 em ano que não é bissexto vira 28/02. */
export function somarAnos(data: string, n: number): string {
  const ano = Number(data.slice(0, 4)) + n;
  const mes = data.slice(5, 7);
  let dia = data.slice(8, 10);
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  if (mes === "02" && dia === "29" && !bissexto) dia = "28";
  return `${ano}-${mes}-${dia}`;
}

export type SituacaoDeFerias =
  | { estado: "sem-admissao" }
  | { estado: "primeiro-ano"; direitoEm: string }
  | {
      estado: "em-dia" | "perto-do-prazo" | "vencida";
      /** O período aquisitivo que deu este direito. */
      aquisitivo: { inicio: string; fim: string };
      /** Até quando tem de tirar. */
      prazo: string;
      /** Dias marcados dentro do prazo (pedaços que começam no período concessivo). */
      marcados: number;
      faltam: number;
      diasAtePrazo: number;
      /** Avisos da divisão dos pedaços deste período. */
      divisao: string[];
    };

/** Quantos dias faltam para o prazo acabar, quando ele está perto (60 dias). */
export const PERTO_DO_PRAZO = 60;

function diasEntre(de: string, ate: string): number {
  return diasDe({ inicio: de, fim: ate }) - 1;
}

/**
 * A situação de férias de um CLT hoje.
 *
 * Olha o período concessivo em que hoje cai. Se o anterior terminou sem os 30
 * dias marcados, a situação é "vencida" e fala dele: é o que pede ação já.
 */
export function situacaoDeFerias(admissao: string | null, hoje: string, pedacos: PedacoDeFerias[]): SituacaoDeFerias {
  if (!admissao) return { estado: "sem-admissao" };
  const primeiroDireito = somarAnos(admissao, 1);
  if (hoje < primeiroDireito) return { estado: "primeiro-ano", direitoEm: primeiroDireito };

  // k = anos completos de casa. O concessivo k vai de admissão + k anos até
  // admissão + (k + 1) anos − 1 dia.
  let k = 1;
  while (somarAnos(admissao, k + 1) <= hoje) k++;

  const periodo = (n: number) => {
    const inicioConcessivo = somarAnos(admissao, n);
    const prazo = somarDias(somarAnos(admissao, n + 1), -1);
    const doPeriodo = pedacos.filter((p) => p.inicio >= inicioConcessivo && p.inicio <= prazo);
    const marcados = doPeriodo.reduce((t, p) => t + diasDe(p), 0);
    return {
      aquisitivo: { inicio: somarAnos(admissao, n - 1), fim: somarDias(inicioConcessivo, -1) },
      prazo,
      marcados,
      divisao: avisosDaDivisao(doPeriodo),
    };
  };

  // O período anterior venceu sem os 30 dias: é ele que aparece.
  if (k >= 2) {
    const anterior = periodo(k - 1);
    if (anterior.marcados < 30) {
      return {
        estado: "vencida",
        ...anterior,
        faltam: 30 - anterior.marcados,
        diasAtePrazo: -diasEntre(anterior.prazo, hoje),
      };
    }
  }

  const atual = periodo(k);
  const faltam = Math.max(30 - atual.marcados, 0);
  const diasAtePrazo = diasEntre(hoje, atual.prazo);
  return {
    estado: faltam > 0 && diasAtePrazo < PERTO_DO_PRAZO ? "perto-do-prazo" : "em-dia",
    ...atual,
    faltam,
    diasAtePrazo,
  };
}

/** A divisão dos pedaços de um mesmo período, pela regra de 2017. */
export function avisosDaDivisao(pedacos: PedacoDeFerias[]): string[] {
  if (pedacos.length === 0) return [];
  const dias = pedacos.map(diasDe);
  const avisos: string[] = [];
  if (pedacos.length > 3) avisos.push("Dividida em mais de 3 partes.");
  if (dias.some((d) => d < 5)) avisos.push("Uma parte tem menos de 5 dias.");
  const total = dias.reduce((t, d) => t + d, 0);
  // Só cobra a parte de 14 quando o período já está todo marcado: com 10 dias
  // marcados, os 14 ainda podem vir.
  if (total >= 30 && !dias.some((d) => d >= 14)) avisos.push("Nenhuma parte tem 14 dias ou mais.");
  if (total > 30) avisos.push(`Marcados ${total} dias, mais que os 30 do período.`);
  return avisos;
}

/** Dois pedaços que se cruzam em algum dia. */
export function cruzam(a: PedacoDeFerias, b: PedacoDeFerias): boolean {
  return a.inicio <= b.fim && b.inicio <= a.fim;
}
