import type { PapelProjeto, UserRole } from "@/generated/prisma/client";

/**
 * Quem pode o quê dentro de um projeto — a matriz 14.2 do PRD, em código.
 *
 * Segundo eixo de permissão, e não substituto do primeiro. `lib/roles.ts` e
 * `UserModulePermission` decidem se a pessoa ABRE o módulo Tarefas; isto
 * decide o que ela faz em cada quadro. Os dois são conferidos: quem não tem o
 * módulo nunca chega aqui, e quem tem o módulo ainda pode ser só leitor de um
 * projeto específico.
 *
 * Puro, sem Prisma e sem banco, como `lib/roles.ts` — a tela precisa esconder
 * o botão que a ação vai recusar, e esconder é decisão de navegador.
 */

/**
 * As ações que a matriz governa.
 *
 * Completa de propósito, inclusive o que ainda não existe (`aprovar`,
 * `anexar`, `criarModelos`, `verCusto`). Pelo mesmo motivo que os rótulos de
 * `lib/cotacao-labels.ts` são `Record` fechado: deixar de fora o que a fase
 * atual não usa faria a próxima fase reabrir a discussão de permissão item por
 * item, e é aí que a matriz começa a divergir do documento.
 */
export type AcaoTarefa =
  | "verProjeto"
  | "criarTarefa"
  | "criarSubtarefa"
  | "editar"
  | "mudarPrazo"
  | "atribuir"
  | "mover"
  | "marcarChecklist"
  | "concluir"
  | "cancelar"
  | "aprovar"
  | "comentar"
  | "anexar"
  | "excluir"
  | "restaurar"
  | "gerenciarMembros"
  | "configurarProjeto"
  | "criarModelos"
  | "verRelatorios"
  | "verCusto";

/**
 * Até onde o papel alcança.
 *
 * "proprias" quer dizer coisas ligeiramente diferentes conforme a ação, e é
 * por isso que existe como alcance e não como booleano:
 *
 *   - em `criarTarefa`, nasce atribuída a quem criou;
 *   - em `excluir`, são as que a pessoa criou;
 *   - em `restaurar`, as que ela mesma excluiu;
 *   - em `aprovar`, é ser o aprovador designado da tarefa;
 *   - em `verRelatorios`, são os próprios números (RN-044);
 *   - no resto, é ser o responsável pela tarefa.
 *
 * Quem chama passa o que "própria" significa naquela ação, em `ehMinha`. A
 * matriz não tem como saber, e fingir que sabe seria pior do que perguntar.
 */
export type Alcance = "todas" | "proprias" | "nenhuma";

