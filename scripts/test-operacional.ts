import { emOrdem, moverNaLista, nomeDaFolha, situacaoDoTreinamento } from "../lib/operacional-regras";

/** As contas do módulo Operacional, sem banco: a ordem do checklist e o treinamento. */

let falhas = 0;
function igual<T>(nome: string, obtido: T, esperado: T) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) console.log(`ok  ${nome}`);
  else {
    falhas++;
    console.log(`ERRO ${nome}\n     obtido:   ${a}\n     esperado: ${b}`);
  }
}

type L = { id: number; ordem: number };
const ids = (x: L[]) => x.map((y) => y.id);
const lista: L[] = [
  { id: 3, ordem: 2 },
  { id: 1, ordem: 1 },
  { id: 2, ordem: 2 },
];
igual("em ordem; empate desempata pelo id", ids(emOrdem(lista)), [1, 2, 3]);
igual("subir", ids(moverNaLista(lista, 3, -1)), [1, 3, 2]);
igual("descer", ids(moverNaLista(lista, 1, 1)), [2, 1, 3]);
igual("a primeira não sobe", ids(moverNaLista(lista, 1, -1)), [1, 2, 3]);
igual("a última não desce", ids(moverNaLista(lista, 3, 1)), [1, 2, 3]);
igual("nome da folha do sub", nomeDaFolha("Salão", "Caixa"), "Salão / Caixa");
igual("nome da folha do departamento todo", nomeDaFolha("Delivery", null), "Delivery");

const pessoas = [
  { id: 10, funcaoId: 1 },
  { id: 11, funcaoId: 2 },
  { id: 12, funcaoId: null },
];
const obrigatorios = [
  { funcaoId: 1, processoId: 100 },
  { funcaoId: 1, processoId: 101 },
  { funcaoId: 2, processoId: 100 },
];
const treinos = [
  { colaboradorId: 10, processoId: 100, data: "2026-01-10" },
  { colaboradorId: 10, processoId: 100, data: "2026-09-01" },
  { colaboradorId: 10, processoId: 100, data: "2026-05-01" },
  { colaboradorId: 11, processoId: 101, data: "2026-02-02" },
];
const s = situacaoDoTreinamento(pessoas, obrigatorios, treinos);
igual("reciclagem: vale a data mais recente", s.get(10)!.processos, [
  { processoId: 100, treinadoEm: "2026-09-01" },
  { processoId: 101, treinadoEm: null },
]);
igual("pendentes contados", s.get(10)!.pendentes, 1);
igual("treino fora do obrigatório da função não conta", s.get(11), { processos: [{ processoId: 100, treinadoEm: null }], pendentes: 1 });
igual("sem função, sem obrigatório", s.get(12), { processos: [], pendentes: 0 });

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
