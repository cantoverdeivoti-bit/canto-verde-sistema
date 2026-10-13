import {
  custoDaSemana,
  diaDaSemana,
  diariaDoDia,
  montarSemana,
  segundaDaSemana,
  textoDoWhatsApp,
  type PessoaDaEscala,
  type Posto,
} from "../lib/escala";
import { faltasDoCadastro } from "../lib/cadastro-incompleto-regras";
import { avisosDaDivisao, diasDe, fimDe, situacaoDeFerias, somarAnos } from "../lib/ferias";
import {
  custoDoItem,
  descreverItem,
  ENCARGOS_PADRAO_DO_CLT,
  linhaDoCmo,
  percentualDoCmo,
  projecaoDoMes,
  recebeItem,
  situacaoDaMeta,
  type ItemDeCusto,
  type PessoaDoCmo,
} from "../lib/cmo";
import { custoDiarioDaPessoa, diasDoMes, orcamentoDoDia, orcamentoDoMes, sobraDoOrcamento } from "../lib/cmo-orcamento";
import { mascaraCpf } from "../lib/pessoal";
import { cadastroPeloLinkSchema, cpfValido } from "../lib/validations";

/**
 * As contas do Departamento pessoal, sem banco: a escala (fixa, exceção,
 * férias, folga, avisos, custo) e as férias da CLT (prazo, divisão, datas de
 * borda), o CPF do cadastro pelo link e o CMO. Roda com `npx tsx scripts/test-escala.ts`.
 */

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

// ---- datas da semana ----
igual("segunda de uma quarta", segundaDaSemana("2026-10-07"), "2026-10-05");
igual("segunda de um domingo", segundaDaSemana("2026-10-11"), "2026-10-05");
igual("segunda de uma segunda", segundaDaSemana("2026-10-05"), "2026-10-05");
igual("dia da semana", diaDaSemana("2026-10-05"), 1);

// ---- escala ----
const postos: Posto[] = [
  { id: 1, area: "COZINHA", nome: "Chapa", ordem: 1 },
  { id: 2, area: "COZINHA", nome: "Fritura", ordem: 2 },
  { id: 3, area: "SALAO", nome: "Caixa", ordem: 1 },
];
const pessoas: PessoaDaEscala[] = [
  { id: 10, nome: "Paulo", tipo: "CLT", area: "COZINHA", ativo: true, diaria: null, salario: 3000 },
  { id: 11, nome: "Valdete", tipo: "CLT", area: "COZINHA", ativo: true, diaria: null, salario: 2400 },
  { id: 12, nome: "Aline", tipo: "CLT", area: "SALAO", ativo: true, diaria: null, salario: null },
  { id: 13, nome: "Serve bem", tipo: "FREELANCER", area: "SALAO", ativo: true, diaria: 150, salario: null },
  { id: 14, nome: "Juan", tipo: "CLT", area: "COZINHA", ativo: false, diaria: null, salario: 2000 },
];
const todosOsDias = [0, 1, 2, 3, 4, 5, 6];
// Paulo na chapa todos os dias (sem folga); Valdete na fritura de terça a domingo;
// Aline no caixa de segunda a sexta, o free no fim de semana.
const fixa = [
  ...todosOsDias.map((d) => ({ postoId: 1, diaSemana: d, colaboradorId: 10 })),
  ...[2, 3, 4, 5, 6, 0].map((d) => ({ postoId: 2, diaSemana: d, colaboradorId: 11 })),
  ...[1, 2, 3, 4, 5].map((d) => ({ postoId: 3, diaSemana: d, colaboradorId: 12 })),
  ...[6, 0].map((d) => ({ postoId: 3, diaSemana: d, colaboradorId: 13 })),
];
const segunda = "2026-10-05";

