import { can, type CurrentUser } from "../lib/roles";
import { colunaEquivalente, COLUNAS_PADRAO } from "../lib/tarefas-colunas";
import {
  estouroDeWip,
  movimentoExiste,
  podeMover,
  podeNascerEm,
  statusDaEtapa,
  type TarefaEmMovimento,
} from "../lib/tarefas-fluxo";
import { situacaoDoPrazo } from "../lib/tarefas-labels";
import { ehImportante, ehUrgente, quadranteDe } from "../lib/tarefas-matriz";
import { papelEfetivo, podeNaTarefa } from "../lib/tarefas-permissoes";

/**
 * O quadro decide certo, sem tocar no banco.
 *
 * A máquina de estados e a matriz de permissão são puras de propósito, então o
 * teste delas também é: roda em meio segundo, sem servidor e sem Postgres, e
 * por isso dá para rodar antes de qualquer tela existir. É o mesmo arranjo de
 * `scripts/test-lote.ts`.
 *
 * Isso importa mais aqui do que parece: o `.env` deste projeto aponta para o
 * banco de produção. Um teste de regra de negócio que precisasse de conexão
 * escreveria dado de verdade para conferir uma tabela de decisão.
 *
 * Os casos K1 a K7 são os da tabela 20.3 do PRD, na ordem em que estão lá.
 */

let falhas = 0;
function check(label: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
}

/** Um cartão sem pendência nenhuma: com dono, sem checklist, sem limite. */
function cartao(ajustes: Partial<TarefaEmMovimento> = {}): TarefaEmMovimento {
  return {
    temResponsavel: true,
    aguardandoPreenchido: true,
    temRecorrencia: true,
    temDocumento: true,
    checklistPendente: 0,
    ehGestor: true,
    wip: null,
    ...ajustes,
  };
}

console.log("— o modelo de colunas —");
check("são oito colunas", COLUNAS_PADRAO.length === 8);
check(
  "LAPIDAR vem antes de A FAZER (decisão D3)",
  COLUNAS_PADRAO.findIndex((c) => c.nome === "LAPIDAR") <
    COLUNAS_PADRAO.findIndex((c) => c.nome === "A FAZER"),
);
check("BACKLOG é a primeira", COLUNAS_PADRAO[0].nome === "BACKLOG");
check("CONCLUÍDO é a última", COLUNAS_PADRAO[7].nome === "CONCLUÍDO");
check(
  "toda coluna padrão declara uma etapa",
  COLUNAS_PADRAO.every((c) => typeof c.estado === "string" && c.estado.length > 0),
);
check("só EM ANDAMENTO limita WIP por padrão", 
  COLUNAS_PADRAO.filter((c) => c.wipPorPessoa !== null).length === 1 &&
    COLUNAS_PADRAO.find((c) => c.wipPorPessoa !== null)?.nome === "EM ANDAMENTO");

console.log("\n— K1: BACKLOG para AGUARDANDO é bloqueado —");
const k1 = podeMover("ENTRADA", "EXECUCAO_BLOQUEADA", cartao());
check("recusado", k1.ok === false);
check(
  "não é só um campo faltando: o caminho não existe",
  k1.ok === false && k1.exige === null,
);
check(
  "a mensagem diz por onde ir",
  k1.ok === false && k1.motivo.includes("EM ANDAMENTO"),
  k1.ok === false ? k1.motivo : "",
);

console.log("\n— K2: A FAZER para AGUARDANDO sem previsão pede a previsão —");
const k2 = podeMover("PLANEJADO", "EXECUCAO_BLOQUEADA", cartao({ aguardandoPreenchido: false }));
check("recusado", k2.ok === false);
check("pede motivo e previsão", k2.ok === false && k2.exige === "motivoEPrevisao");
check(
  "com as duas respostas, passa",
  podeMover("PLANEJADO", "EXECUCAO_BLOQUEADA", cartao()).ok === true,
);

