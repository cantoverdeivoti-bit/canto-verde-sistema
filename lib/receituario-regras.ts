/**
 * As contas do Receituário, sem banco: o custo de cada insumo (da última
 * compra em Compras ou do preço digitado), o custo de cada ficha (com os
 * pré-preparos que ela chama) e o preço sugerido.
 *
 * A ficha da planilha da casa somava só os insumos; o pré-preparo usado
 * como ingrediente (o creme de base, a almôndega) entrava sem custo. Aqui
 * ele entra pelo custo por grama da ficha dele.
 */

export type Unidade = "g" | "mL" | "un";

/**
 * As 10 cores que se escolhem para as categorias em Configurações. Fixas para
 * as faixas não ficarem parecidas demais e o texto branco ser lido em todas.
 */
export const PALETA = [
  { chave: "verde", nome: "Verde", hex: "#2f7d32" },
  { chave: "vermelho", nome: "Vermelho", hex: "#b3261e" },
  { chave: "laranja", nome: "Laranja", hex: "#d0661a" },
  { chave: "amarelo", nome: "Amarelo-escuro", hex: "#b8860b" },
  { chave: "marrom", nome: "Marrom", hex: "#7a5230" },
  { chave: "rosa", nome: "Rosa", hex: "#c2185b" },
  { chave: "roxo", nome: "Roxo", hex: "#6a3d9a" },
  { chave: "azul", nome: "Azul", hex: "#1f5fa8" },
  { chave: "petroleo", nome: "Azul-petróleo", hex: "#0f766e" },
  { chave: "grafite", nome: "Grafite", hex: "#4b5563" },
] as const;
export type CorDaPaleta = (typeof PALETA)[number]["chave"];
export const ehCorDaPaleta = (v: unknown): v is CorDaPaleta => PALETA.some((c) => c.chave === v);
const hexDa = (chave: CorDaPaleta) => PALETA.find((c) => c.chave === chave)!.hex;

/** As categorias da pasta de receitas: a letra do código e a cor padrão da faixa (a escolha das Configurações vai por cima). */
export const CATEGORIAS = [
  { nome: "Salada", letra: "E", cor: "verde" },
  { nome: "Entrada", letra: "E", cor: "petroleo" },
  { nome: "Petisco/Antepasto", letra: "A", cor: "roxo" },
  { nome: "Prato Principal", letra: "P", cor: "vermelho" },
  { nome: "Massa", letra: "M", cor: "amarelo" },
  { nome: "Acompanhamento", letra: "C", cor: "laranja" },
  { nome: "Farofa/Crocante", letra: "F", cor: "amarelo" },
  { nome: "Molho", letra: "H", cor: "marrom" },
  { nome: "Base/Fundo", letra: "B", cor: "grafite" },
  { nome: "Sobremesa", letra: "S", cor: "rosa" },
  { nome: "Bebida", letra: "D", cor: "azul" },
] as const satisfies readonly { nome: string; letra: string; cor: CorDaPaleta }[];

/** A chave da cor de cada categoria: a escolhida (se for da paleta) ou a padrão. */
export function chavesDasCores(escolhidas: unknown): Record<string, CorDaPaleta> {
  const e = escolhidas && typeof escolhidas === "object" ? (escolhidas as Record<string, unknown>) : {};
  return Object.fromEntries(CATEGORIAS.map((c) => [c.nome, ehCorDaPaleta(e[c.nome]) ? (e[c.nome] as CorDaPaleta) : c.cor]));
}

/** O hex de cada categoria, pronto para a faixa. */
export function coresDasCategorias(escolhidas: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(chavesDasCores(escolhidas)).map(([nome, chave]) => [nome, hexDa(chave)]));
}

/** A cor da faixa; categoria fora da lista fica cinza. */
export const corDaCategoria = (nome: string, cores: Record<string, string>) => cores[nome] ?? "#6b7280";

