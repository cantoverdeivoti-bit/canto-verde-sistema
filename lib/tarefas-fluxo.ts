import type { EstadoColuna } from "@/generated/prisma/client";

/**
 * A máquina de estados do quadro: o que pode ir para onde, e sob que condição.
 *
 * É a diferença principal em relação ao TickTick, onde qualquer cartão vai
 * para qualquer coluna e nada cobra nada. O resultado disso está no
 * diagnóstico: cartões em AGUARDANDO sem ninguém saber o que esperam, tarefas
 * fora do BACKLOG sem dono, e a coluna CONCLUÍDO cheia de coisa ainda aberta.
 *
 * Decide sobre o ESTADO da coluna, nunca sobre o nome dela. É o que faz a
 * coluna extra funcionar sem código novo: REVISAR, do projeto Eventos, declara
 * ser "execução" e herda as regras de EM ANDAMENTO inteiras (RN-051).
 *
 * Puro de propósito, sem Prisma e sem banco. A tela usa para desbotar o
 * movimento impossível e para saber QUAL campo pedir antes de mover; a ação de
 * servidor chama de novo antes de gravar, porque ação de servidor é endpoint
 * HTTP e a tela não é guarda de nada. Uma regra, dois lugares que a cobram —
 * o mesmo arranjo de `lib/lote.ts`.
 *
 * O teste vive em `scripts/test-tarefas-fluxo.ts` e não abre conexão nenhuma.
 */

/**
 * O que falta para o movimento passar.
 *
 * A diferença entre isto e `exige: null` é a que importa para a tela: com uma
 * exigência, existe um campo a preencher e o movimento acontece em seguida —
 * é o formulário curto que aparece embutido na linha. Com `null`, o caminho
 * não existe, e insistir não adianta; o que a mensagem faz é dizer por onde ir.
 */
export type ExigenciaMovimento =
  | "gestor"
  | "responsavel"
  | "motivoEPrevisao"
  | "recorrencia"
  | "documento"
  | "checklistCompleto"
  | "wip";

/** O limite da coluna de destino e quanto a pessoa já tem nela (RF-117). */
export type LimiteWip = {
  /** Nulo = coluna sem limite. */
  limite: number | null;
  /** Quantos cartões o responsável já tem nesta coluna, sem contar este. */
  jaTem: number;
  /** Projeto configurado para barrar, ou só avisar. */
  bloquear: boolean;
};

export type TarefaEmMovimento = {
  temResponsavel: boolean;
  /** "Aguardando o quê" e "previsão" preenchidos (N07). */
  aguardandoPreenchido: boolean;
  temRecorrencia: boolean;
  /** POP ligado, anexo marcado como documento ou link (RN-048). */
  temDocumento: boolean;
  /** Itens de checklist obrigatório ainda não marcados (RN-015). */
  checklistPendente: number;
  /** Quem está movendo é gestor do projeto. */
  ehGestor: boolean;
  /** Nulo quando o cartão não muda de coluna — aí não há WIP a conferir. */
  wip: LimiteWip | null;
};

export type ResultadoMovimento =
  | { ok: true }
  | { ok: false; motivo: string; exige: ExigenciaMovimento | null };

/**
 * A tabela 10.2 do PRD, colapsada de coluna para etapa.
 *
 * LAPIDAR e A FAZER são as duas "planejado", e no PRD a linha de cada uma é
 * idêntica — o que confirma que a etapa, e não o nome, é o que manda. A única
 * divergência está em CONCLUÍDO, que lá reabre para A FAZER mas não para
 * LAPIDAR; aqui reabre para as duas, porque reabrir em "falta detalhar" é
 * resposta legítima e a diferença não protege nada. Reabrir pela ação própria
 * (`reabrirTarefa`) devolve o cartão à coluna exata de antes, que é o K6.
 *
 * A etapa para ela mesma é sempre permitida: é reordenar dentro da coluna, e
 * é também LAPIDAR para A FAZER.
 */
const PERMITIDO: Record<EstadoColuna, readonly EstadoColuna[]> = {
  ENTRADA: ["ENTRADA", "PLANEJADO", "EXECUCAO", "CONCLUIDO"],
  PLANEJADO: [
    "ENTRADA",
    "PLANEJADO",
    "EXECUCAO",
    "EXECUCAO_BLOQUEADA",
    "RECORRENTE",
    "CONCLUIDO",
  ],
  EXECUCAO: [
    "ENTRADA",
    "PLANEJADO",
    "EXECUCAO",
    "EXECUCAO_BLOQUEADA",
    "RECORRENTE",
    "FINALIZADO_COM_REGISTRO",
    "CONCLUIDO",
  ],
  EXECUCAO_BLOQUEADA: ["PLANEJADO", "EXECUCAO", "EXECUCAO_BLOQUEADA", "CONCLUIDO"],
  RECORRENTE: ["EXECUCAO", "RECORRENTE", "FINALIZADO_COM_REGISTRO", "CONCLUIDO"],
  FINALIZADO_COM_REGISTRO: [
    "EXECUCAO",
    "RECORRENTE",
    "FINALIZADO_COM_REGISTRO",
    "CONCLUIDO",
  ],
  CONCLUIDO: ["PLANEJADO", "EXECUCAO", "CONCLUIDO"],
};

