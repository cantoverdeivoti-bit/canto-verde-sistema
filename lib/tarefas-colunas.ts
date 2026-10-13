import type { EstadoColuna } from "@/generated/prisma/client";

/**
 * O modelo de colunas da empresa, num lugar só.
 *
 * O diagnóstico do PRD achou sete projetos com sete conjuntos diferentes de
 * colunas — MANUTENÇÃO com as oito, FINANCEIRO com quatro, DELIVERY com a
 * numeração quebrada e duas colunas chamadas "ESVAZIAR E APAGAR". Enquanto
 * cada quadro inventa as próprias etapas, nenhum relatório compara um projeto
 * com outro, que é metade do motivo de este módulo existir.
 *
 * Este arquivo não importa Prisma nem banco, e é de propósito: a tela precisa
 * das mesmas oito colunas que o servidor grava, e `@/generated/prisma/client`
 * entra só como TIPO, que some na compilação. Mesma razão de `lib/roles.ts`
 * viver separado de `lib/permissions.ts`.
 */

export type ColunaPadrao = {
  nome: string;
  estado: EstadoColuna;
  /** Máximo de cartões por pessoa nesta coluna. Nulo = sem limite. */
  wipPorPessoa: number | null;
  alertaLaranjaDias: number | null;
  alertaVermelhoDias: number | null;
};

/**
 * As oito, na ordem em que o quadro é lido.
 *
 * LAPIDAR vem ANTES de A FAZER, e isso é uma mudança em relação ao que a
 * equipe usa hoje no TickTick. A ordem de lá é BACKLOG > A FAZER > LAPIDAR, e
 * o próprio PRD marcou a troca como decisão em aberto (D3) recomendando
 * inverter: "detalhar antes de se comprometer" vem antes de "comprometido".
 * Um cartão que vai para A FAZER já tem dono e prazo; se ainda falta
 * informação para isso, ele não deveria ter passado por lá.
 *
 * Os números de WIP e de alerta são ponto de partida declarado, não medição —
 * saíram da tabela 10.4 do PRD, que manda revê-los depois de 30 dias de uso
 * com o relatório de tempo por coluna na mão. BACKLOG e ROTINA ficam sem
 * alerta porque cartão parado ali não é sintoma: um é a fila de ideias, o
 * outro é a matriz de uma rotina, que por definição não anda.
 */
export const COLUNAS_PADRAO: readonly ColunaPadrao[] = [
  {
    nome: "BACKLOG",
    estado: "ENTRADA",
    wipPorPessoa: null,
    alertaLaranjaDias: null,
    alertaVermelhoDias: null,
  },
  {
    nome: "LAPIDAR",
    estado: "PLANEJADO",
    wipPorPessoa: null,
    alertaLaranjaDias: 7,
    alertaVermelhoDias: 14,
  },
  {
    nome: "A FAZER",
    estado: "PLANEJADO",
    wipPorPessoa: null,
    alertaLaranjaDias: null,
    alertaVermelhoDias: null,
  },
  {
    nome: "EM ANDAMENTO",
    estado: "EXECUCAO",
    wipPorPessoa: 5,
    alertaLaranjaDias: 5,
    alertaVermelhoDias: 10,
  },
  {
    // O alerta laranja é nulo porque quem cobra o AGUARDANDO é a previsão, não
    // o calendário: o cartão tem data prometida, e a cobrança nasce dela. O
    // vermelho de 7 dias é a rede embaixo, para a previsão esquecida não ficar
    // invisível.
    nome: "AGUARDANDO",
    estado: "EXECUCAO_BLOQUEADA",
    wipPorPessoa: null,
    alertaLaranjaDias: null,
    alertaVermelhoDias: 7,
  },
  {
    nome: "ROTINA",
    estado: "RECORRENTE",
    wipPorPessoa: null,
    alertaLaranjaDias: null,
    alertaVermelhoDias: null,
  },
  {
    nome: "DOCUMENTADO",
    estado: "FINALIZADO_COM_REGISTRO",
    wipPorPessoa: null,
    alertaLaranjaDias: null,
    alertaVermelhoDias: null,
  },
  {
    nome: "CONCLUÍDO",
    estado: "CONCLUIDO",
    wipPorPessoa: null,
    alertaLaranjaDias: null,
    alertaVermelhoDias: null,
  },
];