console.log("\n— K3: concluir em EM ANDAMENTO leva para CONCLUÍDO —");
check("o movimento existe", movimentoExiste("EXECUCAO", "CONCLUIDO"));
check("e passa", podeMover("EXECUCAO", "CONCLUIDO", cartao()).ok === true);
check("chegar em CONCLUÍDO fecha a tarefa", statusDaEtapa("CONCLUIDO") === "CONCLUIDA");
check("qualquer outra etapa a mantém aberta",
  (["ENTRADA", "PLANEJADO", "EXECUCAO", "EXECUCAO_BLOQUEADA", "RECORRENTE",
    "FINALIZADO_COM_REGISTRO"] as const).every((e) => statusDaEtapa(e) === "ABERTA"));

console.log("\n— K4: checklist obrigatório incompleto barra a conclusão —");
const k4 = podeMover("EXECUCAO", "CONCLUIDO", cartao({ checklistPendente: 3 }));
check("recusado", k4.ok === false);
check("diz quantos faltam", k4.ok === false && k4.motivo.includes("3"), k4.ok === false ? k4.motivo : "");
check("no singular também", (() => {
  const um = podeMover("EXECUCAO", "CONCLUIDO", cartao({ checklistPendente: 1 }));
  return um.ok === false && um.motivo.includes("Falta 1 item");
})());
check(
  "vale para arrastar e para o botão — é a mesma regra",
  podeMover("PLANEJADO", "CONCLUIDO", cartao({ checklistPendente: 2 })).ok === false,
);

console.log("\n— K5: o sexto cartão com WIP 5 bloqueante é barrado —");
const k5 = podeMover("PLANEJADO", "EXECUCAO", cartao({ wip: { limite: 5, jaTem: 5, bloquear: true } }));
check("recusado", k5.ok === false);
check("por WIP", k5.ok === false && k5.exige === "wip");
check(
  "o quinto ainda passa",
  podeMover("PLANEJADO", "EXECUCAO", cartao({ wip: { limite: 5, jaTem: 4, bloquear: true } })).ok === true,
);
check(
  "no modo avisar, o sexto passa",
  podeMover("PLANEJADO", "EXECUCAO", cartao({ wip: { limite: 5, jaTem: 5, bloquear: false } })).ok === true,
);
check("mas o estouro continua visível para a tela",
  estouroDeWip({ limite: 5, jaTem: 5, bloquear: false }) === true);
check("coluna sem limite nunca estoura", estouroDeWip({ limite: null, jaTem: 99, bloquear: true }) === false);

console.log("\n— K6: reabrir sai de CONCLUÍDO —");
check("volta para execução", movimentoExiste("CONCLUIDO", "EXECUCAO"));
check("e para planejado", movimentoExiste("CONCLUIDO", "PLANEJADO"));
check("mas não para o BACKLOG", movimentoExiste("CONCLUIDO", "ENTRADA") === false);
check("nem para AGUARDANDO", movimentoExiste("CONCLUIDO", "EXECUCAO_BLOQUEADA") === false);

console.log("\n— K7: mudar de projeto sem a coluna extra —");
const manutencao = COLUNAS_PADRAO.map((c, i) => ({
  id: i + 1, nome: c.nome, estado: c.estado, ordem: (i + 1) * 10, oculta: false,
}));
const treinamento = { nome: "TREINAMENTO", estado: "FINALIZADO_COM_REGISTRO" as const };
check(
  "TREINAMENTO cai em DOCUMENTADO, a coluna da mesma etapa",
  colunaEquivalente(manutencao, treinamento)?.nome === "DOCUMENTADO",
  colunaEquivalente(manutencao, treinamento)?.nome,
);
check(
  "coluna de mesmo nome ganha da de mesma etapa",
  colunaEquivalente(manutencao, { nome: "A FAZER", estado: "PLANEJADO" })?.nome === "A FAZER",
);
const financeiro = manutencao.filter((c) => !["LAPIDAR", "DOCUMENTADO"].includes(c.nome));
check(
  "destino sem a etapa nenhuma cai na primeira coluna",
  colunaEquivalente(financeiro, treinamento)?.nome === "BACKLOG",
  colunaEquivalente(financeiro, treinamento)?.nome,
);
check(
  "coluna oculta não recebe cartão",
  colunaEquivalente(
    manutencao.map((c) => (c.nome === "DOCUMENTADO" ? { ...c, oculta: true } : c)),
    treinamento,
  )?.nome === "BACKLOG",
);
check("quadro sem coluna visível devolve nulo", colunaEquivalente([], treinamento) === null);