const s1 = montarSemana({ segunda, postos, fixa, doDia: [], ferias: [], pessoas });
igual("sete dias", s1.dias, ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
igual("fritura vazia na segunda (livre)", s1.celulas.get(2)![0], { colaboradorId: null, terceirizadoId: null, origem: "livre", ausente: null, fechado: false });
igual("folga de segunda: Valdete", s1.folgas[0], [11]);
igual("folga de sábado: Aline", s1.folgas[5], [12]);
igual("Paulo sem folga", s1.avisos.filter((a) => a.tipo === "sem-folga"), [{ tipo: "sem-folga", colaboradorId: 10 }]);
igual("desligado não folga", s1.folgas.some((f) => f.includes(14)), false);

// Exceção: na quarta, Valdete troca para a chapa e Paulo sai (duplo + exceção).
const s2 = montarSemana({
  segunda,
  postos,
  fixa,
  doDia: [{ data: "2026-10-07", postoId: 1, colaboradorId: 11 }],
  ferias: [],
  pessoas,
});
igual("exceção vale por cima", s2.celulas.get(1)![2], { colaboradorId: 11, terceirizadoId: null, origem: "dia", ausente: null, fechado: false });
igual(
  "duplo na quarta",
  s2.avisos.filter((a) => a.tipo === "duplo"),
  [{ tipo: "duplo", data: "2026-10-07", colaboradorId: 11, postoIds: [1, 2] }],
);
igual("Paulo folga na quarta", s2.folgas[2], [10]);
igual("Paulo deixa de ficar sem folga", s2.avisos.some((a) => a.tipo === "sem-folga"), false);

// Exceção que esvazia: descoberto de propósito.
const s3 = montarSemana({ segunda, postos, fixa, doDia: [{ data: "2026-10-06", postoId: 3, colaboradorId: null }], ferias: [], pessoas });
igual(
  "posto esvaziado vira aviso",
  s3.avisos.filter((a) => a.tipo === "descoberto"),
  [{ tipo: "descoberto", data: "2026-10-06", postoId: 3, quem: 12, motivo: "vazio" }],
);

// Férias: Paulo de quinta a sábado sai da chapa e vai para "de férias".
const s4 = montarSemana({
  segunda,
  postos,
  fixa,
  doDia: [],
  ferias: [{ colaboradorId: 10, inicio: "2026-10-08", fim: "2026-10-10" }],
  pessoas,
});
igual("férias tiram do posto", s4.celulas.get(1)![3], {
  colaboradorId: null,
  terceirizadoId: null,
  origem: "fixa",
  ausente: { colaboradorId: 10, motivo: "ferias" },
  fechado: false,
});
igual("de férias na quinta", s4.deFerias[3], [10]);
igual("de férias não é folga", s4.folgas[3].includes(10), false);
igual("três dias descobertos", s4.avisos.filter((a) => a.tipo === "descoberto").length, 3);

// Desligado na fixa: sai do posto, com o motivo.
const fixaComJuan = [...fixa, { postoId: 2, diaSemana: 1, colaboradorId: 14 }];
const s5 = montarSemana({ segunda, postos, fixa: fixaComJuan, doDia: [], ferias: [], pessoas });
igual("desligado sai do posto", s5.celulas.get(2)![0].ausente, { colaboradorId: 14, motivo: "desligado" });

// Posto fechado: o 3 fecha de segunda a sexta na semana; abre só na sexta (09/10) e fecha só no domingo (11/10).
const postosComFechado = postos.map((p) => (p.id === 3 ? { ...p, diasFechados: [1, 2, 3, 4, 5] } : p));
const s6 = montarSemana({
  segunda,
  postos: postosComFechado,
  // Fechar na semana tira da fixa quem estava no posto naqueles dias.
  fixa: fixa.filter((f) => !(f.postoId === 3 && f.colaboradorId === 12)),
  doDia: [
    { data: "2026-10-09", postoId: 3, colaboradorId: null, fechado: false },
    { data: "2026-10-11", postoId: 3, colaboradorId: null, fechado: true },
  ],
  ferias: [],
  pessoas,
});
igual("fechado na semana", s6.celulas.get(3)!.map((c) => c.fechado), [true, true, true, true, false, false, true]);
igual("fechado não pede ninguém", s6.celulas.get(3)![0], { colaboradorId: null, terceirizadoId: null, origem: "fixa", ausente: null, fechado: true });
igual("fechado não vira aviso", s6.avisos.some((a) => a.tipo === "descoberto" && a.postoId === 3), false);

// Dias de trabalho no cadastro: Valdete (11) trabalha de terça a domingo e
// sai da fritura só na quarta; na segunda é folga, na quarta fica sem posto.
const comDias = pessoas.map((p) => (p.id === 11 ? { ...p, diasDeTrabalho: [2, 3, 4, 5, 6, 0] } : p));
const s7 = montarSemana({
  segunda,
  postos,
  fixa,
  doDia: [{ data: "2026-10-07", postoId: 2, colaboradorId: null }],
  ferias: [],
  pessoas: comDias,
});
igual("segunda é folga", [s7.folgas[0].includes(11), s7.semPosto[0].includes(11)], [true, false]);
igual("quarta fica sem posto", [s7.folgas[2].includes(11), s7.semPosto[2].includes(11)], [false, true]);
// Escalada na segunda, que não é dia dela: aviso.
const s8 = montarSemana({
  segunda,
  postos,
  fixa,
  doDia: [{ data: "2026-10-05", postoId: 2, colaboradorId: 11 }],
  ferias: [],
  pessoas: comDias,
});
igual("fora do dia avisa", s8.avisos.filter((a) => a.tipo === "fora-do-dia"), [
  { tipo: "fora-do-dia", data: "2026-10-05", colaboradorId: 11, postoId: 2 },
]);

// Custo: free 2 diárias × 150; CLT (3000 + 2400) ÷ 30 × 7 = 1260.
const { porDia, ...daSemana } = custoDaSemana(s1, postos, pessoas);
igual("custo", daSemana, { free: 300, diarias: 2, freeSemValor: 0, clt: 1260, total: 1560 });
// O dia: o CLT e fixo é o salário ÷ 30 em todo dia; o free só no dia escalado.
igual("custo do dia: sete dias", porDia.length, 7);
igual("custo do dia: CLT ÷ 30", porDia[0].clt, 180);
igual("custo do dia: soma das diárias = semana", porDia.reduce((s, d) => s + d.free, 0), 300);
igual("custo do dia: soma dos dias = semana", Math.round(porDia.reduce((s, d) => s + d.total, 0) * 100) / 100, 1560);

// Free com diária diferente no domingo: sábado 150 (a de sempre) + domingo 180.
const comDomingo = pessoas.map((p) => (p.id === 13 ? { ...p, diariasPorDia: { 0: 180 } } : p));
igual("custo: diária do dia", custoDaSemana(s1, postos, comDomingo).free, 330);
// Sem a de sempre, só o domingo tem valor: o sábado fica sem valor e avisa.
const soDomingo = pessoas.map((p) => (p.id === 13 ? { ...p, diaria: null, diariasPorDia: { 0: 180 } } : p));
igual("custo: dia sem valor avisa", [custoDaSemana(s1, postos, soDomingo).free, custoDaSemana(s1, postos, soDomingo).freeSemValor], [180, 1]);
igual("diária do dia ou a de sempre", [diariaDoDia({ diaria: 150, diariasPorDia: { 0: 180 } }, 0), diariaDoDia({ diaria: 150, diariasPorDia: { 0: 180 } }, 6)], [180, 150]);

// Orçamento do CMO: meta × faturamento, o dia é o mês ÷ os dias do mês.
igual("dias do mês", [diasDoMes("2026-02"), diasDoMes("2028-02"), diasDoMes("2026-10")], [28, 29, 31]);
igual("orçamento do mês", orcamentoDoMes(30, 100_000), 30_000);
igual("sem meta ou faturamento, sem orçamento", [orcamentoDoMes(null, 100_000), orcamentoDoMes(30, null), orcamentoDoMes(30, 0)], [null, null, null]);
const fat = (m: string) => (m === "2026-10" ? 93_000 : m === "2026-11" ? 90_000 : null);
igual("orçamento do dia", orcamentoDoDia("2026-10-11", 30, fat), 900);
// A semana de 26/10 a 01/11 pega 6 dias de outubro e 1 de novembro.
const virada = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];
igual("semana que vira o mês", virada.reduce((s, d) => s + orcamentoDoDia(d, 30, fat)!, 0), 6 * 900 + 900);
const outubro = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
igual("os dias somam o mês exato", Math.round(outubro.reduce((s, d) => s + orcamentoDoDia(d, 30, () => 50_000)!, 0) * 100) / 100, 15_000);
igual("o centavo que sobra vai para os primeiros dias", [orcamentoDoDia("2026-10-01", 30, () => 50_000), orcamentoDoDia("2026-10-31", 30, () => 50_000)], [483.88, 483.87]);
igual("mês sem faturamento, dia sem orçamento", orcamentoDoDia("2026-12-01", 30, fat), null);
igual("sobra e estouro", [sobraDoOrcamento(1000, 800), sobraDoOrcamento(1000, 1250.5), sobraDoOrcamento(null, 10)], [200, -250.5, null]);

