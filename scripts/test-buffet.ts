import {
  cardapioDoDia,
  cargaDaJanela,
  custoDoDia,
  custoPorCategoria,
  prePreparos,
  custoPorCliente,
  fluxoDoDia,
  classeDoPrato,
  custoMedio,
  diaDaSemanaBuffet,
  porJanelaECarga,
  repetidosNoDia,
  situacaoDoGrupo,
} from "../lib/buffet-regras";

let falhas = 0;
function igual<T>(nome: string, obtido: T, esperado: T) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok " : "ERRO"} ${nome}${ok ? "" : `\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`}`);
}

// ---- Dia da semana ----
igual("08/10/2026 é quinta", diaDaSemanaBuffet("2026-10-08"), 4);
igual("11/10/2026 é domingo (7)", diaDaSemanaBuffet("2026-10-11"), 7);
igual("05/10/2026 é segunda (1)", diaDaSemanaBuffet("2026-10-05"), 1);

// ---- Custo médio ----
igual("média simples do custo/kg", custoMedio([{ custoKg: 10 }, { custoKg: 20 }, { custoKg: 30 }]), 20);
igual("prato sem custo não entra na média", custoMedio([{ custoKg: 10 }, { custoKg: null }, { custoKg: 20 }]), 15);
igual("sem nenhum custo, nulo", custoMedio([{ custoKg: null }]), null);
igual("arredonda em centavos", custoMedio([{ custoKg: 1.8174 }, { custoKg: 5.5984 }]), 3.71);

// ---- Meta do grupo ----
igual("média acima da meta", situacaoDoGrupo(20, 18, [{ custoKg: 20 }]), "acima");
igual("média dentro, um prato acima: atenção", situacaoDoGrupo(15, 18, [{ custoKg: 10 }, { custoKg: 20 }]), "atencao");
igual("tudo dentro: ok", situacaoDoGrupo(15, 18, [{ custoKg: 15 }]), "ok");
igual("sem meta, nulo", situacaoDoGrupo(15, null, [{ custoKg: 15 }]), null);

// ---- Classe ABC (peso no custo/kg do dia) ----
igual("5% ou mais é A", classeDoPrato(5, 100, 0.05, 0.02), "A");
igual("entre 2% e 5% é B", classeDoPrato(3, 100, 0.05, 0.02), "B");
igual("abaixo de 2% é C", classeDoPrato(1, 100, 0.05, 0.02), "C");
igual("sem custo não tem classe", classeDoPrato(null, 100, 0.05, 0.02), null);

// ---- Cardápio do dia: modelo + trocas ----
const modelo = [
  { grupoId: 1, posicao: 1, pratoId: 10 },
  { grupoId: 1, posicao: 2, pratoId: 11 },
  { grupoId: 2, posicao: 1, pratoId: 20 },
];
const dia = cardapioDoDia(modelo, [
  { grupoId: 1, posicao: 2, pratoId: 12, motivo: "faltou abóbora" },
  { grupoId: 2, posicao: 1, pratoId: null },
  { grupoId: 1, posicao: 3, pratoId: 13 },
]);
igual("troca substitui o prato da posição", dia.find((i) => i.grupoId === 1 && i.posicao === 2)?.pratoId, 12);
igual("troca guarda o motivo", dia.find((i) => i.grupoId === 1 && i.posicao === 2)?.motivo, "faltou abóbora");
igual("troca sem prato esvazia a posição", dia.find((i) => i.grupoId === 2)?.pratoId, null);
igual("troca em posição vazia acrescenta", dia.find((i) => i.posicao === 3)?.pratoId, 13);
igual("o que não trocou fica como o modelo", dia.find((i) => i.posicao === 1 && i.grupoId === 1), { grupoId: 1, posicao: 1, pratoId: 10, trocado: false, motivo: null });
igual("ordenado por grupo e posição", dia.map((i) => `${i.grupoId}.${i.posicao}`), ["1.1", "1.2", "1.3", "2.1"]);

// ---- Repetidos ----
igual(
  "mesmo prato duas vezes no dia",
  [...repetidosNoDia([
    { grupoId: 1, posicao: 1, pratoId: 5 },
    { grupoId: 1, posicao: 7, pratoId: 5 },
    { grupoId: 2, posicao: 1, pratoId: 6 },
  ])],
  [[5, 2]],
);

// ---- Janelas e cargas ----
const fluxo = porJanelaECarga([
  { nome: "Arroz", janela: "J2", carga: "VAPOR" },
  { nome: "Costela", janela: "D1_NOITE", carga: "NOTURNO" },
  { nome: "Batata", janela: "J3", carga: "AR_SECO" },
  { nome: "Alface", janela: null, carga: null },
  { nome: "Abobrinha", janela: "J2", carga: "ASSADO" },
]);
igual("janelas da véspera ao serviço, sem fluxo no fim", fluxo.map((j) => j.janela), ["D1_NOITE", "J2", "J3", null]);
igual("dentro da janela, cargas na ordem do forno", fluxo[1].cargas.map((c) => c.carga), ["VAPOR", "ASSADO"]);

