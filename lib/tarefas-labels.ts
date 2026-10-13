import { formatInTimeZone } from "date-fns-tz";

import type { Tom } from "@/lib/tom";
import type { ExigenciaMovimento } from "@/lib/tarefas-fluxo";
import type {
  EstadoColuna,
  MotivoCancelamento,
  PapelProjeto,
  PrioridadeTarefa,
  StatusTarefa,
} from "@/generated/prisma/client";

/**
 * Como cada estado do quadro se chama na tela, num lugar só.
 *
 * `Record` completo de propósito, como em `lib/cotacao-labels.ts`: um valor
 * novo no schema quebra o build aqui, em vez de vazar "EXECUCAO_BLOQUEADA"
 * para a tela de quem nunca ouviu falar de enum.
 *
 * A cor nunca é escolhida aqui: cada rótulo declara o PAPEL do estado e
 * `corDoTom` decide o resto — a regra dos quatro papéis do DESIGN.md.
 */

/**
 * O nome da ETAPA, não o da coluna.
 *
 * Aparece onde o quadro não está: no relatório que compara projetos, na busca
 * e no histórico. Dentro do projeto quem manda é o nome que o gestor deu —
 * "REVISAR" continua REVISAR, e o rótulo abaixo é o que diz que ela conta como
 * execução.
 */
export const ETAPA_LABEL: Record<EstadoColuna, { texto: string; tom: Tom }> = {
  ENTRADA: { texto: "registrada", tom: "neutro" },
  PLANEJADO: { texto: "planejada", tom: "neutro" },
  EXECUCAO: { texto: "em execução", tom: "pendente" },
  EXECUCAO_BLOQUEADA: { texto: "esperando terceiro", tom: "pendente" },
  RECORRENTE: { texto: "rotina", tom: "neutro" },
  FINALIZADO_COM_REGISTRO: { texto: "documentada", tom: "feito" },
  CONCLUIDO: { texto: "concluída", tom: "feito" },
};

export const STATUS_TAREFA_LABEL: Record<StatusTarefa, { texto: string; tom: Tom }> = {
  ABERTA: { texto: "aberta", tom: "neutro" },
  CONCLUIDA: { texto: "concluída", tom: "feito" },
  // Destrutivo, e é o único rótulo deste módulo que usa o alarme: cancelar é
  // decidir que o trabalho não acontece. Atraso e prioridade alta são
  // pendência, não destruição — ver o comentário de PRIORIDADE_LABEL.
  CANCELADA: { texto: "cancelada", tom: "destrutivo" },
};

/**
 * Prioridade — e aqui este módulo se afasta do PRD de propósito.
 *
 * O PRD (8.16) manda adotar as cores do TickTick: azul para baixa, amarelo
 * para média, vermelho para alta, "para não confundir quem migra". Não dá.
 * Este sistema tem quatro cores com quatro papéis, e o DESIGN.md é explícito:
 * não se introduz uma quinta. Azul não existe na paleta, e o vermelho é o
 * alarme, reservado ao que destrói — cancelar, recusar, erro. Uma tarefa
 * importante não é uma tarefa destruída, e gastar o alarme nela é o caminho
 * mais curto para ninguém mais reparar no alarme.
 *
 * Então a prioridade sai em ocre, que é o papel de "pendente" — o mesmo que o
 * painel já usa para "atrasada" —, e quem separa alta de média é a FORMA, não
 * a cor: três traços, dois, um, nenhum. É também o que o DESIGN.md pede ao
 * dizer que nenhum estado pode depender só de matiz, e o que faz a escala
 * continuar legível para quem não distingue as duas.
 *
 * Se o dono preferir as cores do TickTick depois de ver na tela, a mudança é
 * nesta tabela e em mais lugar nenhum.
 */
export const PRIORIDADE_LABEL: Record<
  PrioridadeTarefa,
  { texto: string; tom: Tom; marca: string }
> = {
  NENHUMA: { texto: "sem prioridade", tom: "neutro", marca: "" },
  BAIXA: { texto: "baixa", tom: "neutro", marca: "|" },
  MEDIA: { texto: "média", tom: "pendente", marca: "||" },
  ALTA: { texto: "alta", tom: "pendente", marca: "|||" },
};

/** Na ordem do seletor: da mais urgente para a ausência dela. */
export const PRIORIDADES: PrioridadeTarefa[] = ["ALTA", "MEDIA", "BAIXA", "NENHUMA"];

export const MOTIVO_CANCELAMENTO_LABEL: Record<MotivoCancelamento, string> = {
  DUPLICADA: "já existe outra igual",
  NAO_E_MAIS_NECESSARIA: "não é mais necessária",
  FORA_DO_ESCOPO: "não é para este projeto",
  SEM_RECURSOS: "sem gente ou sem dinheiro",
  OUTRO: "outro motivo",
};

