/**
 * As contas do módulo Eventos, sem banco: entram números, saem números.
 *
 * Ficam separadas das telas e das ações para serem as mesmas na lista, no
 * detalhe e na proposta, e para dar para testar sem banco
 * (`scripts/test-eventos-calculo.ts`).
 *
 * Dinheiro é arredondado no centavo só no fim de cada conta, nunca no meio.
 */

const centavos = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Cardápio
// ---------------------------------------------------------------------------

export type ItemDoCardapio = { custoPorcao: number; porcoesPorPessoa: number };

/** Quanto custa servir o cardápio a uma pessoa. */
export function custoPorPessoa(itens: ItemDoCardapio[]): number {
  return centavos(itens.reduce((s, i) => s + i.custoPorcao * i.porcoesPorPessoa, 0));
}

/**
 * O CMV: a parte do preço que vai embora em comida. Nulo sem preço, porque
 * dividir por zero não é "0%", é "ainda não tem preço".
 */
export function cmvPct(custo: number, preco: number | null): number | null {
  if (preco === null || preco <= 0) return null;
  return (custo / preco) * 100;
}

/**
 * O preço que deixa a margem pedida depois de pagar o custo e o imposto.
 *
 * Preço × (1 − margem − imposto) = custo. Nulo quando margem e imposto somam
 * 100% ou mais: não existe preço que cubra isso, e a tela diz em vez de
 * mostrar um número negativo.
 */
export function precoSugerido(custo: number, margemPct: number, impostoPct: number): number | null {
  const sobra = 1 - margemPct / 100 - impostoPct / 100;
  if (sobra <= 0) return null;
  return centavos(custo / sobra);
}

// ---------------------------------------------------------------------------
// Evento
// ---------------------------------------------------------------------------

export type LinhaDoEvento = { quantidade: number; custoUnitario: number; precoUnitario: number };

export type ResumoDoEvento = {
  /** Soma do que a casa gasta. */
  custo: number;
  /** Soma das linhas cobradas: é a receita da casa. */
  subtotal: number;
  /** A taxa de serviço, que vai para a equipe. */
  taxaServico: number;
  /** O que o cliente paga: subtotal + taxa de serviço. */
  totalCliente: number;
  /** Sobre a receita da casa, não sobre a taxa. */
  imposto: number;
  /** Receita − custo − imposto. */
  lucro: number;
  /** Lucro ÷ receita. Nulo sem receita. */
  margemPct: number | null;
  custoPorConvidado: number | null;
  precoPorConvidado: number | null;
};

/**
 * O resumo financeiro de um evento.
 *
 * A taxa de serviço entra no total do cliente e fica fora da receita: pela
 * Lei 13.419 ela é da equipe, e somá-la ao faturamento faria a margem parecer
 * maior do que é.
 */
export function resumoDoEvento(
  linhas: LinhaDoEvento[],
  opcoes: { convidados: number; taxaServicoPct: number; impostoPct: number },
): ResumoDoEvento {
  const custo = centavos(linhas.reduce((s, l) => s + l.quantidade * l.custoUnitario, 0));
  const subtotal = centavos(linhas.reduce((s, l) => s + l.quantidade * l.precoUnitario, 0));
  const taxaServico = centavos((subtotal * opcoes.taxaServicoPct) / 100);
  const imposto = centavos((subtotal * opcoes.impostoPct) / 100);
  const lucro = centavos(subtotal - custo - imposto);
  const porConvidado = (n: number) => (opcoes.convidados > 0 ? centavos(n / opcoes.convidados) : null);
  return {
    custo,
    subtotal,
    taxaServico,
    totalCliente: centavos(subtotal + taxaServico),
    imposto,
    lucro,
    margemPct: subtotal > 0 ? (lucro / subtotal) * 100 : null,
    custoPorConvidado: porConvidado(custo),
    precoPorConvidado: porConvidado(subtotal + taxaServico),
  };
}

/** O que já entrou e o que falta, sobre o total do cliente. Saldo nunca é negativo: pago a mais é "pago". */
export function situacaoDoPagamento(totalCliente: number, pagamentos: number[]) {
  const recebido = centavos(pagamentos.reduce((s, v) => s + v, 0));
  return { recebido, saldo: Math.max(0, centavos(totalCliente - recebido)) };
}

/** O sinal pedido para confirmar a data. */
export function valorDoSinal(totalCliente: number, sinalPct: number): number {
  return centavos((totalCliente * sinalPct) / 100);
}