// O custo do dia com encargos: CLT é o mês inteiro ÷ 30; o free, benefício por dia só quando escalado.
const itensDoDia: ItemDeCusto[] = [
  { id: 1, nome: "FGTS", natureza: "ENCARGO", forma: "PERCENTUAL_SALARIO", valor: 8, tipos: ["CLT"], ativo: true },
  { id: 2, nome: "VT", natureza: "BENEFICIO", forma: "POR_DIA", valor: 10, tipos: ["CLT", "FREELANCER"], ativo: true },
  { id: 3, nome: "Uniforme", natureza: "BENEFICIO", forma: "POR_MES", valor: 30, tipos: ["FREELANCER"], ativo: true },
  { id: 4, nome: "INSS dele", natureza: "DESCONTO", forma: "PERCENTUAL_SALARIO", valor: 9, tipos: ["CLT"], ativo: true },
];
const baseDoDia = { excecoes: {}, valores: {}, ativo: true, diaria: null, salario: null };
const cltDoDia: PessoaDoCmo = { ...baseDoDia, id: 1, nome: "Paulo", tipo: "CLT", salario: 3000, diasPorSemana: 6 };
const doCltNoDia = custoDiarioDaPessoa(cltDoDia, itensDoDia);
igual("CLT por dia = mês com encargos ÷ 30", Math.round(doCltNoDia.sempre * 100) / 100, Math.round((linhaDoCmo(cltDoDia, itensDoDia).total / 30) * 100) / 100);
igual("CLT sem custo extra por escala", doCltNoDia.seEscalado, 0);
const freeDoDia: PessoaDoCmo = { ...baseDoDia, id: 2, nome: "Serve bem", tipo: "FREELANCER", diaria: 150, diasPorSemana: 2 };
igual("free: benefício por mês ÷ 30 e por dia escalado", custoDiarioDaPessoa(freeDoDia, itensDoDia), { sempre: 1, seEscalado: 10 });
const comCustos = custoDaSemana(s1, postos, pessoas, new Map([[13, { sempre: 1, seEscalado: 10 }], [10, { sempre: 120, seEscalado: 0 }], [11, { sempre: 90, seEscalado: 0 }], [12, { sempre: 0, seEscalado: 0 }]]));
igual("semana com encargos: CLT", comCustos.clt, 7 * 210);
igual("semana com encargos: free (2 diárias + VT + uniforme)", comCustos.free, 300 + 2 * 10 + 7 * 1);