export const MOTIVOS_CANCELAMENTO: MotivoCancelamento[] = [
  "NAO_E_MAIS_NECESSARIA",
  "DUPLICADA",
  "FORA_DO_ESCOPO",
  "SEM_RECURSOS",
  "OUTRO",
];

/**
 * O papel no projeto, dito pelo que a pessoa faz — não pelo nome do cargo.
 *
 * "Gestor" e "Editor" não querem dizer nada para quem trabalha na cozinha, e a
 * tela de membros é exatamente onde alguém escolhe errado por não entender a
 * palavra. A explicação vai junto do nome, sempre.
 */
export const PAPEL_PROJETO_LABEL: Record<
  PapelProjeto,
  { texto: string; explicacao: string }
> = {
  GESTOR: {
    texto: "Gestor",
    explicacao: "Responde pelo quadro: distribui, cancela, muda colunas e membros.",
  },
  EDITOR: {
    texto: "Editor",
    explicacao: "Cria e organiza tarefas de todo mundo, mas não mexe em membros.",
  },
  EXECUTOR: {
    texto: "Executor",
    explicacao: "Faz as tarefas que são dele: move, marca e conclui as suas.",
  },
  LEITOR: {
    texto: "Leitor",
    explicacao: "Acompanha e comenta. Não cria nem altera nada.",
  },
};

export const PAPEIS_PROJETO: PapelProjeto[] = ["GESTOR", "EDITOR", "EXECUTOR", "LEITOR"];

/**
 * O que a tela pede quando a máquina de estados recusa por falta de campo.
 *
 * `podeMover` devolve QUAL exigência falhou justamente para isto: em vez de
 * "movimento inválido", a linha abre o campo que resolve. É a diferença entre
 * uma regra que ajuda e uma que atrapalha.
 */
export const EXIGENCIA_LABEL: Record<ExigenciaMovimento, string> = {
  gestor: "Só o gestor do projeto faz isto",
  responsavel: "Quem vai fazer?",
  motivoEPrevisao: "Esperando o quê, e até quando?",
  recorrencia: "De quanto em quanto tempo se repete?",
  documento: "Qual é o documento?",
  checklistCompleto: "Falta marcar o checklist",
  wip: "Já são tarefas demais para esta pessoa",
};

/**
 * O que o cartão diz sobre o prazo: "hoje", "faltam 5 dias", "atrasada há 2
 * dias" (RF-081).
 *
 * RN-023 está aqui dentro: prazo sem hora vence às 23h59 do dia, então
 * comparar instantes daria a tarefa como atrasada às 00h01 do próprio dia em
 * que ela vence. Com hora, o instante vale.
 *
 * Calculado no SERVIDOR, na mesma passagem que converte Date em string para o
 * componente. Não é preciosismo: "hoje" depende do relógio de quem calcula, e
 * no navegador o relógio é o do aparelho do garçom — o cartão renderizado no
 * servidor diria uma coisa e a hidratação diria outra, que é o defeito mais
 * chato de achar que existe.
 */
export function situacaoDoPrazo(
  prazo: Date | null,
  prazoDiaInteiro: boolean,
  timezone: string,
  agora: Date = new Date(),
): { texto: string; tom: Tom; atrasada: boolean } | null {
  if (!prazo) return null;

  const dia = (d: Date) => formatInTimeZone(d, timezone, "yyyy-MM-dd");
  // Meio-dia UTC para a subtração não tropeçar em fuso, a mesma convenção de
  // `diaISO` e `diaDaqui` em lib/format.ts.
  const emDias = (iso: string) => Date.parse(`${iso}T12:00:00Z`) / 86_400_000;
  const diferenca = Math.round(emDias(dia(prazo)) - emDias(dia(agora)));

  if (diferenca < 0) {
    const dias = Math.abs(diferenca);
    return {
      texto: dias === 1 ? "atrasada há 1 dia" : `atrasada há ${dias} dias`,
      tom: "pendente",
      atrasada: true,
    };
  }

  // Vence hoje e tem hora marcada: só está atrasada depois da hora. Sem hora,
  // o dia inteiro ainda é dela.
  if (diferenca === 0) {
    if (!prazoDiaInteiro && prazo.getTime() < agora.getTime()) {
      return { texto: "venceu hoje", tom: "pendente", atrasada: true };
    }
    const hora = prazoDiaInteiro
      ? ""
      : ` às ${formatInTimeZone(prazo, timezone, "HH:mm")}`;
    return { texto: `hoje${hora}`, tom: "pendente", atrasada: false };
  }

  if (diferenca === 1) return { texto: "amanhã", tom: "neutro", atrasada: false };

  return { texto: `faltam ${diferenca} dias`, tom: "neutro", atrasada: false };
}
