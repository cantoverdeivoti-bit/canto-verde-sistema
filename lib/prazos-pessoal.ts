/**
 * Os prazos do Departamento pessoal que pedem ação antes de vencer: o fim da
 * experiência, o ASO, as férias, os domingos seguidos na escala e a troca de
 * EPI. Sem banco: datas são texto "2026-10-11". Testado em
 * `scripts/test-prazos-pessoal.ts`.
 *
 * É aviso, não trava: a regra fina (a periodicidade do ASO, quantos domingos
 * seguidos) vem do médico do trabalho e da convenção do sindicato.
 */

import { diaDaSemana, somarDias } from "@/lib/escala";
import { diasDe, situacaoDeFerias, type PedacoDeFerias } from "@/lib/ferias";
import type { TipoContrato } from "@/lib/tipos-de-contrato";

/** Com quantos dias de antecedência cada prazo começa a aparecer. */
export const AVISO_EM_DIAS = { aso: 30, experiencia: 10, epi: 15, aprendiz: 30 } as const;

export type TipoDePrazo = "aso" | "experiencia" | "aprendiz" | "ferias" | "domingos" | "epi";

export type Prazo = {
  tipo: TipoDePrazo;
  colaboradorId: number;
  nome: string;
  /** "ASO vence em 12 dias (23/10)". */
  texto: string;
  /** Vencido ou para hoje: vai para o topo, em vermelho. */
  vencido: boolean;
  /** Para ordenar: dias até o prazo (negativo = já passou). */
  dias: number;
  /** ASO sem data no cadastro: a tela junta todos numa linha, para não afogar o resto. */
  semData?: boolean;
};

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Dias de `de` até `ate`: 0 no mesmo dia, negativo se `ate` já passou. */
export function diasAte(de: string, ate: string): number {
  return diasDe({ inicio: de, fim: ate }) - 1;
}

function quando(dias: number, data: string): string {
  if (dias < 0) return `venceu há ${-dias} ${-dias === 1 ? "dia" : "dias"} (${ddmm(data)})`;
  if (dias === 0) return `vence hoje (${ddmm(data)})`;
  return `vence em ${dias} ${dias === 1 ? "dia" : "dias"} (${ddmm(data)})`;
}

function trocaEm(dias: number, data: string): string {
  if (dias < 0) return `troca atrasada ${-dias} ${-dias === 1 ? "dia" : "dias"} (${ddmm(data)})`;
  if (dias === 0) return `troca prevista para hoje (${ddmm(data)})`;
  return `troca em ${dias} ${dias === 1 ? "dia" : "dias"} (${ddmm(data)})`;
}

export type ColaboradorDosPrazos = {
  id: number;
  nome: string;
  tipo: TipoContrato;
  /** CLT: carteira assinada. Fixo: começou na casa. Contam as férias. */
  inicioDasFerias: string | null;
  experienciaAte: string | null;
  /** Jovem aprendiz: o fim do contrato de aprendizagem. Nulo nos outros. */
  contratoAte?: string | null;
  asoValidoAte: string | null;
  manipulaAlimentos: boolean;
  ferias: PedacoDeFerias[];
};

/** Os prazos de uma pessoa ativa: experiência, ASO e férias. */
export function prazosDoColaborador(c: ColaboradorDosPrazos, hoje: string): Prazo[] {
  const prazos: Prazo[] = [];
  const de = (tipo: TipoDePrazo, texto: string, dias: number): Prazo => ({
    tipo,
    colaboradorId: c.id,
    nome: c.nome,
    texto,
    vencido: dias <= 0,
    dias,
  });

  // A experiência que acabou vira contrato por prazo indeterminado: só avisa até o último dia.
  if (c.tipo === "CLT" && c.experienciaAte) {
    const dias = diasAte(hoje, c.experienciaAte);
    if (dias >= 0 && dias <= AVISO_EM_DIAS.experiencia) {
      const texto = dias === 0 ? `experiência termina hoje (${ddmm(c.experienciaAte)})` : `experiência termina em ${dias} ${dias === 1 ? "dia" : "dias"} (${ddmm(c.experienciaAte)})`;
      prazos.push(de("experiencia", `${texto}: efetivar, prorrogar ou encerrar`, dias));
    }
  }

  // O contrato de aprendiz termina numa data: avisa 30 dias antes, para efetivar ou encerrar.
  if (c.tipo === "CLT" && c.contratoAte) {
    const dias = diasAte(hoje, c.contratoAte);
    if (dias >= 0 && dias <= AVISO_EM_DIAS.aprendiz) {
      const quando = dias === 0 ? "termina hoje" : `termina em ${dias} ${dias === 1 ? "dia" : "dias"}`;
      prazos.push(de("aprendiz", `contrato de aprendiz ${quando} (${ddmm(c.contratoAte)}): efetivar ou encerrar`, dias));
    }
  }

  // O ASO: a data de validade; sem ela, cobra do CLT e de quem manipula alimentos.
  if (c.asoValidoAte) {
    const dias = diasAte(hoje, c.asoValidoAte);
    if (dias <= AVISO_EM_DIAS.aso) prazos.push(de("aso", `ASO ${quando(dias, c.asoValidoAte)}`, dias));
  } else if (c.tipo === "CLT" || c.manipulaAlimentos) {
    prazos.push({ ...de("aso", c.manipulaAlimentos ? "sem ASO registrado (manipula alimentos)" : "sem ASO registrado", 0), vencido: false, semData: true });
  }

  if (c.tipo !== "FREELANCER" && c.inicioDasFerias) {
    const f = situacaoDeFerias(c.inicioDasFerias, hoje, c.ferias);
    if (f.estado === "vencida") {
      prazos.push(de("ferias", `férias vencidas: faltam ${f.faltam} dias, o prazo era ${ddmm(f.prazo)}`, f.diasAtePrazo));
    } else if (f.estado === "perto-do-prazo") {
      prazos.push(de("ferias", `férias: faltam ${f.faltam} dias para marcar até ${ddmm(f.prazo)}`, f.diasAtePrazo));
    }
  }
  return prazos;
}