/** A primeira coluna do quadro: onde a tarefa nasce quando ninguém escolhe. */
export const COLUNA_INICIAL = COLUNAS_PADRAO[0];

/** Linhas prontas para gravar ao criar um projeto. `ordem` de 10 em 10. */
export function colunasParaProjetoNovo() {
  return COLUNAS_PADRAO.map((c, i) => ({
    nome: c.nome,
    estado: c.estado,
    // De dez em dez para caber coluna extra entre duas padrão sem renumerar a
    // linha inteira — RF-062 exige encaixar, e renumerar em cascata é
    // justamente o tipo de escrita que dá errado no meio do serviço.
    ordem: (i + 1) * 10,
    padrao: true,
    wipPorPessoa: c.wipPorPessoa,
    alertaLaranjaDias: c.alertaLaranjaDias,
    alertaVermelhoDias: c.alertaVermelhoDias,
  }));
}

/** O mínimo que este arquivo precisa saber sobre uma coluna já gravada. */
export type ColunaConhecida = {
  id: number;
  nome: string;
  estado: EstadoColuna;
  ordem: number;
  oculta: boolean;
};

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

/**
 * Para onde o cartão cai quando muda de projeto (RF-027, caso K7).
 *
 * Mover uma tarefa de POP para MANUTENÇÃO é mover entre dois quadros que não
 * têm as mesmas colunas: o POP tem TREINAMENTO, a MANUTENÇÃO não. Jogar o
 * cartão na primeira coluna do destino seria mandar de volta para o BACKLOG um
 * trabalho que já estava quase pronto.
 *
 * A escolha, em três tentativas:
 *
 *   1. Uma coluna com o MESMO NOME. É o caso comum — os dois quadros usam o
 *      modelo padrão — e preserva A FAZER como A FAZER, em vez de deixar o
 *      cartão cair em LAPIDAR só porque as duas são "Planejado".
 *   2. A coluna de mesma ETAPA que vier primeiro no quadro. É como TREINAMENTO
 *      vira DOCUMENTADO: as duas são "finalizado com registro".
 *   3. A primeira coluna visível, se o destino não tiver a etapa. FINANCEIRO
 *      não usa LAPIDAR nem DOCUMENTADO, e alguma coluna o cartão tem de ter.
 *
 * O CA-009 do PRD diz que TREINAMENTO deveria cair em EM ANDAMENTO, o que
 * contradiz o K7 ("cai na coluna padrão do mesmo estado") e o próprio 10.3,
 * que mapeia TREINAMENTO para "finalizado com registro". Aqui vale o K7, que é
 * a regra; o CA-009 é um exemplo escrito antes de a regra existir.
 *
 * Coluna oculta não recebe cartão: ela está escondida porque o projeto não usa
 * aquela etapa (RF-063), e mandar trabalho para lá seria esconder trabalho.
 */
export function colunaEquivalente(
  destino: readonly ColunaConhecida[],
  origem: { nome: string; estado: EstadoColuna },
): ColunaConhecida | null {
  const visiveis = [...destino]
    .filter((c) => !c.oculta)
    .sort((a, b) => a.ordem - b.ordem);
  if (visiveis.length === 0) return null;

  const porNome = visiveis.find((c) => semAcento(c.nome) === semAcento(origem.nome));
  if (porNome) return porNome;

  const porEstado = visiveis.find((c) => c.estado === origem.estado);
  if (porEstado) return porEstado;

  return visiveis[0];
}
