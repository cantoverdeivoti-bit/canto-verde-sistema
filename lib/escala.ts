import { porMes, type TipoContrato } from "@/lib/tipos-de-contrato";

/**
 * A escala do almoço, montada a partir de três fontes:
 *
 *   1. a semana fixa (quem fica em cada posto em cada dia da semana);
 *   2. as exceções de uma data (troca, extra, ou posto vazio só naquele dia);
 *   3. as férias, que tiram a pessoa do posto nos dias dela.
 *
 * Funções puras, sem banco: a página carrega as linhas e chama `montarSemana`,
 * e os testes (`scripts/test-escala.ts`) chamam as mesmas funções.
 *
 * Datas são texto "2026-10-06", no calendário da casa. Nada aqui converte fuso.
 *
 * Um posto pode ter um colaborador ou uma empresa terceirizada (garçons de
 * fora, chamados quando falta alguém). A empresa pode estar em vários postos
 * no mesmo dia, um por pessoa que ela manda, e não tem folga nem dia de
 * trabalho: nada disso vira aviso.
 */

export type Area = "COZINHA" | "SALAO";

export const NOME_DA_AREA: Record<Area, string> = { COZINHA: "Cozinha", SALAO: "Salão" };

export type PessoaDaEscala = {
  id: number;
  /** O apelido, quando há; é o que a equipe lê. */
  nome: string;
  tipo: TipoContrato;
  area: Area | null;
  ativo: boolean;
  diaria: number | null;
  /** O free que ganha diferente em algum dia: dia da semana (0 = domingo) → diária. */
  diariasPorDia?: Partial<Record<number, number>>;
  salario: number | null;
  /** Os dias da semana (0 = domingo) em que trabalha. Vazio = sem dia marcado: vale qualquer um. */
  diasDeTrabalho?: number[];
};

/** Se o dia da semana é dia de trabalho da pessoa. Sem dias marcados, qualquer dia é. */
export const trabalhaNoDiaDaSemana = (p: { diasDeTrabalho?: number[] }, diaSemana: number) =>
  !p.diasDeTrabalho || p.diasDeTrabalho.length === 0 || p.diasDeTrabalho.includes(diaSemana);

/** A diária do free num dia da semana: a daquele dia, se tiver; senão, a de sempre. */
export const diariaDoDia = (
  p: { diaria: number | null; diariasPorDia?: Partial<Record<number, number>> },
  diaSemana: number,
): number | null => p.diariasPorDia?.[diaSemana] ?? p.diaria;

/** A empresa terceirizada, como a escala precisa dela. */
export type TerceirizadoDaEscala = {
  id: number;
  nome: string;
  ativo: boolean;
  /** Quanto cobra por pessoa por dia: cada posto ocupado é uma pessoa. */
  valorPorPessoa: number | null;
};

export type Posto = {
  id: number;
  area: Area;
  nome: string;
  ordem: number;
  /** Os dias da semana (0 = domingo) em que o posto não existe, como o bar de segunda a sexta. */
  diasFechados?: number[];
};
/** Um dos dois ids: o colaborador ou a empresa terceirizada. */
export type LinhaFixa = { postoId: number; diaSemana: number; colaboradorId: number | null; terceirizadoId?: number | null };
export type LinhaDoDia = {
  data: string;
  postoId: number;
  colaboradorId: number | null;
  /** A empresa terceirizada no posto. Os dois nulos = posto vazio. */
  terceirizadoId?: number | null;
  /** Fechado só nesta data. Falso num dia fechado na semana: abre só nesta data. */
  fechado?: boolean;
};
export type Periodo = { colaboradorId: number; inicio: string; fim: string };

/** Quem está no posto num dia, e de onde veio. */
export type Celula = {
  colaboradorId: number | null;
  /** A empresa terceirizada no posto, no lugar de um colaborador. */
  terceirizadoId: number | null;
  /** "fixa": da semana padrão; "dia": exceção desta data; "livre": posto sem ninguém na fixa. */
  origem: "fixa" | "dia" | "livre";
  /** Quem a fixa (ou a exceção) punha aqui, mas está de férias ou desligado. */
  ausente: { colaboradorId: number; motivo: "ferias" | "desligado" } | null;
  /** O posto não existe neste dia: não pede ninguém e não vira aviso. */
  fechado: boolean;
};