const texto = textoDoWhatsApp(s1, postos, pessoas);
igual("whatsapp: título", texto.split("\n")[0], "*Escala do almoço · 05/10 a 11/10*");
igual("whatsapp: segunda", texto.includes("*Segunda, 05/10*\nCozinha: Chapa Paulo\nSalão: Caixa Aline\nFolga: Valdete"), true);

// ---- férias da CLT ----
igual("29/02 + 1 ano", somarAnos("2028-02-29", 1), "2029-02-28");
igual("29/02 + 4 anos", somarAnos("2028-02-29", 4), "2032-02-29");
igual("30 dias de 01/10", fimDe("2026-10-01", 30), "2026-10-30");
igual("dias de um pedaço", diasDe({ inicio: "2026-12-20", fim: "2027-01-08" }), 20);

igual("primeiro ano", situacaoDeFerias("2026-03-15", "2026-10-05", []), { estado: "primeiro-ano", direitoEm: "2027-03-15" });
igual("sem admissão", situacaoDeFerias(null, "2026-10-05", []), { estado: "sem-admissao" });

const s = situacaoDeFerias("2025-03-15", "2026-10-05", [{ inicio: "2026-12-01", fim: "2026-12-10" }]);
igual("em dia, 10 marcados", s.estado === "em-dia" && [s.prazo, s.marcados, s.faltam], ["2027-03-14", 10, 20]);
igual(
  "prazo perto",
  situacaoDeFerias("2025-03-15", "2027-02-01", []).estado,
  "perto-do-prazo",
);
const venc = situacaoDeFerias("2024-03-15", "2026-10-05", [{ inicio: "2025-06-01", fim: "2025-06-15" }]);
igual("vencida: o período anterior sem os 30", venc.estado === "vencida" && [venc.prazo, venc.marcados, venc.faltam], ["2026-03-14", 15, 15]);
const ok2 = situacaoDeFerias("2024-03-15", "2026-10-05", [{ inicio: "2025-06-01", fim: "2025-06-30" }]);
igual("anterior completo: olha o atual", ok2.estado !== "vencida" && "prazo" in ok2 && ok2.prazo, "2027-03-14");