/**
 * Quem trabalha mais domingos seguidos do que o limite. `domingos` vem em
 * ordem, cada um com quem está escalado nele; só conta a sequência que chega
 * ao domingo mais recente ou passa dele (a que ainda dá para mudar).
 */
export function domingosSeguidos(
  domingos: { data: string; escalados: ReadonlySet<number> }[],
  pessoas: { id: number; nome: string }[],
  limite: number,
  hoje: string,
): Prazo[] {
  const ultimoQuePassou = domingos.filter((d) => d.data <= hoje).at(-1)?.data ?? hoje;
  const prazos: Prazo[] = [];
  for (const p of pessoas) {
    let inicio: string | null = null;
    let seguidos = 0;
    let pior: { inicio: string; fim: string; n: number } | null = null;
    for (const d of domingos) {
      if (d.escalados.has(p.id)) {
        if (seguidos === 0) inicio = d.data;
        seguidos++;
        if (seguidos > limite && d.data >= ultimoQuePassou && (!pior || seguidos >= pior.n)) pior = { inicio: inicio!, fim: d.data, n: seguidos };
      } else {
        seguidos = 0;
      }
    }
    if (pior) {
      prazos.push({
        tipo: "domingos",
        colaboradorId: p.id,
        nome: p.nome,
        texto: `${pior.n} domingos seguidos na escala (${ddmm(pior.inicio)} a ${ddmm(pior.fim)}); o limite é ${limite}`,
        vencido: pior.fim <= hoje,
        dias: diasAte(hoje, pior.fim),
      });
    }
  }
  return prazos;
}

/** Os domingos de `semanasAntes` semanas atrás até `semanasDepois` semanas à frente. */
export function domingosEmVolta(hoje: string, semanasAntes: number, semanasDepois: number): string[] {
  const proximo = somarDias(hoje, (7 - diaDaSemana(hoje)) % 7);
  return Array.from({ length: semanasAntes + semanasDepois + 1 }, (_, i) => somarDias(proximo, (i - semanasAntes) * 7));
}

export type EntregaDosPrazos = {
  colaboradorId: number;
  nome: string;
  item: string;
  proximaTroca: string | null;
  desgastado: boolean;
};

/** A peça marcada como desgastada, ou com a troca chegando. Só entregas que ainda valem. */
export function prazosDeEpi(entregas: EntregaDosPrazos[], hoje: string): Prazo[] {
  const prazos: Prazo[] = [];
  for (const e of entregas) {
    const dias = e.proximaTroca ? diasAte(hoje, e.proximaTroca) : null;
    if (e.desgastado) {
      prazos.push({ tipo: "epi", colaboradorId: e.colaboradorId, nome: e.nome, texto: `${e.item}: marcado como desgastado, trocar`, vencido: true, dias: Math.min(dias ?? 0, 0) });
    } else if (dias !== null && dias <= AVISO_EM_DIAS.epi) {
      prazos.push({ tipo: "epi", colaboradorId: e.colaboradorId, nome: e.nome, texto: `${e.item}: ${trocaEm(dias, e.proximaTroca!)}`, vencido: dias <= 0, dias });
    }
  }
  return prazos;
}

/** Vencidos primeiro, depois o que vence antes. */
export function emOrdemDeUrgencia(prazos: Prazo[]): Prazo[] {
  return [...prazos].sort((a, b) => Number(b.vencido) - Number(a.vencido) || a.dias - b.dias || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** A próxima troca: a data da entrega mais os dias do item. Nulo sem troca prevista. */
export function proximaTrocaDe(data: string, trocaEmDias: number | null): string | null {
  return trocaEmDias && trocaEmDias > 0 ? somarDias(data, trocaEmDias) : null;
}
