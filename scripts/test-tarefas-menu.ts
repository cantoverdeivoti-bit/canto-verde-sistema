import type { EstadoColuna } from "../generated/prisma/client";
import type { TarefaEmMovimento } from "../lib/tarefas-fluxo";
import { etiquetaComNomeDePessoa, mesmaEtiqueta, normalizarEtiqueta } from "../lib/tarefas-etiquetas";
import {
  colunaParaNascer,
  NIVEL_MAXIMO,
  nivelDaFilha,
  podeTerFilha,
  podeVincular,
} from "../lib/tarefas-subtarefas";

/**
 * As regras do menu da tarefa: subtarefa, cópia e etiqueta.
 *
 * Puro, como `scripts/test-tarefas-fluxo.ts`: nenhuma conexão, porque o .env
 * deste projeto aponta para o banco de produção. O que só o banco prova (que
 * apagar o quadro leva as etiquetas junto, por exemplo) está em
 * `scripts/test-tarefas-banco.ts`.
 */

let falhas = 0;
function check(label: string, ok: boolean, detalhe = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detalhe ? ` — ${detalhe}` : ""}`);
  if (!ok) falhas++;
}

/** Um vínculo que passa em tudo; cada caso muda só o que testa. */
function vinculo(ajustes: Partial<Parameters<typeof podeVincular>[0]> = {}) {
  return podeVincular({
    mesmaTarefa: false,
    mesmoProjeto: true,
    paiEhDescendente: false,
    paiAberto: true,
    nivelDoPai: 1,
    alturaDaTarefa: 1,
    ...ajustes,
  });
}

console.log("— subtarefa: três níveis, e não cinco (RF-034) —");
check("o teto é três", NIVEL_MAXIMO === 3);
check("tarefa de cima tem filha no nível 2", nivelDaFilha(1) === 2);
check("tarefa aceita subtarefa", podeTerFilha(1));
check("subtarefa aceita subtarefa", podeTerFilha(2));
check("o terceiro nível não aceita o quarto", podeTerFilha(3) === false);

console.log("\n— vincular tarefa pai —");
check("o caso comum passa", vinculo().ok);
check("não é pai de si mesma", vinculo({ mesmaTarefa: true }).ok === false);
check("pai de outro quadro é recusado", vinculo({ mesmoProjeto: false }).ok === false);
check("pendurar embaixo da própria filha é recusado", vinculo({ paiEhDescendente: true }).ok === false);
check("pai concluído ou cancelado é recusado", vinculo({ paiAberto: false }).ok === false);
check("tarefa sem filha cabe embaixo do nível 2", vinculo({ nivelDoPai: 2, alturaDaTarefa: 1 }).ok);
check("tarefa com filha não cabe embaixo do nível 2",
  vinculo({ nivelDoPai: 2, alturaDaTarefa: 2 }).ok === false);
check("tarefa com neta só cabe solta", vinculo({ nivelDoPai: 1, alturaDaTarefa: 3 }).ok === false);
check("nada cabe embaixo do nível 3", vinculo({ nivelDoPai: 3, alturaDaTarefa: 1 }).ok === false);
check("toda recusa explica", (() => {
  const r = vinculo({ nivelDoPai: 3 });
  return !r.ok && r.motivo.length > 10;
})());

console.log("\n— onde nasce a cópia e a subtarefa —");
type Col = { id: number; estado: EstadoColuna };
const colunas: Col[] = [
  { id: 1, estado: "ENTRADA" },
  { id: 2, estado: "PLANEJADO" },
  { id: 3, estado: "EXECUCAO" },
  { id: 4, estado: "EXECUCAO_BLOQUEADA" },
  { id: 5, estado: "RECORRENTE" },
  { id: 6, estado: "FINALIZADO_COM_REGISTRO" },
  { id: 7, estado: "CONCLUIDO" },
];
/** A cópia: com dono, sem o que é da original (espera, documento, recorrência). */
const copia: TarefaEmMovimento = {
  temResponsavel: true,
  aguardandoPreenchido: false,
  temRecorrencia: false,
  temDocumento: false,
  checklistPendente: 0,
  ehGestor: true,
  wip: null,
};
const em = (id: number) => colunaParaNascer(colunas.find((c) => c.id === id)!, colunas, copia)?.id;
check("de A FAZER, nasce em A FAZER", em(2) === 2);
check("de EM ANDAMENTO, nasce em EM ANDAMENTO", em(3) === 3);
check("de AGUARDANDO, vai para a entrada (a espera é da original)", em(4) === 1);
check("de DOCUMENTADO, vai para a entrada (o documento é da original)", em(6) === 1);
check("de ROTINA, vai para a entrada", em(5) === 1);
check("de CONCLUÍDO, vai para a entrada (cópia de feito é por fazer)", em(7) === 1);
check("sem dono, de A FAZER vai para a entrada (RN-010)",
  colunaParaNascer(colunas[1], colunas, { ...copia, temResponsavel: false })?.id === 1);
check("coluna oculta não recebe a cópia",
  colunaParaNascer({ id: 9, estado: "PLANEJADO" }, colunas, copia)?.id === 1);
check("quadro sem coluna que aceite devolve nulo",
  colunaParaNascer({ id: 4, estado: "EXECUCAO_BLOQUEADA" }, [{ id: 4, estado: "EXECUCAO_BLOQUEADA" }], copia) === null);

console.log("\n— etiqueta nunca é pessoa (RN-020) —");
const equipe = [
  { name: "Lauren Souza", username: "lauren" },
  { name: "JOEL", username: "joel.cozinha" },
  { name: null, username: "aline" },
  { name: "Ana Júlia", username: "anaj" },
];
check("primeiro nome é barrado", etiquetaComNomeDePessoa("LAUREN", equipe) !== null);
check("sem caixa e sem acento também", etiquetaComNomeDePessoa("joel", equipe) !== null);
check("nome completo é barrado", etiquetaComNomeDePessoa("lauren souza", equipe) !== null);
check("usuário é barrado, mesmo sem nome", etiquetaComNomeDePessoa("Aline", equipe) !== null);
check("acento não escapa", etiquetaComNomeDePessoa("ana julia", equipe) !== null);
check("etiqueta de verdade passa", etiquetaComNomeDePessoa("Elétrica", equipe) === null);
check("pedaço de nome passa (só o nome inteiro é pessoa)", etiquetaComNomeDePessoa("Lau", equipe) === null);
check("o motivo diz onde a pessoa vai", (etiquetaComNomeDePessoa("Joel", equipe) ?? "").includes("Quem faz"));
check("vazio não é pessoa", etiquetaComNomeDePessoa("   ", equipe) === null);

console.log("\n— o nome da etiqueta —");
check("espaço sobrando sai", normalizarEtiqueta("  fornecedor   novo ") === "fornecedor novo");
check("corta no tamanho da coluna", normalizarEtiqueta("x".repeat(50)).length === 30);
check("a caixa fica como foi digitada", normalizarEtiqueta("NF-e") === "NF-e");
check("Elétrica e eletrica são a mesma", mesmaEtiqueta("Elétrica", "eletrica"));
check("Elétrica e Hidráulica não são", mesmaEtiqueta("Elétrica", "Hidráulica") === false);

console.log(falhas === 0 ? "\nO menu decide certo." : `\n${falhas} falha(s).`);
process.exitCode = falhas === 0 ? 0 : 1;