igual("divisão boa", avisosDaDivisao([{ inicio: "2026-01-01", fim: "2026-01-14" }, { inicio: "2026-03-01", fim: "2026-03-16" }]), []);
igual(
  "parte com menos de 5",
  avisosDaDivisao([{ inicio: "2026-01-01", fim: "2026-01-03" }]),
  ["Uma parte tem menos de 5 dias."],
);
igual(
  "30 dias sem parte de 14",
  avisosDaDivisao([
    { inicio: "2026-01-01", fim: "2026-01-10" },
    { inicio: "2026-02-01", fim: "2026-02-10" },
    { inicio: "2026-03-01", fim: "2026-03-10" },
  ]),
  ["Nenhuma parte tem 14 dias ou mais."],
);

// ---- CPF do cadastro pelo link ----
igual("CPF válido com máscara", cpfValido("529.982.247-25"), true);
igual("CPF válido só dígitos", cpfValido("11144477735"), true);
igual("CPF com dígito errado", cpfValido("529.982.247-24"), false);
igual("CPF repetido", cpfValido("111.111.111-11"), false);
igual("CPF curto", cpfValido("5299822472"), false);
igual("máscara parcial", mascaraCpf("5299822"), "529.982.2");
igual("máscara cheia", mascaraCpf("52998224725999"), "529.982.247-25");

const base = { nome: "Maria da Silva", telefone: "(51) 99988-7766", cpf: "529.982.247-25", nascimento: "", endereco: "", emergenciaNome: "", emergenciaTelefone: "" };
const ok = cadastroPeloLinkSchema.safeParse(base);
igual("link: guarda só os dígitos", ok.success && [ok.data.cpf, ok.data.telefone, ok.data.nascimento], ["52998224725", "+5551999887766", null]);
const semCpf = cadastroPeloLinkSchema.safeParse({ ...base, cpf: "" });
igual("link: CPF obrigatório", !semCpf.success && semCpf.error.issues[0].message, "Digite o seu CPF.");
const cpfRuim = cadastroPeloLinkSchema.safeParse({ ...base, cpf: "123.456.789-00" });
igual("link: CPF que não confere", !cpfRuim.success && cpfRuim.error.issues[0].message, "CPF não confere. Confira os números.");
const crianca = cadastroPeloLinkSchema.safeParse({ ...base, nascimento: `${new Date().getFullYear() - 5}-01-01` });
igual("link: nascimento impossível", crianca.success, false);

// ---- CMO: projeção de um mês padrão, com encargos e benefícios ----
const sem = {};
const equipe: PessoaDoCmo[] = [
  { id: 1, nome: "Paulo", tipo: "CLT", ativo: true, salario: 3000, diaria: null, diasPorSemana: 5, excecoes: sem, valores: {} },
  { id: 2, nome: "Fixa", tipo: "FIXO", ativo: true, salario: 2000, diaria: null, diasPorSemana: 5, excecoes: sem, valores: {} },
  // Free nos sábados e domingos: 2 por semana × 4,35 = 8,7 diárias.
  { id: 3, nome: "Free", tipo: "FREELANCER", ativo: true, salario: null, diaria: 150, diasPorSemana: 2, excecoes: sem, valores: {} },
  { id: 4, nome: "Sem", tipo: "CLT", ativo: true, salario: null, diaria: null, diasPorSemana: 5, excecoes: sem, valores: {} },
  { id: 5, nome: "Saiu", tipo: "CLT", ativo: false, salario: 2500, diaria: null, diasPorSemana: 0, excecoes: sem, valores: {} },
];
const item = (id: number, nome: string, forma: ItemDeCusto["forma"], valor: number, tipos: ItemDeCusto["tipos"], natureza: ItemDeCusto["natureza"] = "ENCARGO", ativo = true): ItemDeCusto =>
  ({ id, nome, natureza, forma, valor, tipos, ativo });