console.log("\n— responsável fora do BACKLOG (RN-010) —");
const semDono = cartao({ temResponsavel: false });
check("BACKLOG aceita cartão sem dono", podeMover("ENTRADA", "ENTRADA", semDono).ok === true);
/* AGUARDANDO fica de fora: sair do BACKLOG para lá é recusado pelo caminho,
   não pela falta de dono — é o K1 lá em cima. */
for (const destino of ["PLANEJADO", "EXECUCAO", "CONCLUIDO"] as const) {
  const r = podeMover("ENTRADA", destino, semDono);
  check(
    `sair do BACKLOG para ${destino} sem dono é recusado`,
    r.ok === false && r.exige === "responsavel",
  );
}
check(
  "a recusa é por campo faltando, não por caminho inexistente",
  (() => {
    const r = podeMover("ENTRADA", "PLANEJADO", semDono);
    return r.ok === false && r.exige !== null;
  })(),
);

console.log("\n— as outras exigências de entrada —");
check("ROTINA pede a regra de repetição", (() => {
  const r = podeMover("EXECUCAO", "RECORRENTE", cartao({ temRecorrencia: false }));
  return r.ok === false && r.exige === "recorrencia";
})());
check("DOCUMENTADO pede o documento", (() => {
  const r = podeMover("EXECUCAO", "FINALIZADO_COM_REGISTRO", cartao({ temDocumento: false }));
  return r.ok === false && r.exige === "documento";
})());
check("descartar do BACKLOG é só do gestor", (() => {
  const r = podeMover("ENTRADA", "CONCLUIDO", cartao({ ehGestor: false }));
  return r.ok === false && r.exige === "gestor";
})());
check(
  "e o gestor consegue",
  podeMover("ENTRADA", "CONCLUIDO", cartao({ ehGestor: true })).ok === true,
);

console.log("\n— a coluna extra herda as regras da etapa dela (RN-051) —");
/* REVISAR, do projeto Eventos, declara ser "execução". Não existe uma linha
   sequer sobre REVISAR no código: ela se comporta como EM ANDAMENTO porque
   as duas são a mesma etapa, e é isso que este bloco confirma. */
/* Não existe uma linha sequer sobre REVISAR no código, e é esse o ponto: a
   máquina recebe a ETAPA, nunca o nome da coluna, então uma coluna extra que se
   declara "execução" é indistinguível de EM ANDAMENTO para ela. Isso é verdade
   por construção — não há o que testar.

   O que dá para conferir é a linha da etapa herdada, e é o que os dois casos
   abaixo fazem: TREINAMENTO ganha as regras de "finalizado com registro", que
   não voltam para o BACKLOG mas seguem para CONCLUÍDO. */
check(
  "TREINAMENTO (finalizado com registro) não volta para o BACKLOG",
  movimentoExiste("FINALIZADO_COM_REGISTRO", "ENTRADA") === false,
);
check(
  "e segue para CONCLUÍDO",
  movimentoExiste("FINALIZADO_COM_REGISTRO", "CONCLUIDO") === true,
);

console.log("\n— toda etapa aceita ela mesma (reordenar, e LAPIDAR → A FAZER) —");
for (const e of ["ENTRADA", "PLANEJADO", "EXECUCAO", "EXECUCAO_BLOQUEADA", "RECORRENTE",
  "FINALIZADO_COM_REGISTRO", "CONCLUIDO"] as const) {
  check(`${e} → ${e}`, movimentoExiste(e, e));
}