/** Onde a receita é usada. As duas últimas são as operações que a casa ainda vai abrir. */
export const OPERACOES = [
  { chave: "BUFFET", nome: "Buffet" },
  { chave: "DELIVERY", nome: "Delivery" },
  { chave: "EVENTOS", nome: "Eventos" },
  { chave: "CONGELADOS", nome: "Congelados" },
  { chave: "ENCOMENDA", nome: "Encomendas" },
] as const;
export type Operacao = (typeof OPERACOES)[number]["chave"];
export const ehOperacao = (v: unknown): v is Operacao => OPERACOES.some((o) => o.chave === v);

/** As etiquetas de quando ninguém mexeu na configuração: como a receita é feita. */
export const ETIQUETAS_PADRAO = ["Assado", "Cozido", "Grelhado", "Outros"];

/** Os que o convidado de evento e o cliente do delivery mais perguntam. */
export const ALERGENICOS_COMUNS = ["glúten", "lactose", "ovo", "castanhas", "amendoim", "frutos do mar", "peixe", "soja"];

/**
 * O preço como a cozinha e o comprador falam: R$ por kg, por litro ou por
 * unidade, a partir do preço por unidade de uso (g, mL, un).
 */
export function precoNaUnidade(porUso: number | null, uso: string): { valor: number; por: "kg" | "L" | "un" } | null {
  if (porUso === null) return null;
  if (uso === "un") return { valor: porUso, por: "un" };
  return { valor: porUso * 1000, por: uso === "mL" ? "L" : "kg" };
}

/** "ml", "ML", "Ml" → "mL"; o que não for g, mL ou un vira nulo. */
export function unidade(v: string | null | undefined): Unidade | null {
  const s = (v ?? "").trim().toLowerCase();
  if (s === "g") return "g";
  if (s === "ml") return "mL";
  if (s === "un" || s === "und" || s === "unid") return "un";
  return null;
}

/**
 * Quanto vale a unidade do produto de Compras em unidades de uso da ficha:
 * o kg tem 1000 g, o litro 1000 mL. Caixa, pacote e fardo não dizem quanto
 * cabe dentro, então não convertem (vale o preço digitado do insumo).
 */
export function fatorDaUnidadeDeCompras(unidadeDoProduto: string, uso: Unidade): number | null {
  const u = unidadeDoProduto.toUpperCase();
  if (uso === "g") return u === "KG" ? 1000 : u === "G" ? 1 : null;
  if (uso === "mL") return u === "L" ? 1000 : u === "ML" ? 1 : null;
  return u === "UN" ? 1 : null;
}

export type InsumoParaCusto = {
  unidadeUso: Unidade;
  precoCompra: number | null;
  qtdPorUnidade: number;
  /** Fator de correção: a fração do bruto que sobra útil (cebola 0,85). */
  rendimento: number;
  produto?: { unidade: string; ultimoCusto: { valor: number; em: string } | null } | null;
};

export type CustoDoInsumo = {
  /** R$ por unidade de uso, do jeito que se compra. */
  bruto: number | null;
  /** R$ por unidade de uso, já limpo (bruto ÷ rendimento): é o que a ficha usa. */
  liquido: number | null;
  origem: "compra" | "digitado" | null;
  /** A data da compra (ISO), quando o preço veio de Compras. */
  em: string | null;
};

/**
 * O preço do insumo por unidade de uso: a última compra recebida do produto
 * ligado, quando a unidade converte; senão o preço digitado.
 */
export function custoDoInsumo(i: InsumoParaCusto): CustoDoInsumo {
  const fc = i.rendimento > 0 ? i.rendimento : 1;
  const ultimo = i.produto?.ultimoCusto;
  const fator = i.produto ? fatorDaUnidadeDeCompras(i.produto.unidade, i.unidadeUso) : null;
  if (ultimo && fator) {
    const bruto = ultimo.valor / fator;
    return { bruto, liquido: bruto / fc, origem: "compra", em: ultimo.em };
  }
  if (i.precoCompra !== null && i.qtdPorUnidade > 0) {
    const bruto = i.precoCompra / i.qtdPorUnidade;
    return { bruto, liquido: bruto / fc, origem: "digitado", em: null };
  }
  return { bruto: null, liquido: null, origem: null, em: null };
}