const doClt = ENCARGOS_PADRAO_DO_CLT.map((e, k) => item(k + 1, e.nome, "PERCENTUAL_SALARIO", e.valor, ["CLT"]));
const fixo10 = item(4, "Encargos do fixo", "PERCENTUAL_SALARIO", 10, ["FIXO"]);
const encargos = [...doClt, fixo10];

igual("padrão do CLT soma 29%", ENCARGOS_PADRAO_DO_CLT.reduce((t, e) => t + e.valor, 0), 29);
igual("CLT com os três encargos", linhaDoCmo(equipe[0], encargos).total, 3870);
igual("fixo com o % próprio", linhaDoCmo(equipe[1], encargos).total, 2200);
igual("free: diárias de um mês", [linhaDoCmo(equipe[2], encargos).diasNoMes, linhaDoCmo(equipe[2], encargos).total], [8.7, 1305]);
// Sábado 150 e domingo 180: média 165 × 8,7 = 1435,50. Sem os dias, vale a de sempre.
const freeDoDomingo = { ...equipe[2], diasDaSemana: [6, 0], diariasPorDia: { 0: 180 } };
igual("free: diária do dia no mês", linhaDoCmo(freeDoDomingo, encargos).diarias, 1435.5);
igual("free: só o domingo com valor", linhaDoCmo({ ...freeDoDomingo, diaria: null }, encargos).semValor, true);
igual("free: todos os dias com valor", linhaDoCmo({ ...freeDoDomingo, diaria: null, diariasPorDia: { 0: 180, 6: 150 } }, encargos).semValor, false);

// Formas: R$ 12 por dia em 5 dias por semana = 21,7 dias × 12 = 260,40.
const vale = item(10, "Vale-transporte", "POR_DIA", 12, ["CLT", "FIXO"], "BENEFICIO");
const plano = item(11, "Plano de saúde", "POR_MES", 250, [], "BENEFICIO");
igual("por dia trabalhado", custoDoItem(vale, equipe[0]), 260.4);
igual("por mês", custoDoItem(plano, equipe[0]), 250);
igual("% no free não se aplica", custoDoItem(item(12, "X", "PERCENTUAL_SALARIO", 10, ["FREELANCER"]), equipe[2]), 0);
igual("recebe pelo tipo", [recebeItem(vale, equipe[0]), recebeItem(vale, equipe[2])], [true, false]);
igual("exceção tira", recebeItem(vale, { ...equipe[0], excecoes: { 10: false } }), false);
igual("exceção põe", recebeItem(plano, { ...equipe[0], excecoes: { 11: true } }), true);
igual("item desligado não conta", recebeItem({ ...vale, ativo: false }, equipe[0]), false);
igual("descrição", [descreverItem("PERCENTUAL_SALARIO", 8.33), descreverItem("POR_DIA", 12)], ["8,33% do salário", "R$\u00a012,00 por dia trabalhado"]);

const comBeneficios = [...encargos, vale, plano];
const paulo = { ...equipe[0], excecoes: { 11: true } };
const linhaPaulo = linhaDoCmo(paulo, comBeneficios);
igual("pessoa: encargos e benefícios", [linhaPaulo.encargos, linhaPaulo.beneficios, linhaPaulo.total], [870, 510.4, 4380.4]);