// ---- Fluxo do dia: hoje sem a véspera, amanhã só a véspera ----
const doDia = fluxoDoDia(
  [
    { nome: "Arroz", janela: "J2", carga: "VAPOR" },
    { nome: "Costela de hoje", janela: "D1_NOITE", carga: "NOTURNO" },
  ],
  [
    { nome: "Costela de amanhã", janela: "D1_NOITE", carga: "NOTURNO" },
    { nome: "Pernil", janela: "D1_VESPERA", carga: "BRASEADO" },
    { nome: "Feijão de amanhã", janela: "J1", carga: "VAPOR" },
  ],
);
igual("hoje: só J1 a J5", doDia.hoje.map((j) => j.janela), ["J2"]);
igual("para amanhã: só D-1, véspera antes da noite", doDia.paraAmanha.map((j) => j.janela), ["D1_VESPERA", "D1_NOITE"]);

// ---- Carga do forno na janela ----
igual(
  "conta só o que vai ao combinado",
  cargaDaJanela(
    [
      { posto: "FORNO_COMBINADO", carga: "ASSADO" },
      { posto: "COMBINADO_APOIO", carga: "VAPOR" },
      { posto: "FOGAO_FRITADEIRA", carga: "SEM_FORNO" },
      { posto: "PRACA_FRIA", carga: null },
    ],
    1,
    10,
  ),
  { noForno: 2, capacidade: 10, passa: false },
);
igual("passa da capacidade", cargaDaJanela([{ posto: "FORNO_COMBINADO", carga: "ASSADO" }, { posto: "FORNO_COMBINADO", carga: "MEDIO" }], 1, 1).passa, true);

// ---- Dia real: peso feito e sobra ----
const real = custoDoDia([
  { pratoId: 1, nome: "Arroz", kgProduzido: 20, kgSobra: 2, custoKg: 2 },
  { pratoId: 2, nome: "Fraldinha", kgProduzido: 5, kgSobra: 1, custoKg: 60 },
  { pratoId: 3, nome: "Sem custo", kgProduzido: 3, kgSobra: null, custoKg: null },
]);
igual("custo do dia: kg × custo/kg", real.custo, 340);
igual("média ponderada: o arroz pesa o que saiu", real.mediaPonderada, 13.6);
igual("média simples continua para comparar", real.mediaSimples, 31);
igual("sobra em reais", real.custoSobra, 64);
igual("desperdício em % do custo", real.desperdicioPct, 18.8);
igual("prato sem custo fica fora e é contado", [real.pratos, real.semCusto], [2, 1]);
igual("maior sobra em reais primeiro", real.sobras.map((x) => x.nome), ["Fraldinha", "Arroz"]);
igual("sobra em % do que foi feito", real.sobras[0].pct, 20);
igual("dia sem peso: sem média", custoDoDia([]).mediaPonderada, null);
igual("custo por cliente", custoPorCliente(340, 100), 3.4);
igual("sem clientes, sem conta", custoPorCliente(340, 0), null);

// ---- Custo por categoria ----
const cats = custoPorCategoria([
  { categoria: "Bovino", custoKg: 40 },
  { categoria: "Bovino", custoKg: 60 },
  { categoria: "Folhas", custoKg: 10 },
  { categoria: null, custoKg: 10 },
  { categoria: "Folhas", custoKg: null },
]);
igual("a que mais pesa primeiro", cats.map((c) => c.categoria), ["Bovino", "Folhas", "Sem categoria"]);
igual("média e faixa do custo/kg", [cats[0].media, cats[0].minimo, cats[0].maximo], [50, 40, 60]);
igual("peso na soma do dia", cats[0].pct, 83.3);
igual("prato sem custo conta, mas fica fora da média", [cats[1].pratos, cats[1].semCusto, cats[1].media], [2, 1, 10]);

// ---- Pré-preparos ----
const pre = prePreparos([
  { nome: "Fraldinha", janela: "D1_NOITE", processoD1: "Noturno (cook & hold)", defumar: false },
  { nome: "Pudim", janela: "D1_VESPERA", processoD1: null, defumar: false },
  { nome: "Feijão", janela: "J2", processoD1: "Remolho de 12 h", defumar: false },
  { nome: "Costela", janela: "J1", processoD1: null, defumar: true },
  { nome: "Arroz", janela: "J2", processoD1: null, defumar: false },
  { nome: "Pudim", janela: "D1_VESPERA", processoD1: null, defumar: false },
]);
igual("véspera, noite e depois os outros", pre.map((g) => g.janela), ["D1_VESPERA", "D1_NOITE", null]);
igual("prato repetido aparece uma vez", pre[0].pratos.length, 1);
igual("fora da véspera, só quem tem o que adiantar ou defuma", pre[2].pratos.map((p) => p.nome), ["Costela", "Feijão"]);

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
