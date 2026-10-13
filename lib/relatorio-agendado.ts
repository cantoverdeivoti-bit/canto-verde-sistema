import { painelComEntradas, variacoesDePreco, type DadosDoPainel, type VariacaoDePreco } from "@/lib/painel-compras";
import { periodoAnterior } from "@/lib/periodo";
import {
  bonificacoesRecebidas,
  economiaNegociada,
  extrasDosFornecedores,
  instantesDoPeriodo,
  type DesempenhoDoFornecedor,
  type ExtrasDoFornecedor,
} from "@/lib/relatorios-compras";

/**
 * Tudo o que o relatório por e-mail mostra, de uma vez. Nenhuma conta nova:
 * cada número vem da mesma função que a tela de Relatórios usa, para o PDF de
 * terça bater com o que o dono vê no painel no mesmo período.
 */
export type DadosDoRelatorio = {
  de: string;
  ate: string;
  antes: { de: string; ate: string };
  painel: DadosDoPainel;
  economia: { valor: number; itens: number };
  /** O que os fornecedores deram de bonificação no período. */
  bonificacao: { valor: number; itens: number };
  altas: VariacaoDePreco[];
  quedas: VariacaoDePreco[];
  fornecedores: (DesempenhoDoFornecedor & { extras: ExtrasDoFornecedor | null })[];
};

/** Quantas linhas cada lista do relatório mostra. */
export const NO_RELATORIO = { produtos: 10, precos: 5, fornecedores: 12 };

export async function dadosDoRelatorio(de: string, ate: string, timezone: string, hoje: string): Promise<DadosDoRelatorio> {
  const antes = periodoAnterior(de, ate);
  const agora = instantesDoPeriodo(de, ate, timezone);

  // As compras dos dois períodos e o desempenho vêm do próprio painel: antes
  // eram buscados duas vezes, uma para o painel e outra para o relatório.
  const [{ painel, linhas, linhasAntes, desempenho }, economia, extras, bonificacao] = await Promise.all([
    painelComEntradas(de, ate, timezone, hoje),
    economiaNegociada(agora.inicio, agora.fim),
    extrasDosFornecedores(agora.inicio, agora.fim),
    bonificacoesRecebidas(agora.inicio, agora.fim),
  ]);

  // A mesma régua da aba Preços: pelo que pesou em reais.
  const variacoes = variacoesDePreco(linhas, linhasAntes).filter((v) => Math.abs(v.variacao) >= 0.05);
  const altas = variacoes.filter((v) => v.variacao > 0).sort((a, b) => b.efeito - a.efeito);
  const quedas = variacoes.filter((v) => v.variacao < 0).sort((a, b) => a.efeito - b.efeito);

  return {
    de,
    ate,
    antes,
    painel,
    economia,
    bonificacao: { valor: bonificacao.valor, itens: bonificacao.itens },
    altas: altas.slice(0, NO_RELATORIO.precos),
    quedas: quedas.slice(0, NO_RELATORIO.precos),
    fornecedores: desempenho
      .slice(0, NO_RELATORIO.fornecedores)
      .map((d) => ({ ...d, extras: extras.get(d.fornecedorId) ?? null })),
  };
}