export type Aviso =
  | { tipo: "descoberto"; data: string; postoId: number; quem: number; motivo: "ferias" | "desligado" | "vazio" }
  | { tipo: "duplo"; data: string; colaboradorId: number; postoIds: number[] }
  | { tipo: "fora-do-dia"; data: string; colaboradorId: number; postoId: number }
  | { tipo: "sem-folga"; colaboradorId: number };

export type Semana = {
  /** As sete datas, de segunda a domingo. */
  dias: string[];
  /** Por posto, as sete células na ordem de `dias`. */
  celulas: Map<number, Celula[]>;
  /** Por dia (índice de `dias`), os CLT ativos que não trabalham nem estão de férias. */
  folgas: number[][];
  /**
   * Por dia, quem ganha por mês, está no dia de trabalho dele (marcado no
   * cadastro) e ficou sem posto. Sem dias marcados, a pessoa cai em `folgas`.
   */
  semPosto: number[][];
  /** Por dia, quem está de férias. */
  deFerias: number[][];
  avisos: Aviso[];
  /** As empresas terceirizadas, para o nome na célula e o custo. */
  terceirizados: TerceirizadoDaEscala[];
};

/** 0 = domingo, como `getUTCDay` e a coluna `diaSemana`. */
export function diaDaSemana(data: string): number {
  return new Date(`${data}T12:00:00Z`).getUTCDay();
}

