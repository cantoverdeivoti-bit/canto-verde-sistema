import {
  diasAte,
  domingosEmVolta,
  domingosSeguidos,
  emOrdemDeUrgencia,
  prazosDeEpi,
  prazosDoColaborador,
  proximaTrocaDe,
  type ColaboradorDosPrazos,
} from "../lib/prazos-pessoal";
import { contarMotivos, mesesAte, rotatividadePorMes } from "../lib/desligamento";

/**
 * Os prazos do Departamento pessoal, sem banco: experiência, ASO, férias,
 * domingos seguidos e troca de EPI. Roda com `npx tsx scripts/test-prazos-pessoal.ts`.
 */

let falhas = 0;
function igual<T>(nome: string, obtido: T, esperado: T) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) console.log(`ok  ${nome}`);
  else {
    falhas++;
    console.log(`FALHOU  ${nome}\n  esperado: ${b}\n  obtido:   ${a}`);
  }
}

const hoje = "2026-10-11";
igual("dias até", [diasAte(hoje, "2026-10-11"), diasAte(hoje, "2026-10-21"), diasAte(hoje, "2026-10-01")], [0, 10, -10]);

const base: ColaboradorDosPrazos = {
  id: 1,
  nome: "Paulo",
  tipo: "CLT",
  inicioDasFerias: null,
  experienciaAte: null,
  asoValidoAte: "2027-06-01",
  manipulaAlimentos: true,
  ferias: [],
};
const tipos = (c: Partial<ColaboradorDosPrazos>) => prazosDoColaborador({ ...base, ...c }, hoje).map((p) => p.texto);
igual("sem ASO vem marcado para juntar", prazosDoColaborador({ ...base, asoValidoAte: null }, hoje).map((p) => [p.semData, p.vencido]), [[true, false]]);

// Experiência: avisa nos 10 últimos dias, e some depois que passou.
igual("experiência a 5 dias", tipos({ experienciaAte: "2026-10-16" }), ["experiência termina em 5 dias (16/10): efetivar, prorrogar ou encerrar"]);
igual("experiência hoje", tipos({ experienciaAte: hoje }), ["experiência termina hoje (11/10): efetivar, prorrogar ou encerrar"]);
igual("experiência longe não avisa", tipos({ experienciaAte: "2026-11-30" }), []);
igual("experiência que passou não avisa", tipos({ experienciaAte: "2026-10-01" }), []);
igual("experiência só no CLT", tipos({ tipo: "FIXO", experienciaAte: "2026-10-16" }), []);

// Aprendiz: avisa 30 dias antes do fim do contrato.
igual("aprendiz a 20 dias", tipos({ contratoAte: "2026-10-31" }), ["contrato de aprendiz termina em 20 dias (31/10): efetivar ou encerrar"]);
igual("aprendiz longe não avisa", tipos({ contratoAte: "2027-03-01" }), []);

// ASO: 30 dias antes; vencido; sem data cobra do CLT e de quem manipula alimentos.
igual("ASO a 20 dias", tipos({ asoValidoAte: "2026-10-31" }), ["ASO vence em 20 dias (31/10)"]);
igual("ASO vencido", tipos({ asoValidoAte: "2026-10-09" }), ["ASO venceu há 2 dias (09/10)"]);
igual("ASO longe não avisa", tipos({ asoValidoAte: "2027-01-01" }), []);
igual("CLT sem ASO", tipos({ asoValidoAte: null, manipulaAlimentos: false }), ["sem ASO registrado"]);
igual("free que manipula alimentos sem ASO", tipos({ tipo: "FREELANCER", asoValidoAte: null }), ["sem ASO registrado (manipula alimentos)"]);
igual("free do salão sem ASO não avisa", tipos({ tipo: "FREELANCER", asoValidoAte: null, manipulaAlimentos: false }), []);

// Férias: vencidas e perto do prazo vêm da regra das férias.
igual("férias vencidas", tipos({ inicioDasFerias: "2023-01-10" })[0]?.startsWith("férias vencidas"), true);
igual("férias perto do prazo", tipos({ inicioDasFerias: "2024-11-20" }), ["férias: faltam 30 dias para marcar até 19/11"]);
igual("férias marcadas não avisam", tipos({ inicioDasFerias: "2024-11-20", ferias: [{ inicio: "2026-10-20", fim: "2026-11-18" }] }), []);