export type LinhaParaCusto = {
  quantidade: number;
  unidade: Unidade | null;
  insumoId: number | null;
  subFichaId: number | null;
};

export type FichaParaCusto = {
  id: number;
  porcoes: number;
  rendimentoTotal: number | null;
  custoManualPorcao: number | null;
  ingredientes: LinhaParaCusto[];
};

export type CustoDaFicha = {
  total: number;
  porPorcao: number | null;
  /** R$ por unidade do rendimento (g ou mL): o que outra ficha paga ao chamar esta como pré-preparo. */
  porUnidade: number | null;
  /** R$ por kg (ou L) pronto. */
  porKg: number | null;
  /** Quanto se perde no preparo: 1 − rendimento ÷ soma das quantidades (fora as em unidade). */
  perda: number | null;
  /** Linhas com insumo ou pré-preparo sem preço: o total sai menor que a realidade. */
  semPreco: number;
  /** Cada linha: o custo dela, ou nulo quando não deu para calcular. */
  linhas: (number | null)[];
};

/**
 * O custo de todas as fichas de uma vez. Pré-preparo dentro de pré-preparo
 * funciona; ficha que acaba chamando a si mesma tem a linha do laço sem
 * preço, em vez de travar a conta.
 */
export function custosDasFichas(fichas: FichaParaCusto[], insumos: Map<number, CustoDoInsumo & { unidadeUso: Unidade }>): Map<number, CustoDaFicha> {
  const porId = new Map(fichas.map((f) => [f.id, f]));
  const pronto = new Map<number, CustoDaFicha>();
  const calculando = new Set<number>();

  function calcular(id: number): CustoDaFicha | null {
    const feita = pronto.get(id);
    if (feita) return feita;
    const f = porId.get(id);
    if (!f || calculando.has(id)) return null;
    calculando.add(id);

    let total = 0;
    let semPreco = 0;
    let pesoCru = 0;
    const linhas: (number | null)[] = [];
    for (const l of f.ingredientes) {
      // Sem unidade (a água da planilha) conta como peso; só "un" fica de fora.
      if (l.unidade !== "un") pesoCru += l.quantidade;
      let custo: number | null = null;
      if (l.insumoId !== null) {
        const i = insumos.get(l.insumoId);
        if (i && i.liquido !== null && (l.unidade === null || l.unidade === i.unidadeUso)) custo = l.quantidade * i.liquido;
      } else if (l.subFichaId !== null) {
        const sub = calcular(l.subFichaId);
        if (sub && sub.porUnidade !== null) custo = l.quantidade * sub.porUnidade;
      } else {
        // Ingrediente livre (água): sem preço e sem alerta.
        linhas.push(0);
        continue;
      }
      if (custo === null) semPreco++;
      else total += custo;
      linhas.push(custo);
    }
    if (f.ingredientes.length === 0 && f.custoManualPorcao !== null) total = f.custoManualPorcao * f.porcoes;

    const rend = f.rendimentoTotal && f.rendimentoTotal > 0 ? f.rendimentoTotal : null;
    const r: CustoDaFicha = {
      total,
      porPorcao: f.porcoes > 0 ? total / f.porcoes : null,
      porUnidade: rend ? total / rend : null,
      porKg: rend ? (total / rend) * 1000 : null,
      perda: rend && pesoCru > 0 ? 1 - rend / pesoCru : null,
      semPreco,
      linhas,
    };
    calculando.delete(id);
    pronto.set(id, r);
    return r;
  }

  for (const f of fichas) calcular(f.id);
  return pronto;
}