export function somarDias(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A segunda-feira da semana de uma data. A semana da casa começa na segunda. */
export function segundaDaSemana(data: string): string {
  const dow = diaDaSemana(data);
  return somarDias(data, dow === 0 ? -6 : 1 - dow);
}

export function estaDeFerias(periodos: Periodo[], colaboradorId: number, data: string): boolean {
  return periodos.some((p) => p.colaboradorId === colaboradorId && p.inicio <= data && data <= p.fim);
}

export function montarSemana({
  segunda,
  postos,
  fixa,
  doDia,
  ferias,
  pessoas,
  terceirizados = [],
}: {
  segunda: string;
  postos: Posto[];
  fixa: LinhaFixa[];
  doDia: LinhaDoDia[];
  ferias: Periodo[];
  pessoas: PessoaDaEscala[];
  terceirizados?: TerceirizadoDaEscala[];
}): Semana {
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
  const porId = new Map(pessoas.map((p) => [p.id, p]));
  const empresaAtiva = new Set(terceirizados.filter((t) => t.ativo).map((t) => t.id));
  const fixaPor = new Map(fixa.map((f) => [`${f.postoId}:${f.diaSemana}`, f]));
  const doDiaPor = new Map(doDia.map((d) => [`${d.postoId}:${d.data}`, d]));

  const celulas = new Map<number, Celula[]>();
  const avisos: Aviso[] = [];

  for (const posto of postos) {
    const linha: Celula[] = dias.map((data) => {
      const excecao = doDiaPor.get(`${posto.id}:${data}`);
      const linhaFixa = fixaPor.get(`${posto.id}:${diaDaSemana(data)}`);
      const daFixa = linhaFixa?.colaboradorId ?? null;
      const empresaDaFixa = linhaFixa?.terceirizadoId ?? null;
      const origem: Celula["origem"] = excecao ? "dia" : linhaFixa ? "fixa" : "livre";
      const previsto = excecao ? excecao.colaboradorId : daFixa;
      const empresa = excecao ? (excecao.terceirizadoId ?? null) : empresaDaFixa;
      const celula = (c: Partial<Celula>): Celula => ({
        colaboradorId: null,
        terceirizadoId: null,
        origem,
        ausente: null,
        fechado: false,
        ...c,
      });

      // Fechado: pela exceção da data, ou pelo dia da semana quando a data não tem exceção.
      const fechado = excecao ? excecao.fechado === true : (posto.diasFechados ?? []).includes(diaDaSemana(data));
      if (fechado) return celula({ origem: excecao ? "dia" : "fixa", fechado: true });

      // A exceção que esvazia um posto que a fixa preenchia: descoberto de propósito.
      if (excecao && excecao.colaboradorId === null && !excecao.terceirizadoId && daFixa !== null) {
        avisos.push({ tipo: "descoberto", data, postoId: posto.id, quem: daFixa, motivo: "vazio" });
      }
      // A empresa terceirizada: sem férias nem folga. Desativada, o posto fica vazio.
      if (empresa !== null) {
        return celula({ terceirizadoId: empresaAtiva.has(empresa) ? empresa : null });
      }
      if (previsto === null) return celula({});

      const pessoa = porId.get(previsto);
      const motivo = !pessoa || !pessoa.ativo ? "desligado" : estaDeFerias(ferias, previsto, data) ? "ferias" : null;
      if (motivo) {
        avisos.push({ tipo: "descoberto", data, postoId: posto.id, quem: previsto, motivo });
        return celula({ ausente: { colaboradorId: previsto, motivo } });
      }
      return celula({ colaboradorId: previsto });
    });
    celulas.set(posto.id, linha);
  }

  // A mesma pessoa em dois postos no mesmo dia.
  dias.forEach((data, i) => {
    const onde = new Map<number, number[]>();
    for (const posto of postos) {
      const quem = celulas.get(posto.id)![i].colaboradorId;
      if (quem !== null) onde.set(quem, [...(onde.get(quem) ?? []), posto.id]);
    }
    for (const [colaboradorId, postoIds] of onde) {
      if (postoIds.length > 1) avisos.push({ tipo: "duplo", data, colaboradorId, postoIds });
    }
  });

  const trabalhaNoDia = (colaboradorId: number, i: number) =>
    postos.some((p) => celulas.get(p.id)![i].colaboradorId === colaboradorId);

  // Quem ganha por mês (CLT e fixo) folga; o free só vem no dia escalado.
  const clt = pessoas.filter((p) => p.ativo && porMes(p.tipo));
  const deFerias = dias.map((data) => pessoas.filter((p) => p.ativo && estaDeFerias(ferias, p.id, data)).map((p) => p.id));
  const livres = dias.map((_, i) => clt.filter((p) => !trabalhaNoDia(p.id, i) && !deFerias[i].includes(p.id)));
  // Sem posto: no dia de trabalho marcado no cadastro. Folga: o resto (inclusive quem não marcou dias).
  const temDiaMarcado = (p: PessoaDaEscala) => (p.diasDeTrabalho?.length ?? 0) > 0;
  const semPosto = livres.map((ps, i) =>
    ps.filter((p) => temDiaMarcado(p) && trabalhaNoDiaDaSemana(p, diaDaSemana(dias[i]))).map((p) => p.id),
  );
  const folgas = livres.map((ps, i) => ps.map((p) => p.id).filter((id) => !semPosto[i].includes(id)));

  // Escalado num dia que não é dele (pelo cadastro).
  dias.forEach((data, i) => {
    for (const posto of postos) {
      const quem = celulas.get(posto.id)![i].colaboradorId;
      const pessoa = quem === null ? undefined : porId.get(quem);
      if (pessoa && !trabalhaNoDiaDaSemana(pessoa, diaDaSemana(data))) {
        avisos.push({ tipo: "fora-do-dia", data, colaboradorId: pessoa.id, postoId: posto.id });
      }
    }
  });

  // Quem ganha por mês escalado nos sete dias, sem folga na semana.
  for (const p of clt) {
    if (dias.every((_, i) => trabalhaNoDia(p.id, i))) avisos.push({ tipo: "sem-folga", colaboradorId: p.id });
  }

  return { dias, celulas, folgas, semPosto, deFerias, avisos, terceirizados };
}

/** O nome de quem está na célula: o colaborador ou a empresa terceirizada. */
export function quemNaCelula(
  semana: Pick<Semana, "terceirizados">,
  pessoas: PessoaDaEscala[],
  c: Pick<Celula, "colaboradorId" | "terceirizadoId">,
): string | null {
  if (c.terceirizadoId !== null) return semana.terceirizados.find((t) => t.id === c.terceirizadoId)?.nome ?? "?";
  if (c.colaboradorId !== null) return pessoas.find((p) => p.id === c.colaboradorId)?.nome ?? "?";
  return null;
}

/**
 * O custo da semana. Free: a diária de cada dia escalado (a do dia, ou a de
 * sempre). CLT: salário ÷ 30 × 7, a estimativa de uma semana de salário de
 * quem está ativo, trabalhe ou folgue. A empresa terceirizada entra com o
 * free: o valor por pessoa em cada posto que ocupa.
 */
/**
 * O custo de mão de obra da semana e de cada dia. Com `custos` (de
 * `custoDiarioDaPessoa`), entram os encargos e benefícios, como no CMO do
 * mês; sem eles, só o salário ÷ 30 e as diárias.
 */
export function custoDaSemana(
  semana: Semana,
  postos: Posto[],
  pessoas: PessoaDaEscala[],
  custos?: ReadonlyMap<number, { sempre: number; seEscalado: number }>,
) {
  // Quem está escalado em cada dia da semana (na ordem de semana.dias).
  const escalados = semana.dias.map((_, i) => {
    const noDia = new Set<number>();
    for (const p of postos) {
      const quem = semana.celulas.get(p.id)![i].colaboradorId;
      if (quem !== null) noDia.add(quem);
    }
    return noDia;
  });

  // CLT e fixo custam o mesmo todo dia, escalados ou não: o mês ÷ 30.
  let cltDoDia = 0;
  let freeTodoDia = 0;
  for (const p of pessoas) {
    if (!p.ativo) continue;
    const c = custos?.get(p.id);
    if (p.tipo !== "FREELANCER") cltDoDia += c ? c.sempre : (p.salario ?? 0) / 30;
    else freeTodoDia += c?.sempre ?? 0;
  }

  // Quem não tem valor cadastrado: "c12" é o colaborador, "t3" a empresa.
  const semValor = new Set<string>();
  const arred = (n: number) => Math.round(n * 100) / 100;
  const dias = semana.dias.map((data, i) => {
    let free = freeTodoDia;
    let diarias = 0;
    for (const p of pessoas) {
      if (!p.ativo || p.tipo !== "FREELANCER" || !escalados[i].has(p.id)) continue;
      const valor = diariaDoDia(p, diaDaSemana(data));
      diarias++;
      if (valor === null) semValor.add(`c${p.id}`);
      free += (valor ?? 0) + (custos?.get(p.id)?.seEscalado ?? 0);
    }
    // A empresa terceirizada: uma pessoa por posto ocupado, cada uma pelo valor dela.
    for (const posto of postos) {
      const id = semana.celulas.get(posto.id)![i].terceirizadoId;
      if (id === null) continue;
      const valor = semana.terceirizados.find((t) => t.id === id)?.valorPorPessoa ?? null;
      diarias++;
      if (valor === null) semValor.add(`t${id}`);
      free += valor ?? 0;
    }
    return { free, diarias, clt: cltDoDia };
  });

  // A semana é a soma dos dias como aparecem na tela, para os números baterem.
  const porDia = dias.map((d) => ({ free: arred(d.free), diarias: d.diarias, clt: arred(d.clt), total: arred(d.free) + arred(d.clt) }));
  const soma = (k: "free" | "clt" | "total") => arred(porDia.reduce((s, d) => s + d[k], 0));
  return {
    free: soma("free"),
    diarias: porDia.reduce((s, d) => s + d.diarias, 0),
    freeSemValor: semValor.size,
    clt: soma("clt"),
    total: soma("total"),
    /** O custo de cada dia, na ordem de semana.dias. */
    porDia: porDia.map((d) => ({ ...d, total: arred(d.total) })),
  };
}

const DIA_POR_EXTENSO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const ddmm = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;

/** O texto da semana para colar no grupo da equipe, dia a dia e por área. */
export function textoDoWhatsApp(semana: Semana, postos: Posto[], pessoas: PessoaDaEscala[]): string {
  const nome = (id: number) => pessoas.find((p) => p.id === id)?.nome ?? "?";
  const linhas = [`*Escala do almoço · ${ddmm(semana.dias[0])} a ${ddmm(semana.dias[6])}*`];
  semana.dias.forEach((data, i) => {
    linhas.push("", `*${DIA_POR_EXTENSO[diaDaSemana(data)]}, ${ddmm(data)}*`);
    for (const area of ["COZINHA", "SALAO"] as const) {
      const itens = postos
        .filter((p) => p.area === area)
        .flatMap((p) => {
          const quem = quemNaCelula(semana, pessoas, semana.celulas.get(p.id)![i]);
          return quem === null ? [] : [`${p.nome} ${quem}`];
        });
      if (itens.length > 0) linhas.push(`${NOME_DA_AREA[area]}: ${itens.join(" · ")}`);
    }
    if (semana.folgas[i].length > 0) linhas.push(`Folga: ${semana.folgas[i].map(nome).join(", ")}`);
    if (semana.deFerias[i].length > 0) linhas.push(`Férias: ${semana.deFerias[i].map(nome).join(", ")}`);
  });
  return linhas.join("\n");
}