/**
 * Por que não, e por onde então (RN-047).
 *
 * Recusar sem dizer o caminho transforma a regra em obstáculo: a pessoa tenta
 * de novo, arrasta para outro lugar qualquer e o quadro fica pior do que se
 * não houvesse regra nenhuma. Cada recusa aqui termina apontando uma saída.
 */
const PORQUE_NAO: Partial<
  Record<EstadoColuna, Partial<Record<EstadoColuna, string>>>
> = {
  ENTRADA: {
    EXECUCAO_BLOQUEADA:
      "Só espera quem já começou. Leve para EM ANDAMENTO e diga ali o que está esperando.",
    RECORRENTE:
      "Rotina nasce de tarefa já combinada. Passe por A FAZER e defina a repetição.",
    FINALIZADO_COM_REGISTRO:
      "DOCUMENTADO é o fim de um trabalho feito. Passe por EM ANDAMENTO.",
  },
  PLANEJADO: {
    FINALIZADO_COM_REGISTRO:
      "DOCUMENTADO é o fim de um trabalho feito. Passe por EM ANDAMENTO.",
  },
  EXECUCAO_BLOQUEADA: {
    ENTRADA:
      "O que já está esperando não volta para o BACKLOG. Se não vai mais acontecer, cancele com motivo.",
    RECORRENTE:
      "Vire rotina a partir de EM ANDAMENTO, não de um cartão que depende de terceiro.",
    FINALIZADO_COM_REGISTRO:
      "DOCUMENTADO é o fim de um trabalho feito. Volte para EM ANDAMENTO primeiro.",
  },
  RECORRENTE: {
    ENTRADA: "Este cartão é a matriz da rotina. Para mexer nela, pause em EM ANDAMENTO.",
    PLANEJADO:
      "Este cartão é a matriz da rotina. Para mexer nela, pause em EM ANDAMENTO.",
    EXECUCAO_BLOQUEADA:
      "Este cartão é a matriz da rotina. Para mexer nela, pause em EM ANDAMENTO.",
  },
  FINALIZADO_COM_REGISTRO: {
    ENTRADA: "O que já está documentado volta por EM ANDAMENTO, para revisão.",
    PLANEJADO: "O que já está documentado volta por EM ANDAMENTO, para revisão.",
    EXECUCAO_BLOQUEADA:
      "O que já está documentado volta por EM ANDAMENTO, para revisão.",
  },
  CONCLUIDO: {
    ENTRADA: "Reabra a tarefa — ela volta sozinha para a coluna em que estava.",
    EXECUCAO_BLOQUEADA:
      "Reabra a tarefa — ela volta sozinha para a coluna em que estava.",
    RECORRENTE: "Reabra a tarefa — ela volta sozinha para a coluna em que estava.",
    FINALIZADO_COM_REGISTRO:
      "Reabra a tarefa — ela volta sozinha para a coluna em que estava.",
  },
};

/** O movimento existe no mapa? Só a estrutura, sem olhar o conteúdo do cartão. */
export function movimentoExiste(de: EstadoColuna, para: EstadoColuna): boolean {
  return PERMITIDO[de].includes(para);
}

/**
 * Este cartão pode ir daqui para ali?
 *
 * A ordem das conferências é a ordem em que a pessoa precisa resolvê-las.
 * Primeiro o que ela não pode fazer de jeito nenhum (o mapa e o papel de
 * gestor), depois o que ela precisa preencher — e o responsável vem antes dos
 * outros campos porque é ele que destrava a saída do BACKLOG (RN-010) e porque
 * sem dono nenhum dos outros avisos chega a alguém.
 *
 * O WIP fica por último de propósito: é o único limite que não depende do
 * cartão, e sim de quantos OUTROS a pessoa já tem em andamento. Barrar por ele
 * antes de o resto estar certo faria a mensagem falar de outra tarefa.
 */
export function podeMover(
  de: EstadoColuna,
  para: EstadoColuna,
  t: TarefaEmMovimento,
): ResultadoMovimento {
  if (!movimentoExiste(de, para)) {
    return {
      ok: false,
      motivo:
        PORQUE_NAO[de]?.[para] ??
        "Este caminho não existe no quadro. Passe por EM ANDAMENTO.",
      exige: null,
    };
  }

  // Descartar do BACKLOG direto para CONCLUÍDO é decisão de quem responde pelo
  // quadro: é a única entrada em "concluído" que não passou por trabalho
  // nenhum, e nas mãos de todo mundo viraria o atalho para esvaziar a fila.
  if (de === "ENTRADA" && para === "CONCLUIDO" && !t.ehGestor) {
    return {
      ok: false,
      motivo:
        "Só o gestor do projeto conclui direto do BACKLOG. Se a tarefa não vai acontecer, cancele com motivo.",
      exige: "gestor",
    };
  }

  const faltando = exigenciaDaEtapa(para, t);
  if (faltando) return faltando;

  if (t.wip && t.wip.limite !== null && t.wip.bloquear && t.wip.jaTem >= t.wip.limite) {
    return {
      ok: false,
      motivo: `Já são ${t.wip.jaTem} tarefas desta pessoa nesta coluna, e o limite é ${t.wip.limite}. Termine uma antes de começar outra.`,
      exige: "wip",
    };
  }

  return { ok: true };
}

