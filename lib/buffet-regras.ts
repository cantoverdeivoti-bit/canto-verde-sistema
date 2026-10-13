/**
 * As contas do Cardápio buffet, sem banco, para caber num teste
 * (`scripts/test-buffet.ts`). Quem busca no banco é `lib/buffet.ts`.
 *
 * Sem quantidade a produzir (decisão do dono), o custo do buffet é por kg: a
 * média simples do custo/kg dos pratos, como a planilha fazia. O custo total
 * do dia e o CMV ficam para quando houver quantidade.
 */

export const DIAS_DA_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;

/** 1 = segunda ... 7 = domingo, de uma data "YYYY-MM-DD". */
export function diaDaSemanaBuffet(data: string): number {
  const d = new Date(`${data}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** A média do custo/kg, ignorando prato sem custo. Nulo se nenhum tem. */
export function custoMedio(pratos: { custoKg: number | null }[]): number | null {
  const com = pratos.map((p) => p.custoKg).filter((c): c is number => c !== null);
  if (com.length === 0) return null;
  return Math.round((com.reduce((s, c) => s + c, 0) / com.length) * 100) / 100;
}

export type SituacaoDaMeta = "ok" | "atencao" | "acima";

/**
 * O grupo contra a meta de custo/kg: acima quando a média passa da meta;
 * atenção quando a média está dentro mas algum prato passa (como a coluna
 * "Nº de pratos acima" da planilha). Sem meta ou sem média, nulo.
 */
export function situacaoDoGrupo(media: number | null, meta: number | null, pratos: { custoKg: number | null }[]): SituacaoDaMeta | null {
  if (media === null || meta === null) return null;
  if (media > meta) return "acima";
  return pratos.some((p) => p.custoKg !== null && p.custoKg > meta) ? "atencao" : "ok";
}

export type Classe = "A" | "B" | "C";

/**
 * O peso do prato no custo/kg do dia: o custo/kg dele dividido pela soma do
 * custo/kg dos pratos do dia. A partir de `limiteA` é Classe A (alto
 * impacto), a partir de `limiteB` é B, abaixo é C. Sem custo, nulo.
 */
export function classeDoPrato(custoKg: number | null, somaDoDia: number, limiteA: number, limiteB: number): Classe | null {
  if (custoKg === null || somaDoDia <= 0) return null;
  const peso = custoKg / somaDoDia;
  return peso >= limiteA ? "A" : peso >= limiteB ? "B" : "C";
}

/** Um prato numa posição do buffet num dia. */
export type ItemDoDia = { grupoId: number; posicao: number; pratoId: number | null };
export type Troca = { grupoId: number; posicao: number; pratoId: number | null; motivo?: string | null };

/**
 * O cardápio de uma data: o do modelo, com as trocas daquela data por cima.
 * Troca sem prato tira o prato da posição; troca numa posição vazia no
 * modelo põe um prato lá. Ordenado por grupo e posição.
 */
export function cardapioDoDia(modelo: ItemDoDia[], trocas: Troca[]): (ItemDoDia & { trocado: boolean; motivo: string | null })[] {
  const chave = (i: { grupoId: number; posicao: number }) => `${i.grupoId}:${i.posicao}`;
  const porPosicao = new Map(modelo.map((i) => [chave(i), { ...i, trocado: false, motivo: null as string | null }]));
  for (const t of trocas) porPosicao.set(chave(t), { grupoId: t.grupoId, posicao: t.posicao, pratoId: t.pratoId, trocado: true, motivo: t.motivo ?? null });
  return [...porPosicao.values()].sort((a, b) => a.grupoId - b.grupoId || a.posicao - b.posicao);
}

/** O mesmo prato em mais de uma posição no mesmo dia: quase sempre engano ao montar. */
export function repetidosNoDia(itens: { pratoId: number | null; posicao: number; grupoId: number }[]): Map<number, number> {
  const conta = new Map<number, number>();
  for (const i of itens) if (i.pratoId !== null) conta.set(i.pratoId, (conta.get(i.pratoId) ?? 0) + 1);
  return new Map([...conta].filter(([, n]) => n > 1));
}

/** A ordem das janelas de produção, da véspera ao pós-serviço. */
export const ORDEM_DAS_JANELAS = ["D1_VESPERA", "D1_NOITE", "J1", "J2", "J3", "J4_SERVICO", "J5_POS_SERVICO"] as const;
export const ORDEM_DAS_CARGAS = ["DEFUMACAO", "NOTURNO", "VAPOR", "BRASEADO", "MEDIO", "ASSADO", "AR_SECO", "SEM_FORNO"] as const;

/**
 * Os pratos do dia por janela e, dentro dela, por carga do forno. O prato
 * sem janela definida vai para o fim, numa linha "sem fluxo", para alguém
 * completar o cadastro.
 */
export function porJanelaECarga<T extends { janela: string | null; carga: string | null; nome: string }>(
  pratos: T[],
): { janela: string | null; cargas: { carga: string | null; pratos: T[] }[] }[] {
  const ordemJ = (j: string | null) => (j === null ? 99 : ORDEM_DAS_JANELAS.indexOf(j as (typeof ORDEM_DAS_JANELAS)[number]));
  const ordemC = (c: string | null) => (c === null ? 99 : ORDEM_DAS_CARGAS.indexOf(c as (typeof ORDEM_DAS_CARGAS)[number]));
  const janelas = [...new Set(pratos.map((p) => p.janela))].sort((a, b) => ordemJ(a) - ordemJ(b));
  return janelas.map((janela) => {
    const daJanela = pratos.filter((p) => p.janela === janela);
    const cargas = [...new Set(daJanela.map((p) => p.carga))].sort((a, b) => ordemC(a) - ordemC(b));
    return {
      janela,
      cargas: cargas.map((carga) => ({
        carga,
        pratos: daJanela.filter((p) => p.carga === carga).sort((a, b) => a.nome.localeCompare(b.nome)),
      })),
    };
  });
}

/** As janelas que se fazem na véspera: o trabalho delas é para o almoço de amanhã. */
export const JANELAS_DA_VESPERA = ["D1_VESPERA", "D1_NOITE"] as const;
const daVespera = (j: string | null) => j !== null && (JANELAS_DA_VESPERA as readonly string[]).includes(j);

/**
 * O trabalho de um dia no forno: J1 a J5 do cardápio de hoje e, da véspera
 * (D-1), o que o cardápio de amanhã pede adiantar. O prato de hoje marcado
 * D-1 já foi feito ontem e não volta aqui.
 */
export function fluxoDoDia<T extends { janela: string | null; carga: string | null; nome: string }>(hoje: T[], amanha: T[]) {
  return {
    hoje: porJanelaECarga(hoje.filter((p) => !daVespera(p.janela))),
    paraAmanha: porJanelaECarga(amanha.filter((p) => daVespera(p.janela))),
  };
}

/**
 * Quantos pratos de uma janela vão ao forno combinado contra a capacidade.
 * Sem quantidade a produzir (decisão do dono), conta 1 GN por prato: é um
 * piso, não a conta exata.
 */
export function cargaDaJanela(pratos: { posto: string | null; carga: string | null }[], fornos: number, gnPorForno: number) {
  const noForno = pratos.filter((p) => (p.posto === "FORNO_COMBINADO" || p.posto === "COMBINADO_APOIO") && p.carga !== null && p.carga !== "SEM_FORNO").length;
  const capacidade = fornos * gnPorForno;
  return { noForno, capacidade, passa: noForno > capacidade };
}

/** O peso lançado de um prato no dia. */
export type PesoDoPrato = { pratoId: number; nome: string; kgProduzido: number; kgSobra: number | null; custoKg: number | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * O dia real, com o que a cozinha pesou: o custo do que foi feito (kg × custo
 * do kg), a média ponderada (o custo por kg do buffet daquele dia, em que o
 * arroz pesa o que saiu de arroz), e a sobra em kg, em reais e em % do custo.
 * Prato sem custo fica fora das contas e é contado à parte.
 */
export function custoDoDia(pesos: PesoDoPrato[]) {
  const comCusto = pesos.filter((p) => p.custoKg !== null && p.kgProduzido > 0);
  const kgProduzido = comCusto.reduce((s, p) => s + p.kgProduzido, 0);
  const custo = comCusto.reduce((s, p) => s + p.kgProduzido * p.custoKg!, 0);
  const kgSobra = comCusto.reduce((s, p) => s + (p.kgSobra ?? 0), 0);
  const custoSobra = comCusto.reduce((s, p) => s + (p.kgSobra ?? 0) * p.custoKg!, 0);
  const sobras = comCusto
    .filter((p) => (p.kgSobra ?? 0) > 0)
    .map((p) => ({ pratoId: p.pratoId, nome: p.nome, kg: p.kgSobra!, reais: r2(p.kgSobra! * p.custoKg!), pct: Math.round((p.kgSobra! / p.kgProduzido) * 100) }))
    .sort((a, b) => b.reais - a.reais);
  return {
    pratos: comCusto.length,
    semCusto: pesos.filter((p) => p.custoKg === null).length,
    kgProduzido: Math.round(kgProduzido * 1000) / 1000,
    custo: r2(custo),
    mediaPonderada: kgProduzido > 0 ? r2(custo / kgProduzido) : null,
    mediaSimples: custoMedio(comCusto),
    kgSobra: Math.round(kgSobra * 1000) / 1000,
    custoSobra: r2(custoSobra),
    desperdicioPct: custo > 0 ? Math.round((custoSobra / custo) * 1000) / 10 : null,
    sobras,
  };
}

/** Quanto o buffet custou por cliente: o custo do que foi feito, sobra incluída. */
export function custoPorCliente(custo: number, clientes: number | null): number | null {
  return clientes && clientes > 0 ? r2(custo / clientes) : null;
}

/**
 * O custo por categoria do prato (Bovino, Frituras, Folhas...): quantos
 * pratos, a média e a faixa do custo/kg, e quanto a categoria pesa na soma
 * do custo/kg do dia (a mesma conta da classe A/B/C). Da que mais pesa para
 * a que menos. Prato sem custo conta em `semCusto` e fica fora das contas.
 */
export function custoPorCategoria(pratos: { categoria: string | null; custoKg: number | null }[]) {
  const porCategoria = new Map<string, { custos: number[]; semCusto: number }>();
  for (const p of pratos) {
    const nome = p.categoria?.trim() || "Sem categoria";
    const c = porCategoria.get(nome) ?? { custos: [], semCusto: 0 };
    if (p.custoKg === null) c.semCusto++;
    else c.custos.push(p.custoKg);
    porCategoria.set(nome, c);
  }
  const total = pratos.reduce((s, p) => s + (p.custoKg ?? 0), 0);
  return [...porCategoria]
    .map(([categoria, c]) => {
      const soma = c.custos.reduce((s, x) => s + x, 0);
      return {
        categoria,
        pratos: c.custos.length + c.semCusto,
        semCusto: c.semCusto,
        media: c.custos.length ? r2(soma / c.custos.length) : null,
        minimo: c.custos.length ? r2(Math.min(...c.custos)) : null,
        maximo: c.custos.length ? r2(Math.max(...c.custos)) : null,
        pct: total > 0 ? Math.round((soma / total) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.categoria.localeCompare(b.categoria));
}

/** Um prato do dia com o que a cozinha precisa saber para adiantar. */
export type PratoParaAdiantar = { nome: string; janela: string | null; processoD1: string | null; defumar: boolean };

/**
 * Os pré-preparos do almoço de um dia: o que se faz na véspera (tarde e
 * noite) e o que o cadastro manda adiantar ("o que se adianta na véspera" ou
 * defumação), mesmo sem janela de véspera. Na ordem da véspera para a noite,
 * e por nome dentro de cada uma. O mesmo prato em duas cubas aparece uma vez.
 */
export function prePreparos<T extends PratoParaAdiantar>(pratos: T[]) {
  const unicos = [...new Map(pratos.map((p) => [p.nome, p])).values()];
  const daVespera = (p: T) => p.janela === "D1_VESPERA" || p.janela === "D1_NOITE";
  const adiantar = unicos.filter((p) => daVespera(p) || p.processoD1 !== null || p.defumar);
  const ordem = (p: T) => (p.janela === "D1_VESPERA" ? 0 : p.janela === "D1_NOITE" ? 1 : 2);
  return (["D1_VESPERA", "D1_NOITE", null] as const)
    .map((janela, i) => ({
      janela,
      pratos: adiantar.filter((p) => ordem(p) === i).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    }))
    .filter((g) => g.pratos.length > 0);
}