/** O preço de venda: mínimo pela meta de food cost (custo ÷ 30%) e pelo markup (custo × 3). */
export function precosSugeridos(custoPorPorcao: number | null, metaFoodCost: number, markup: number) {
  if (custoPorPorcao === null) return { minimo: null, markup: null };
  return {
    minimo: metaFoodCost > 0 ? custoPorPorcao / metaFoodCost : null,
    markup: custoPorPorcao * markup,
  };
}

// ---------------------------------------------------------------------------
// Venda fora do buffet: encomenda e delivery
// ---------------------------------------------------------------------------

export const CANAIS_DE_VENDA = [
  { chave: "ENCOMENDA", nome: "Encomenda" },
  { chave: "DELIVERY", nome: "Delivery" },
] as const;

export const UNIDADES_DE_VENDA = [
  { chave: "KG", nome: "kg", curto: "/kg" },
  { chave: "UN", nome: "unidade", curto: "/un" },
  { chave: "POTE", nome: "pote", curto: "/pote" },
] as const;

export type ExtraParaCusto = { insumoId: number | null; subFichaId: number | null; quantidade: number };
export type VendaParaCusto = {
  id: number;
  fichaId: number;
  /** Quanto da receita pronta vai em cada unidade vendida (g, mL ou un do rendimento). */
  quantidade: number;
  baseId: number | null;
  extras: ExtraParaCusto[];
};
export type CustoDaVenda = {
  /** A parte da receita (ou da venda-base, no delivery que parte de uma encomenda). */
  receita: number | null;
  /** Embalagens e guarnição. */
  extras: number;
  /** Nulo quando a receita não tem custo (ficha sem peso pronto, por exemplo). */
  total: number | null;
  /** Extras sem preço: o total sai menor que a realidade. */
  semPreco: number;
};

/**
 * O custo de cada item da lista de preços: a quantidade da receita pronta
 * vezes o custo por g (ou mL, ou un) da ficha, mais os extras. O delivery que
 * parte de uma encomenda custa o que ela custa mais os extras dele, e uma
 * base que aponta para outra base não entra em laço.
 */
export function custosDasVendas(
  vendas: VendaParaCusto[],
  fichas: Map<number, CustoDaFicha>,
  insumos: Map<number, CustoDoInsumo & { unidadeUso: Unidade }>,
): Map<number, CustoDaVenda> {
  const porId = new Map(vendas.map((v) => [v.id, v]));
  const pronto = new Map<number, CustoDaVenda>();
  const calculando = new Set<number>();

  function calcular(id: number): CustoDaVenda | null {
    const feito = pronto.get(id);
    if (feito) return feito;
    const v = porId.get(id);
    if (!v || calculando.has(id)) return null;
    calculando.add(id);

    let extras = 0;
    let semPreco = 0;
    for (const e of v.extras) {
      const unitario =
        e.insumoId !== null ? (insumos.get(e.insumoId)?.liquido ?? null) : e.subFichaId !== null ? (fichas.get(e.subFichaId)?.porUnidade ?? null) : null;
      if (unitario === null) semPreco++;
      else extras += e.quantidade * unitario;
    }
    let receita: number | null;
    if (v.baseId !== null) {
      receita = calcular(v.baseId)?.total ?? null;
    } else {
      const porUnidade = fichas.get(v.fichaId)?.porUnidade ?? null;
      receita = porUnidade === null ? null : v.quantidade * porUnidade;
    }
    const r: CustoDaVenda = { receita, extras, total: receita === null ? null : receita + extras, semPreco };
    calculando.delete(id);
    pronto.set(id, r);
    return r;
  }

  for (const v of vendas) calcular(v.id);
  return pronto;
}

/** O CMV do item: custo ÷ preço. Nulo sem um dos dois. */
export function cmvDaVenda(custo: number | null, preco: number | null): number | null {
  if (custo === null || preco === null || preco <= 0) return null;
  return custo / preco;
}