console.log("\n— toda recusa estrutural explica o caminho (RN-047) —");
const ETAPAS = ["ENTRADA", "PLANEJADO", "EXECUCAO", "EXECUCAO_BLOQUEADA", "RECORRENTE",
  "FINALIZADO_COM_REGISTRO", "CONCLUIDO"] as const;
let mudas = 0;
for (const de of ETAPAS) {
  for (const para of ETAPAS) {
    if (movimentoExiste(de, para)) continue;
    const r = podeMover(de, para, cartao());
    if (r.ok === false && r.motivo.trim().length > 20) continue;
    mudas++;
    console.log(`   sem explicação: ${de} → ${para}`);
  }
}
check("nenhuma recusa muda", mudas === 0);

console.log("\n— a matriz de permissão (14.2) —");
check("leitor não cria tarefa", podeNaTarefa("LEITOR", "criarTarefa") === false);
check("leitor comenta", podeNaTarefa("LEITOR", "comentar") === true);
check("leitor não anexa", podeNaTarefa("LEITOR", "anexar") === false);
check("executor conclui as suas", podeNaTarefa("EXECUTOR", "concluir", true) === true);
check("executor não conclui as dos outros", podeNaTarefa("EXECUTOR", "concluir", false) === false);
check("executor não exclui nem as suas (RN-039)", podeNaTarefa("EXECUTOR", "excluir", true) === false);
check("executor não cancela", podeNaTarefa("EXECUTOR", "cancelar", true) === false);
check("executor não atribui", podeNaTarefa("EXECUTOR", "atribuir", true) === false);
check("editor exclui as que criou", podeNaTarefa("EDITOR", "excluir", true) === true);
check("editor não exclui as dos outros", podeNaTarefa("EDITOR", "excluir", false) === false);
check("editor não mexe em membros", podeNaTarefa("EDITOR", "gerenciarMembros") === false);
check("editor não vê custo", podeNaTarefa("EDITOR", "verCusto") === false);
check("gestor faz tudo", (["verProjeto", "criarTarefa", "atribuir", "mover", "concluir",
  "cancelar", "excluir", "gerenciarMembros", "configurarProjeto", "verCusto"] as const)
  .every((a) => podeNaTarefa("GESTOR", a) === true));
check("quem não é membro não faz nada", podeNaTarefa(null, "verProjeto") === false);

console.log("\n— o papel global ganha do papel do projeto (14.1) —");
check("dono é gestor mesmo sem ser membro", papelEfetivo({ role: "DONO" }, null) === "GESTOR");
check("gerente é gestor em todo projeto", papelEfetivo({ role: "GERENTE" }, null) === "GESTOR");
check("dono não vira leitor por engano", papelEfetivo({ role: "DONO" }, "LEITOR") === "GESTOR");
check("caixa vale o que está gravado", papelEfetivo({ role: "CAIXA" }, "EXECUTOR") === "EXECUTOR");
check("caixa sem linha de membro não entra", papelEfetivo({ role: "CAIXA" }, null) === null);
check("financeiro idem", papelEfetivo({ role: "FINANCEIRO" }, "LEITOR") === "LEITOR");
check("superusuário é gestor qualquer que seja o papel",
  papelEfetivo({ role: "CAIXA", superusuario: true }, null) === "GESTOR");
check("superusuário não vira leitor por engano",
  papelEfetivo({ role: "ESTOQUISTA", superusuario: true }, "LEITOR") === "GESTOR");
check("pelo link de atalhos, superusuário não vale",
  papelEfetivo({ role: "CAIXA", superusuario: true, atalho: true }, null) === null);

console.log("\n— o módulo é só do superusuário (can) —");
const pessoa = (extra: Partial<CurrentUser>): CurrentUser => ({
  id: 1, username: "teste", name: null, role: "DONO",
  grants: [{ moduleSlug: "tarefas", canConfigure: true }], ...extra,
});
check("superusuário entra", can(pessoa({ superusuario: true }), "tarefas") === true);
check("superusuário configura", can(pessoa({ superusuario: true }), "tarefas", { configure: true }) === true);
check("dono com permissão gravada não entra", can(pessoa({}), "tarefas") === false);
check("superusuário pelo link de atalhos não entra",
  can(pessoa({ superusuario: true, atalho: true }), "tarefas", { atalho: true }) === false);