// Valor próprio da pessoa, por cima do cadastro.
igual("valor próprio por dia", custoDoItem(vale, { ...equipe[0], valores: { 10: 10 } }), 217);
igual("valor próprio por mês", custoDoItem(plano, { ...equipe[0], valores: { 11: 300 } }), 300);
const extra = item(13, "Pagamento extra", "POR_MES", 0.01, [], "BENEFICIO");
const aline = { ...equipe[0], excecoes: { 13: true }, valores: { 13: 150 } };
igual("item só da pessoa, com valor próprio", [recebeItem(extra, aline), custoDoItem(extra, aline), recebeItem(extra, equipe[0])], [true, 150, false]);

// Descontos: saem do salário (líquido), não do custo. INSS 9% de 3000 = 270; sindicato R$ 40.
const inss = item(20, "INSS", "PERCENTUAL_SALARIO", 7.5, ["CLT"], "DESCONTO");
const sindicato = item(21, "Sindicato", "POR_MES", 40, ["CLT"], "DESCONTO");
const comDescontos = linhaDoCmo({ ...equipe[0], valores: { 20: 9 } }, [...encargos, inss, sindicato]);
igual("descontos fora do custo", [comDescontos.total, comDescontos.encargos], [3870, 870]);
igual("descontos e líquido", [comDescontos.descontos, comDescontos.liquido], [310, 2690]);
igual("projeção soma os descontos à parte", [
  projecaoDoMes({ pessoas: equipe, itens: [...encargos, inss], faturamentoMensal: null }).descontos,
  projecaoDoMes({ pessoas: equipe, itens: [...encargos, inss], faturamentoMensal: null }).total,
], [225, 7375]);

// Faturamento de 200 mil no mês: (3870 + 2200 + 1305) ÷ 200.000 = 3,7%.
const proj = projecaoDoMes({ pessoas: equipe, itens: encargos, faturamentoMensal: 200000 });
igual("projeção: só ativos", proj.linhas.map((l) => l.nome), ["Paulo", "Fixa", "Free", "Sem"]);
igual("projeção: total e partes", [proj.clt.total, proj.fixo.total, proj.free.total, proj.total], [3870, 2200, 1305, 7375]);
igual("projeção: por natureza", [proj.encargos, proj.beneficios], [1070, 0]);
igual("projeção: total de cada item", proj.itens.map((i) => [i.nome, i.total]), [
  ["13º salário", 249.9],
  ["Férias + 1/3", 333.3],
  ["FGTS", 286.8],
  ["Encargos do fixo", 200],
]);
igual("projeção: sem valor", proj.semValor, 1);
igual("projeção: faturamento e %", [proj.faturamento, proj.percentual], [200000, 3.7]);
const sim = projecaoDoMes({ pessoas: equipe, itens: encargos, faturamentoMensal: null, incluidos: new Set([1, 5]) });
igual("simulação: tira e põe gente", [sim.total, sim.percentual], [3870 + 3225, null]);

// ---- Meta do CMO ----
igual("% do faturamento", percentualDoCmo(31400, 100000), 31.4);
igual("% sem faturamento", percentualDoCmo(31400, null), null);
igual("meta: dentro (igual à meta)", situacaoDaMeta(30, 30), "dentro");
igual("meta: perto (até 10% acima)", situacaoDaMeta(33, 30), "perto");
igual("meta: acima", situacaoDaMeta(33.1, 30), "acima");
igual("sem meta", situacaoDaMeta(40, null), null);