/**
 * O que esta ETAPA cobra de quem entra nela, chegando de onde for.
 *
 * Separado de `podeMover` porque a tarefa também NASCE numa coluna (RF-003: o
 * cartão criado dentro de uma coluna nasce nela), e nascer não é mover — não
 * há caminho a validar, mas as exigências da etapa valem igual. Sem esta
 * separação, a ação de criar reescreveria as quatro regras abaixo, e no dia em
 * que uma mudasse haveria dois lugares para lembrar.
 *
 * Devolve nulo quando não falta nada.
 */
export function exigenciaDaEtapa(
  para: EstadoColuna,
  t: TarefaEmMovimento,
): (ResultadoMovimento & { ok: false }) | null {
  // Responsável em toda coluna que não seja o BACKLOG — é o campo da ficha da
  // tarefa e o RN-010 dizendo a mesma coisa de dois jeitos. Sem ele não existe
  // "minhas tarefas", não existe lembrete e não existe relatório por pessoa,
  // que é exatamente o buraco que as tags com nome de gente tapavam mal.
  if (para !== "ENTRADA" && !t.temResponsavel) {
    return {
      ok: false,
      motivo: "Quem vai fazer? Fora do BACKLOG toda tarefa tem um dono.",
      exige: "responsavel",
    };
  }

  if (para === "EXECUCAO_BLOQUEADA" && !t.aguardandoPreenchido) {
    return {
      ok: false,
      motivo:
        "Esperando o quê, e até quando? Sem as duas respostas o cartão some aqui dentro.",
      exige: "motivoEPrevisao",
    };
  }

  if (para === "RECORRENTE" && !t.temRecorrencia) {
    return {
      ok: false,
      motivo: "Defina de quanto em quanto tempo se repete antes de virar rotina.",
      exige: "recorrencia",
    };
  }

  if (para === "FINALIZADO_COM_REGISTRO" && !t.temDocumento) {
    return {
      ok: false,
      motivo: "DOCUMENTADO pede o documento: ligue o POP, um anexo ou um link.",
      exige: "documento",
    };
  }

  // Concluir com checklist pela metade é o "concluído" falso que o PRD manda
  // impedir (RN-015). Vale para qualquer caminho que termine em concluído,
  // inclusive arrastar o cartão — porque concluir e mover para CONCLUÍDO são a
  // mesma ação (RF-175), e uma regra que só o botão cobra não é regra.
  if (para === "CONCLUIDO" && t.checklistPendente > 0) {
    return {
      ok: false,
      motivo:
        t.checklistPendente === 1
          ? "Falta 1 item do checklist."
          : `Faltam ${t.checklistPendente} itens do checklist.`,
      exige: "checklistCompleto",
    };
  }

  return null;
}

/**
 * Este cartão pode NASCER nesta etapa?
 *
 * Só as exigências da etapa, sem caminho nenhum — ver `exigenciaDaEtapa`. É o
 * que a ação de criar chama quando alguém usa o "+" do topo de uma coluna que
 * não é o BACKLOG.
 */
export function podeNascerEm(
  para: EstadoColuna,
  t: TarefaEmMovimento,
): ResultadoMovimento {
  return exigenciaDaEtapa(para, t) ?? { ok: true };
}

/**
 * Passou do limite, mesmo que o projeto não barre.
 *
 * O limite tem dois modos (RF-117), e o modo "só avisar" não pode devolver
 * `ok: false` — senão avisar viraria barrar. A tela pinta a coluna com isto;
 * `podeMover` decide apenas quando o projeto mandou barrar.
 */
export function estouroDeWip(wip: LimiteWip | null): boolean {
  return wip !== null && wip.limite !== null && wip.jaTem >= wip.limite;
}

/**
 * O status que a tarefa passa a ter ao chegar nesta etapa.
 *
 * Aqui mora o RF-175: concluir e mover para CONCLUÍDO são a mesma ação. No
 * TickTick são duas, e é por isso que lá existe cartão parado na coluna
 * CONCLUÍDO ainda aberto, e cartão marcado como concluído no meio do quadro.
 * Nada neste módulo grava status sem passar por esta função.
 *
 * Cancelada não sai daqui: cancelar é decisão sobre a tarefa, não sobre a
 * coluna, e tem motivo obrigatório próprio (RF-176).
 */
export function statusDaEtapa(estado: EstadoColuna): "ABERTA" | "CONCLUIDA" {
  return estado === "CONCLUIDO" ? "CONCLUIDA" : "ABERTA";
}