check("a trava não vaza para os outros módulos",
  can(pessoa({ grants: [{ moduleSlug: "compras", canConfigure: false }] }), "compras") === true);


console.log("\n— o prazo no cartão (RF-081 e RN-023) —");
const SP = "America/Sao_Paulo";
/* Data sem hora é gravada ao meio-dia UTC, a convenção de `diaISO`. */
const dia = (iso: string) => new Date(`${iso}T12:00:00Z`);
const situacao = (
  prazo: Date | null,
  diaInteiro: boolean,
  agora: Date,
) => situacaoDoPrazo(prazo, diaInteiro, SP, agora);

check("sem prazo não diz nada", situacao(null, true, dia("2026-09-21")) === null);

/* CA-016: prazo 20/09 sem hora, e são 00h01 de 21/09 em São Paulo (03h01 UTC). */
const ca016 = situacao(dia("2026-09-20"), true, new Date("2026-09-21T03:01:00Z"));
check("CA-016: atrasada há 1 dia", ca016?.texto === "atrasada há 1 dia", ca016?.texto);
check("e marcada como atrasada", ca016?.atrasada === true);

/* A outra metade do RN-023: às 23h do próprio dia ela ainda não venceu. */
const noDia = situacao(dia("2026-09-20"), true, new Date("2026-09-21T02:00:00Z"));
check(
  "às 23h do dia do prazo ainda é 'hoje'",
  noDia?.texto === "hoje" && noDia.atrasada === false,
  noDia?.texto,
);

const comHoraAntes = situacao(
  new Date("2026-09-20T17:00:00Z"), // 14h em São Paulo
  false,
  new Date("2026-09-20T16:00:00Z"), // 13h
);
check("com hora, antes da hora: 'hoje às 14:00'", comHoraAntes?.texto === "hoje às 14:00",
  comHoraAntes?.texto);
check("e não está atrasada", comHoraAntes?.atrasada === false);

const comHoraDepois = situacao(
  new Date("2026-09-20T17:00:00Z"),
  false,
  new Date("2026-09-20T18:00:00Z"), // 15h, já passou
);
check("com hora, depois da hora: venceu hoje", comHoraDepois?.texto === "venceu hoje",
  comHoraDepois?.texto);
check("e está atrasada", comHoraDepois?.atrasada === true);

check(
  "amanhã",
  situacao(dia("2026-09-22"), true, dia("2026-09-21"))?.texto === "amanhã",
);
check(
  "faltam 5 dias",
  situacao(dia("2026-09-26"), true, dia("2026-09-21"))?.texto === "faltam 5 dias",
);
check(
  "atrasada há 2 dias",
  situacao(dia("2026-09-19"), true, dia("2026-09-21"))?.texto === "atrasada há 2 dias",
);
check(
  "atraso e prazo de hoje são pendência, nunca alarme",
  ca016?.tom === "pendente" && noDia?.tom === "pendente",
);


console.log("\n— nascer numa coluna não é mover para ela (RF-003) —");
/* O "+" no topo de uma coluna cria o cartão ali dentro. Não há caminho a
   validar — a tarefa não vinha de lugar nenhum —, mas o que a etapa cobra
   continua valendo. */