// ---- Cadastro incompleto ----
const completo = {
  tipo: "CLT" as const,
  cpf: "12345678909",
  telefone: "+5551999999999",
  nascimento: new Date("1990-01-01"),
  emergenciaNome: "Ana",
  emergenciaTelefone: "+5551988888888",
  salario: 2000,
  diaria: null,
  comecouEm: new Date("2023-11-01"),
  admissao: new Date("2024-01-01"),
  endereco: "Rua A, 10",
  funcaoId: 1,
  diasDeTrabalho: [1, 2, 3],
  diariasPorDia: 0,
};
igual("cadastro completo", faltasDoCadastro(completo), []);
igual("CLT sem salário, carteira e emergência", faltasDoCadastro({ ...completo, salario: null, admissao: null, emergenciaTelefone: null }), [
  "contato de emergência",
  "salário",
  "carteira assinada",
]);
igual("CLT sem o dia em que começou não falta nada", faltasDoCadastro({ ...completo, comecouEm: null }), []);
igual("fixo sem o dia em que começou", faltasDoCadastro({ ...completo, tipo: "FIXO", admissao: null, comecouEm: null }), ["data em que começou"]);
igual("fixo não precisa de carteira", faltasDoCadastro({ ...completo, tipo: "FIXO", admissao: null }), []);
igual("free sem diária", faltasDoCadastro({ ...completo, tipo: "FREELANCER", salario: null, admissao: null }), ["diária"]);
igual("free só com diária por dia", faltasDoCadastro({ ...completo, tipo: "FREELANCER", diariasPorDia: 2 }), []);
igual("sem CPF e telefone", faltasDoCadastro({ ...completo, cpf: null, telefone: null }), ["CPF", "telefone"]);
igual("sem endereço, função e dias", faltasDoCadastro({ ...completo, endereco: "  ", funcaoId: null, diasDeTrabalho: [] }), [
  "endereço",
  "função",
  "dias de trabalho",
]);
igual("endereço nulo", faltasDoCadastro({ ...completo, endereco: null }), ["endereço"]);

// ---- empresa terceirizada ----
// A Serve bem manda dois garçons na quarta: um no caixa e um na fritura. Não é
// "duplo" (são duas pessoas), não tem folga e cada posto custa uma diária.
const serveBem = { id: 1, nome: "Serve bem", ativo: true, valorPorPessoa: 160 };
const quarta = "2026-10-07";
const comEmpresa = montarSemana({
  segunda,
  postos,
  fixa,
  doDia: [
    { data: quarta, postoId: 2, colaboradorId: null, terceirizadoId: 1 },
    { data: quarta, postoId: 3, colaboradorId: null, terceirizadoId: 1 },
  ],
  ferias: [],
  pessoas,
  terceirizados: [serveBem],
});
igual("terceirizado: célula com a empresa", comEmpresa.celulas.get(3)![2], {
  colaboradorId: null,
  terceirizadoId: 1,
  origem: "dia",
  ausente: null,
  fechado: false,
});
igual(
  "terceirizado: em dois postos não é aviso de duplo",
  comEmpresa.avisos.filter((a) => a.tipo === "duplo").length,
  0,
);
igual(
  "terceirizado: no lugar de quem a fixa punha não é descoberto",
  comEmpresa.avisos.filter((a) => a.tipo === "descoberto" && a.data === quarta).length,
  0,
);
igual("terceirizado: Valdete fica de folga na quarta", comEmpresa.folgas[2].includes(11), true);
const custoSemEmpresa = custoDaSemana(s1, postos, pessoas).porDia[2];
const custoComEmpresa = custoDaSemana(comEmpresa, postos, pessoas).porDia[2];
igual("terceirizado: dois postos, duas diárias de 160", custoComEmpresa.free - custoSemEmpresa.free, 320);
igual("terceirizado: conta as diárias", custoComEmpresa.diarias - custoSemEmpresa.diarias, 2);
igual(
  "terceirizado: sem valor entra nos sem valor",
  custoDaSemana(
    montarSemana({
      segunda,
      postos,
      fixa,
      doDia: [{ data: quarta, postoId: 3, colaboradorId: null, terceirizadoId: 1 }],
      ferias: [],
      pessoas,
      terceirizados: [{ ...serveBem, valorPorPessoa: null }],
    }),
    postos,
    pessoas,
  ).freeSemValor,
  1,
);
igual(
  "terceirizado: o nome no WhatsApp",
  textoDoWhatsApp(comEmpresa, postos, pessoas).includes("Caixa Serve bem · "),
  false,
);
igual(
  "terceirizado: a empresa aparece no salão da quarta",
  textoDoWhatsApp(comEmpresa, postos, pessoas).split("\n").some((l) => l === "Salão: Caixa Serve bem"),
  true,
);
igual(
  "terceirizado: desativado deixa o posto vazio",
  montarSemana({
    segunda,
    postos,
    fixa: [{ postoId: 3, diaSemana: 3, colaboradorId: null, terceirizadoId: 1 }],
    doDia: [],
    ferias: [],
    pessoas,
    terceirizados: [{ ...serveBem, ativo: false }],
  }).celulas.get(3)![2].terceirizadoId,
  null,
);

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