const MATRIZ: Record<AcaoTarefa, Record<PapelProjeto, Alcance>> = {
  verProjeto: { GESTOR: "todas", EDITOR: "todas", EXECUTOR: "todas", LEITOR: "todas" },
  criarTarefa: {
    GESTOR: "todas",
    EDITOR: "todas",
    EXECUTOR: "proprias",
    LEITOR: "nenhuma",
  },
  criarSubtarefa: {
    GESTOR: "todas",
    EDITOR: "todas",
    EXECUTOR: "proprias",
    LEITOR: "nenhuma",
  },
  editar: { GESTOR: "todas", EDITOR: "todas", EXECUTOR: "proprias", LEITOR: "nenhuma" },
  mudarPrazo: {
    GESTOR: "todas",
    EDITOR: "todas",
    EXECUTOR: "proprias",
    LEITOR: "nenhuma",
  },
  atribuir: { GESTOR: "todas", EDITOR: "todas", EXECUTOR: "nenhuma", LEITOR: "nenhuma" },
  mover: { GESTOR: "todas", EDITOR: "todas", EXECUTOR: "proprias", LEITOR: "nenhuma" },
  marcarChecklist: {
    GESTOR: "todas",
    EDITOR: "todas",
    EXECUTOR: "proprias",
    LEITOR: "nenhuma",
  },
  concluir: { GESTOR: "todas", EDITOR: "todas", EXECUTOR: "proprias", LEITOR: "nenhuma" },
  // Executor não cancela: pede ao gestor. Cancelar é decidir que o trabalho
  // não acontece, e quem decide isso é quem responde pelo quadro.
  cancelar: { GESTOR: "todas", EDITOR: "todas", EXECUTOR: "nenhuma", LEITOR: "nenhuma" },
  aprovar: { GESTOR: "todas", EDITOR: "proprias", EXECUTOR: "nenhuma", LEITOR: "nenhuma" },
  comentar: { GESTOR: "todas", EDITOR: "todas", EXECUTOR: "todas", LEITOR: "todas" },
  anexar: { GESTOR: "todas", EDITOR: "todas", EXECUTOR: "todas", LEITOR: "nenhuma" },
  // Executor conclui, mas não exclui (RN-039). O que ele faz é terminar
  // trabalho; apagar o registro dele é outra coisa.
  excluir: { GESTOR: "todas", EDITOR: "proprias", EXECUTOR: "nenhuma", LEITOR: "nenhuma" },
  restaurar: {
    GESTOR: "todas",
    EDITOR: "proprias",
    EXECUTOR: "nenhuma",
    LEITOR: "nenhuma",
  },
  gerenciarMembros: {
    GESTOR: "todas",
    EDITOR: "nenhuma",
    EXECUTOR: "nenhuma",
    LEITOR: "nenhuma",
  },
  configurarProjeto: {
    GESTOR: "todas",
    EDITOR: "nenhuma",
    EXECUTOR: "nenhuma",
    LEITOR: "nenhuma",
  },
  criarModelos: {
    GESTOR: "todas",
    EDITOR: "nenhuma",
    EXECUTOR: "nenhuma",
    LEITOR: "nenhuma",
  },
  verRelatorios: {
    GESTOR: "todas",
    EDITOR: "todas",
    EXECUTOR: "proprias",
    LEITOR: "nenhuma",
  },
  verCusto: { GESTOR: "todas", EDITOR: "nenhuma", EXECUTOR: "nenhuma", LEITOR: "nenhuma" },
};

/** O alcance cru, para a tela decidir se mostra o botão ou some com ele. */
export function alcanceDe(papel: PapelProjeto, acao: AcaoTarefa): Alcance {
  return MATRIZ[acao][papel];
}

/**
 * O papel que vale de verdade neste projeto.
 *
 * O papel global ganha do papel do projeto, nos dois casos da tabela 14.1: o
 * Dono é administrador de tudo, e o Gerente é gestor em todo projeto da
 * empresa. Sem isto, o dono precisaria se adicionar como membro de cada quadro
 * que cria — e um dia esqueceria, ficando trancado fora do próprio sistema.
 *
 * O superusuário entra no mesmo caso, qualquer que seja o papel global dele.
 * Ele passa em toda trava de módulo (`can()` em `lib/roles.ts`), e o Tarefas
 * é hoje um módulo só dele: sem esta linha, um superusuário com papel de
 * Caixa entraria no módulo e encontraria a tela vazia, por não ser membro de
 * quadro nenhum. Pelo link de atalhos não vale, como em `can()`.
 *
 * Para os demais (Caixa, Financeiro, Estoquista), vale o que estiver gravado
 * em `MembroProjeto`. Nulo = não é membro.
 *
 * Recebe a pessoa, e não só o papel, porque a resposta depende de duas
 * marcas dela além do papel; passar três argumentos soltos é como um dia
 * alguém esquece um.
 */
export function papelEfetivo(
  quem: QuemDecide,
  papelNoProjeto: PapelProjeto | null,
): PapelProjeto | null {
  if (quem.role === "DONO" || quem.role === "GERENTE") return "GESTOR";
  if (quem.superusuario && !quem.atalho) return "GESTOR";
  return papelNoProjeto;
}

/** O que `papelEfetivo` precisa saber da pessoa — um pedaço de `CurrentUser`. */
export type QuemDecide = {
  role: UserRole;
  superusuario?: boolean;
  atalho?: boolean;
};

/**
 * Esta pessoa pode fazer isto?
 *
 * `ehMinha` só é olhado quando o alcance é "proprias" — ver o que "própria"
 * significa em cada ação no comentário de `Alcance`.
 */
export function podeNaTarefa(
  papel: PapelProjeto | null,
  acao: AcaoTarefa,
  ehMinha = false,
): boolean {
  if (papel === null) return false;
  const alcance = alcanceDe(papel, acao);
  if (alcance === "todas") return true;
  if (alcance === "nenhuma") return false;
  return ehMinha;
}