check(
  "nascer no BACKLOG não pede nada",
  podeNascerEm("ENTRADA", cartao({ temResponsavel: false })).ok === true,
);
check("nascer em A FAZER pede dono", (() => {
  const r = podeNascerEm("PLANEJADO", cartao({ temResponsavel: false }));
  return r.ok === false && r.exige === "responsavel";
})());
check("nascer em AGUARDANDO pede motivo e previsão", (() => {
  const r = podeNascerEm("EXECUCAO_BLOQUEADA", cartao({ aguardandoPreenchido: false }));
  return r.ok === false && r.exige === "motivoEPrevisao";
})());
check(
  "e nascer direto em AGUARDANDO com as respostas é permitido",
  podeNascerEm("EXECUCAO_BLOQUEADA", cartao()).ok === true,
);
check(
  "embora MOVER do BACKLOG para AGUARDANDO continue barrado",
  podeMover("ENTRADA", "EXECUCAO_BLOQUEADA", cartao()).ok === false,
);
check("nascer em DOCUMENTADO pede o documento", (() => {
  const r = podeNascerEm("FINALIZADO_COM_REGISTRO", cartao({ temDocumento: false }));
  return r.ok === false && r.exige === "documento";
})());


console.log("\n— a matriz: urgente e importante são perguntas diferentes —");
/* O TickTick monta os quadrantes só pela prioridade. Aqui os dois eixos são
   coisas distintas, e é isso que estes casos confirmam: a mesma prioridade cai
   em quadrantes diferentes conforme o relógio. */
const semPrazo = null;
const hoje = { texto: "hoje", atrasada: false };
const hojeComHora = { texto: "hoje às 14:00", atrasada: false };
const amanha = { texto: "amanhã", atrasada: false };
const atrasada = { texto: "atrasada há 2 dias", atrasada: true };
const longe = { texto: "faltam 5 dias", atrasada: false };

check("alta e atrasada → Agora", quadranteDe("ALTA", atrasada) === "agora");
check("alta e vence hoje → Agora", quadranteDe("ALTA", hoje) === "agora");
check("alta e vence hoje às 14h → Agora", quadranteDe("ALTA", hojeComHora) === "agora");
check("média e amanhã → Agora", quadranteDe("MEDIA", amanha) === "agora");

check("alta daqui a 5 dias → Planeje", quadranteDe("ALTA", longe) === "planeje");
check("alta sem prazo → Planeje", quadranteDe("ALTA", semPrazo) === "planeje");
check("média sem prazo → Planeje", quadranteDe("MEDIA", semPrazo) === "planeje");

check("baixa e atrasada → Tire da frente", quadranteDe("BAIXA", atrasada) === "tireDaFrente");
check("sem prioridade e hoje → Tire da frente", quadranteDe("NENHUMA", hoje) === "tireDaFrente");

check("baixa e sem prazo → Reveja", quadranteDe("BAIXA", semPrazo) === "reveja");
check("sem prioridade e sem prazo → Reveja", quadranteDe("NENHUMA", semPrazo) === "reveja");
check("sem prioridade daqui a 5 dias → Reveja", quadranteDe("NENHUMA", longe) === "reveja");

/* A prova de que os eixos não são o mesmo: fixando a prioridade, o relógio
   ainda move o cartão de quadrante — e fixando o relógio, a prioridade
   também. Se um eixo fosse cópia do outro, um destes dois seria falso. */
check(
  "mesma prioridade, relógios diferentes, quadrantes diferentes",
  quadranteDe("ALTA", hoje) !== quadranteDe("ALTA", longe),
);
check(
  "mesmo relógio, prioridades diferentes, quadrantes diferentes",
  quadranteDe("ALTA", hoje) !== quadranteDe("BAIXA", hoje),
);
check(
  "os quatro quadrantes são alcançáveis",
  new Set([
    quadranteDe("ALTA", hoje),
    quadranteDe("ALTA", semPrazo),
    quadranteDe("BAIXA", hoje),
    quadranteDe("BAIXA", semPrazo),
  ]).size === 4,
);
check("urgência não olha prioridade", ehUrgente(atrasada) && !ehUrgente(longe));
check("importância não olha prazo", ehImportante("MEDIA") && !ehImportante("BAIXA"));

console.log(falhas === 0 ? "\nO quadro decide certo." : `\n${falhas} falha(s).`);
process.exitCode = falhas === 0 ? 0 : 1;