// Domingos: a sequência acima do limite que chega ao domingo atual ou passa dele.
const ds = domingosEmVolta(hoje, 3, 3);
igual("domingos em volta", ds, ["2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01"]);
const escalados = (ids: number[][]) => ds.map((data, i) => ({ data, escalados: new Set(ids[i]) }));
const pessoas = [
  { id: 1, nome: "Paulo" },
  { id: 2, nome: "Valdete" },
  { id: 3, nome: "Aline" },
];
// Paulo: 4 seguidos até 18/10. Valdete: 3 seguidos, mas só no passado (antes de 11/10). Aline: folga a cada 2.
const d = domingosSeguidos(
  escalados([[2], [1, 2, 3], [1, 2, 3], [1], [1, 3], [3], []]),
  pessoas,
  2,
  hoje,
);
igual("domingos seguidos", d.map((p) => p.texto), ["4 domingos seguidos na escala (27/09 a 18/10); o limite é 2"]);
igual("dentro do limite não avisa", domingosSeguidos(escalados([[1], [1], [], [1], [1], [], [1]]), pessoas, 2, hoje), []);

// EPI: desgastado sempre avisa; troca 15 dias antes; sem troca prevista não avisa.
const epi = prazosDeEpi(
  [
    { colaboradorId: 1, nome: "Paulo", item: "Bota", proximaTroca: "2026-10-20", desgastado: false },
    { colaboradorId: 1, nome: "Paulo", item: "Luva", proximaTroca: null, desgastado: true },
    { colaboradorId: 2, nome: "Valdete", item: "Avental", proximaTroca: "2026-10-05", desgastado: false },
    { colaboradorId: 3, nome: "Aline", item: "Uniforme", proximaTroca: "2027-03-01", desgastado: false },
    { colaboradorId: 3, nome: "Aline", item: "Touca", proximaTroca: null, desgastado: false },
  ],
  hoje,
);
igual("EPI", epi.map((p) => p.texto), ["Bota: troca em 9 dias (20/10)", "Luva: marcado como desgastado, trocar", "Avental: troca atrasada 6 dias (05/10)"]);
igual("próxima troca", [proximaTrocaDe("2026-10-11", 180), proximaTrocaDe("2026-10-11", null), proximaTrocaDe("2026-10-11", 0)], ["2027-04-09", null, null]);
igual("ordem: vencidos primeiro", emOrdemDeUrgencia(epi).map((p) => p.texto.split(":")[0]), ["Avental", "Luva", "Bota"]);

// Rotatividade: desligados ÷ média de ativos do início e do fim do mês.
igual("meses até", mesesAte("2026-02", 4), ["2025-11", "2025-12", "2026-01", "2026-02"]);
const equipe = [
  { inicio: null, fim: null },
  { inicio: null, fim: null },
  { inicio: "2026-01-10", fim: null },
  { inicio: null, fim: "2026-10-15" },
  { inicio: "2026-09-01", fim: "2026-10-01" },
  { inicio: "2026-10-20", fim: null },
];
const [out] = rotatividadePorMes(equipe, ["2026-10"]);
// Em 01/10: os dois de sempre, o de janeiro e o que sai dia 15 (o que sai no dia 1 já não conta) = 4.
// Em 31/10: os dois, o de janeiro e o que entrou dia 20 = 4. Saíram 2: 2 ÷ 4 = 50%.
igual("rotatividade do mês", out, { mes: "2026-10", admitidos: 1, desligados: 2, ativosNoInicio: 4, ativosNoFim: 4, percentual: 50 });
igual("mês sem ninguém", rotatividadePorMes([], ["2026-10"])[0].percentual, null);
igual("motivos do mais comum", contarMotivos(["Salário", "Horário", "Salário", null]), [
  { valor: "Salário", n: 2 },
  { valor: "Horário", n: 1 },
  { valor: null, n: 1 },
]);

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