/** "YYYY-MM-DD" mais N dias, sem fuso: data de calendário. */
export function somarDiasNaData(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** "34,5%". */
export function formatPct(n: number | null): string {
  if (n === null) return "—";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

// ---------------------------------------------------------------------------
// Produção: o que fazer e o que comprar para X convidados
// ---------------------------------------------------------------------------

export type FichaParaProducao = {
  id: number;
  codigo: string;
  nome: string;
  /** Quantas porções uma receita dá. */
  porcoes: number;
  /** O peso (ou volume) pronto de uma receita, na unidade do rendimento. */
  rendimentoTotal: number | null;
  unidadeRendimento: string;
  ingredientes: { insumoId: number | null; subFichaId: number | null; quantidade: number; unidade: string | null }[];
};
export type InsumoParaProducao = { nome: string; unidadeUso: string; /** Fator de correção: a fração do bruto que sobra útil. */ rendimento: number };

export type LinhaDeProducao = { fichaId: number; codigo: string; nome: string; receitas: number; pronto: number | null; unidade: string };

/**
 * Abre o cardápio do evento até o insumo: cada prato vira quantas receitas
 * fazer (porções ÷ porções da receita), cada pré-preparo dentro dele vira a
 * quantidade pronta que ele pede (somada entre os pratos) e cada insumo vira
 * a quantidade limpa e a bruta (limpa ÷ fator de correção), que é a de
 * comprar. Pré-preparo sem peso pronto não abre (não dá para saber quantas
 * receitas dele fazer) e vai para `semRendimento`; pré-preparo em laço não
 * trava a conta.
 */
export function producaoDoEvento(
  itens: { fichaId: number; porcoes: number }[],
  fichas: Map<number, FichaParaProducao>,
  insumos: Map<number, InsumoParaProducao>,
) {
  const pratos = new Map<number, LinhaDeProducao & { porcoes: number }>();
  const preparos = new Map<number, LinhaDeProducao & { quantidade: number }>();
  const compras = new Map<string, { insumoId: number; nome: string; unidade: string; limpo: number; bruto: number }>();
  const semRendimento = new Set<string>();
  // Receita sem ingrediente lançado (as que vieram de Eventos com custo
  // digitado): a lista de compra sai sem os insumos dela.
  const semIngredientes = new Set<string>();

  function abrir(f: FichaParaProducao, receitas: number, caminho: Set<number>) {
    if (f.ingredientes.length === 0) semIngredientes.add(f.nome);
    for (const l of f.ingredientes) {
      const qtd = l.quantidade * receitas;
      if (l.insumoId !== null) {
        const i = insumos.get(l.insumoId);
        if (!i) continue;
        const unidade = l.unidade ?? i.unidadeUso;
        const chave = `${l.insumoId}|${unidade}`;
        const fc = i.rendimento > 0 ? i.rendimento : 1;
        const atual = compras.get(chave) ?? { insumoId: l.insumoId, nome: i.nome, unidade, limpo: 0, bruto: 0 };
        atual.limpo += qtd;
        atual.bruto += qtd / fc;
        compras.set(chave, atual);
      } else if (l.subFichaId !== null) {
        const sub = fichas.get(l.subFichaId);
        if (!sub || caminho.has(sub.id)) continue;
        const ja = preparos.get(sub.id);
        const rend = sub.rendimentoTotal && sub.rendimentoTotal > 0 ? sub.rendimentoTotal : null;
        const receitasDoSub = rend === null ? 0 : qtd / rend;
        preparos.set(sub.id, {
          fichaId: sub.id,
          codigo: sub.codigo,
          nome: sub.nome,
          unidade: sub.unidadeRendimento,
          quantidade: (ja?.quantidade ?? 0) + qtd,
          receitas: (ja?.receitas ?? 0) + receitasDoSub,
          pronto: (ja?.pronto ?? 0) + qtd,
        });
        if (rend === null) {
          semRendimento.add(sub.nome);
          continue;
        }
        abrir(sub, receitasDoSub, new Set([...caminho, sub.id]));
      }
    }
  }

  for (const item of itens) {
    const f = fichas.get(item.fichaId);
    if (!f || item.porcoes <= 0) continue;
    const receitas = item.porcoes / Math.max(1, f.porcoes);
    const ja = pratos.get(f.id);
    pratos.set(f.id, {
      fichaId: f.id,
      codigo: f.codigo,
      nome: f.nome,
      unidade: f.unidadeRendimento,
      porcoes: (ja?.porcoes ?? 0) + item.porcoes,
      receitas: (ja?.receitas ?? 0) + receitas,
      pronto: f.rendimentoTotal === null ? null : (ja?.pronto ?? 0) + f.rendimentoTotal * receitas,
    });
    abrir(f, receitas, new Set([f.id]));
  }

  const porNome = <T extends { nome: string }>(a: T, b: T) => a.nome.localeCompare(b.nome);
  return {
    pratos: [...pratos.values()],
    preparos: [...preparos.values()].sort(porNome),
    insumos: [...compras.values()].sort(porNome),
    semRendimento: [...semRendimento].sort(),
    semIngredientes: [...semIngredientes].sort(),
  };
}

/** "2,5 kg", "800 g", "1,2 L", "12 un": a medida que a cozinha lê. */
export function medida(n: number, unidade: string) {
  const fmt = (x: number, casas: number) => x.toLocaleString("pt-BR", { maximumFractionDigits: casas });
  if (unidade === "g") return n >= 1000 ? `${fmt(n / 1000, 2)} kg` : `${fmt(n, 0)} g`;
  if (unidade === "mL") return n >= 1000 ? `${fmt(n / 1000, 2)} L` : `${fmt(n, 0)} mL`;
  return `${fmt(n, 1)} ${unidade}`;
}
export const receitas = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${n === 1 ? "receita" : "receitas"}`;
