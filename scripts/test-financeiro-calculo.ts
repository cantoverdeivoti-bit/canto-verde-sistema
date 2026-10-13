import {
  diferencaDaConciliacao,
  sugestoesParaLinha,
  agruparPorSemana,
  csvDasPartidas,
  emLotes,
  movimentoNaConta,
  partidasDoMes,
  custoDosEncargos,
  diaDoMes,
  dividirEmParcelas,
  fluxoDeCaixa,
  lancamentosDoFechamento,
  mesesDaRecorrencia,
  montarDre,
  motivoParaNaoFecharMes,
  moverNaOrdem,
  pontoMaisBaixo,
  saldoDaConta,
  situacaoDe,
  somar,
  somarMeses,
  travaDoFechamentoDoDia,
  valorLiquido,
  vencimentoDaParcela,
} from "../lib/financeiro-calculo";
import { detectarTipo, nomeDoAnexo } from "../lib/anexos";

/**
 * As contas do módulo Financeiro, sem banco: `npx tsx scripts/test-financeiro-calculo.ts`.
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

// --- datas -------------------------------------------------------------------
igual("soma sem erro de ponto flutuante", somar([0.1, 0.2]), 0.3);
igual("mês seguinte vira o ano", somarMeses("2026-12", 1), "2027-01");
igual("mês anterior volta o ano", somarMeses("2027-01", -1), "2026-12");
igual("dia 31 em fevereiro cai no último dia", diaDoMes("2027-02", 31), "2027-02-28");
igual("dia 31 em fevereiro bissexto", diaDoMes("2028-02", 31), "2028-02-29");

// --- lançamento ----------------------------------------------------------------
igual("líquido com taxa, juros e desconto", valorLiquido({ valor: 100, taxa: 3.1, jurosMulta: 2, desconto: 0.5 }), 98.4);
igual("situação: aberto no passado é vencido", situacaoDe({ status: "ABERTO", vencimento: "2026-10-01" }, "2026-10-06"), "vencido");
igual("situação: vence hoje", situacaoDe({ status: "ABERTO", vencimento: "2026-10-06" }, "2026-10-06"), "hoje");
igual("situação: pago no passado é pago", situacaoDe({ status: "PAGO", vencimento: "2026-10-01" }, "2026-10-06"), "pago");

const parcelas = dividirEmParcelas(100, 3);
igual("três parcelas de 100", parcelas, [33.34, 33.33, 33.33]);
igual("parcelas somam o total", somar(parcelas), 100);
igual("parcela no mês seguinte, mesmo dia", vencimentoDaParcela("2026-01-31", 1), "2026-02-28");
igual("terceira parcela", vencimentoDaParcela("2026-01-31", 2), "2026-03-31");

// --- recorrência ---------------------------------------------------------------
igual(
  "recorrência dentro da janela",
  mesesDaRecorrencia({ diaVencimento: 10, inicio: "2026-09-01", fim: null }, "2026-10", "2026-11"),
  ["2026-10", "2026-11"],
);
igual(
  "recorrência que começa no mês que vem",
  mesesDaRecorrencia({ diaVencimento: 10, inicio: "2026-11-01", fim: null }, "2026-10", "2026-11"),
  ["2026-11"],
);
igual(
  "recorrência que já acabou",
  mesesDaRecorrencia({ diaVencimento: 10, inicio: "2026-01-01", fim: "2026-09-01" }, "2026-10", "2026-11"),
  [],
);

// --- fechamento do dia ---------------------------------------------------------
const gerados = lancamentosDoFechamento(
  {
    data: "2026-10-06",
    taxaServico: 110,
    itens: [
      { formaId: 1, nome: "Dinheiro", taxaPct: 0, prazoDias: 0, contaId: 1, valorBruto: 210 },
      { formaId: 2, nome: "Crédito", taxaPct: 3.1, prazoDias: 30, contaId: 2, valorBruto: 1000 },
      { formaId: 3, nome: "Débito", taxaPct: 1.5, prazoDias: 1, contaId: 2, valorBruto: 0 },
    ],
  },
  { vendas: "V", repasse: "R" },
);
igual("forma sem valor não gera lançamento", gerados.length, 3);
igual("dinheiro nasce recebido", [gerados[0].pagoEm, gerados[0].valorPago], ["2026-10-06", 210]);
igual("crédito: taxa e vencimento pelo prazo", [gerados[1].taxa, gerados[1].vencimento, gerados[1].pagoEm], [31, "2026-11-05", null]);
igual("competência é o mês da venda", gerados[1].competencia, "2026-10-01");
igual("taxa de serviço vira repasse a pagar", [gerados[2].tipo, gerados[2].chaveCategoria, gerados[2].valor], ["PAGAR", "R", 110]);

// --- DRE -----------------------------------------------------------------------
// Os mesmos lançamentos de antes dos subgrupos: os totais têm de bater, só a
// taxa de cartão muda de linha (sai de Impostos, vai para Taxas de cartão e apps).
const dre = montarDre(
  [
    { grupo: "RECEITA_VENDAS", tipo: "RECEBER", subgrupo: "Salão", categoria: "Vendas do salão", valor: 11000 },
    { grupo: "TAXA_SERVICO", tipo: "PAGAR", subgrupo: "Taxa de serviço", categoria: "Repasse", valor: 1000 },
    { grupo: "IMPOSTOS", tipo: "PAGAR", subgrupo: "Impostos sobre vendas", categoria: "DAS", valor: 600 },
    { grupo: "CMV", tipo: "PAGAR", subgrupo: "Alimentos", categoria: "Insumos", valor: 2000 },
    { grupo: "CMV", tipo: "PAGAR", subgrupo: "Alimentos", categoria: "Carnes", valor: 600 },
    { grupo: "CMV", tipo: "PAGAR", subgrupo: "Bebidas", categoria: "Bebidas", valor: 400 },
    { grupo: "PESSOAL", tipo: "PAGAR", subgrupo: "Salários e encargos", categoria: "Salários", valor: 2500 },
    { grupo: "OCUPACAO", tipo: "PAGAR", subgrupo: "Imóvel", categoria: "Aluguel", valor: 1500 },
    { grupo: "FINANCEIRO", tipo: "RECEBER", subgrupo: "Receitas financeiras", categoria: "Rendimentos", valor: 50 },
    { grupo: "FORA_DO_RESULTADO", tipo: "PAGAR", subgrupo: "Sócios", categoria: "Retirada", valor: 800 },
  ],
  200,
  10,
);
const linha = (chave: string) => dre.linhas.find((l) => l.chave === chave)!;
igual("receita bruta tira a taxa de serviço", dre.receitaBruta, 10000);
igual("impostos sem a taxa de cartão", linha("IMPOSTOS").valor, -600);
igual("taxa do recebível vai para Taxas de cartão e apps", linha("TAXAS_E_APPS").valor, -200);
igual("taxa do recebível cai no subgrupo Cartões", linha("TAXAS_E_APPS").subgrupos.map((x) => x.nome), ["Cartões"]);
igual("receita líquida tira imposto e taxa de cartão", linha("receitaLiquida").valor, 9200);
igual("Taxas de cartão e apps vem antes da receita líquida", dre.linhas.map((l) => l.chave).indexOf("TAXAS_E_APPS") < dre.linhas.map((l) => l.chave).indexOf("receitaLiquida"), true);
igual("lucro bruto", linha("lucroBruto").valor, 6200);
igual("CMV em % da receita bruta", linha("CMV").pct, -30);
igual("CMV abre em subgrupos, o maior primeiro", linha("CMV").subgrupos.map((x) => [x.nome, x.valor]), [["Alimentos", -2600], ["Bebidas", -400]]);
igual("subgrupo abre em categorias", linha("CMV").subgrupos[0].categorias.map((c) => c.nome), ["Insumos", "Carnes"]);
igual("lista plana de categorias leva o subgrupo", linha("CMV").categorias.find((c) => c.nome === "Bebidas")?.subgrupo, "Bebidas");
igual("resultado operacional", linha("operacional").valor, 2200);
igual("financeiro: rendimento menos juros", linha("FINANCEIRO").valor, 40);
igual("resultado do mês", dre.resultado, 2240);
igual("retirada fica fora do resultado", dre.foraDoResultado.valor, -800);
igual("DRE sem receita não tem %", montarDre([], 0, 0).linhas[0].pct, null);
const comTaxaManual = montarDre([{ grupo: "TAXAS_E_APPS", tipo: "PAGAR", subgrupo: "Cartões", categoria: "Taxas de cartão", valor: 50 }], 20, 0);
igual(
  "taxa lançada à mão soma com a do recebível numa linha só",
  comTaxaManual.linhas.find((l) => l.chave === "TAXAS_E_APPS")!.categorias,
  [{ subgrupo: "Cartões", nome: "Taxas de cartão", valor: -70, pct: null }],
);
const comTaxaMovida = montarDre([{ grupo: "TAXAS_E_APPS", tipo: "PAGAR", subgrupo: "Maquininhas", categoria: "Taxas de cartão", valor: 50 }], 20, 0, "Maquininhas");
igual("taxa do recebível acompanha o subgrupo para onde a categoria foi", comTaxaMovida.linhas.find((l) => l.chave === "TAXAS_E_APPS")!.subgrupos.map((x) => [x.nome, x.valor]), [["Maquininhas", -70]]);
const comOutras = montarDre(
  [
    { grupo: "RECEITA_VENDAS", tipo: "RECEBER", subgrupo: "Salão", categoria: "Vendas", valor: 1000 },
    { grupo: "OUTRAS_RECEITAS", tipo: "RECEBER", subgrupo: "Outras receitas", categoria: "Rolha", valor: 100 },
  ],
  0,
  0,
);
igual("outras receitas entram na receita bruta", comOutras.receitaBruta, 1100);
igual("comissão de app é linha própria, não imposto", montarDre([{ grupo: "TAXAS_E_APPS", tipo: "PAGAR", subgrupo: "Apps de delivery", categoria: "Comissão de apps", valor: 230 }], 0, 0).linhas.find((l) => l.chave === "IMPOSTOS")!.valor, 0);

// ---- Ordem no plano de contas ----
igual("subir o segundo", moverNaOrdem([1, 2, 3], 2, -1), [2, 1, 3]);
igual("descer o primeiro", moverNaOrdem([1, 2, 3], 1, 1), [2, 1, 3]);
igual("subir o primeiro não muda", moverNaOrdem([1, 2, 3], 1, -1), [1, 2, 3]);
igual("descer o último não muda", moverNaOrdem([1, 2, 3], 3, 1), [1, 2, 3]);
igual("id que não está na lista não muda", moverNaOrdem([1, 2], 9, 1), [1, 2]);

igual(
  "encargos: juros pago é custo, desconto recebido é ganho",
  custoDosEncargos([
    { tipo: "PAGAR", jurosMulta: 12, desconto: 0 },
    { tipo: "PAGAR", jurosMulta: 0, desconto: 5 },
    { tipo: "RECEBER", jurosMulta: 3, desconto: 0 },
  ]),
  4,
);

// --- saldo e fluxo -------------------------------------------------------------
igual(
  "saldo da conta",
  saldoDaConta({ saldoInicial: 500, recebido: 1200.1, pago: 300.2, transferidoPara: 100, transferidoDe: 50 }),
  1449.9,
);

const fluxo = fluxoDeCaixa({
  saldoAntes: 1000,
  de: "2026-10-05",
  ate: "2026-10-08",
  hoje: "2026-10-06",
  realizados: [
    { data: "2026-10-05", valor: 300 },
    { data: "2026-10-06", valor: -100 },
    { data: "2026-10-04", valor: 9999 },
  ],
  previstos: [
    { data: "2026-10-01", valor: -200 },
    { data: "2026-10-08", valor: 500 },
  ],
});
igual("fluxo: um dia por linha", fluxo.length, 4);
igual("fluxo: realizado fora do período fica de fora", fluxo[0].saldo, 1300);
igual("fluxo: vencido em aberto entra hoje", [fluxo[1].entradas, fluxo[1].saidas, fluxo[1].saldo], [0, 300, 1000]);
igual("fluxo: amanhã é previsão", fluxo[2].previsto, true);
igual("fluxo: saldo projetado", fluxo[3].saldo, 1500);
igual("ponto mais baixo", pontoMaisBaixo(fluxo)?.data, "2026-10-06");
igual("semana agrupa os dias", agruparPorSemana(fluxo).map((s) => [s.entradas, s.saidas, s.saldo]), [[800, 300, 1500]]);

// --- partidas para o contador -------------------------------------------------
const codigos = { taxas: "4.2.03", juros: "5.1.02", descontos: "3.9.01" };
const partidas = partidasDoMes(
  [
    // Luz paga com juros e desconto: o banco mexe 450 + 4,70 - 2 = 452,70.
    { data: "2026-10-08", tipo: "PAGAR", valor: 450, taxa: 0, jurosMulta: 4.7, desconto: 2, codigoCategoria: "4.3.02", codigoConta: "1.1.1.02", historico: "Luz", documento: "123" },
    // Crédito de 1000 com taxa de 31,90: o banco recebe 968,10.
    { data: "2026-10-05", tipo: "RECEBER", valor: 1000, taxa: 31.9, jurosMulta: 0, desconto: 0, codigoCategoria: "3.1.01", codigoConta: "1.1.1.02", historico: "Crédito; vendas", documento: null },
  ],
  [{ data: "2026-10-09", valor: 100, codigoOrigem: "1.1.1.01", codigoDestino: "1.1.1.02", historico: "Depósito" }],
  codigos,
);
igual("partidas: uma linha por par débito/crédito", partidas.length, 6);
igual("partidas em ordem de data", partidas[0].data, "2026-10-05");
igual("banco mexe o líquido das baixas mais a transferência", movimentoNaConta(partidas, "1.1.1.02"), 615.4);
igual("taxa da maquininha vai para a conta de taxas", movimentoNaConta(partidas, "4.2.03"), 31.9);
igual("venda credita o bruto", movimentoNaConta(partidas, "3.1.01"), -1000);
const codigosUsados = [...new Set(partidas.flatMap((p) => [p.debito, p.credito]))];
igual("partidas fecham: a soma dos movimentos de todas as contas é zero", somar(codigosUsados.map((c) => movimentoNaConta(partidas, c))), 0);
const csv = csvDasPartidas(partidas);
igual("CSV começa com BOM e cabeçalho", csv.startsWith("\uFEFFData;Débito;Crédito;Valor"), true);
igual("CSV: vírgula decimal e data brasileira", csv.split("\r\n")[1], '05/10/2026;1.1.1.02;3.1.01;1000,00;"Crédito; vendas";');
igual("lotes respeitam o limite", emLotes([{ tamanho: 3 }, { tamanho: 2 }, { tamanho: 2 }, { tamanho: 5 }], 4).map((l) => l.length), [1, 2, 1]);

// --- conciliação ---------------------------------------------------------------
const candidatos = [
  { id: 1, tipo: "PAGAR" as const, status: "PAGO" as const, contaId: 2, data: "2026-10-05", valor: 450.3, descricao: "Luz" },
  { id: 2, tipo: "PAGAR" as const, status: "ABERTO" as const, contaId: null, data: "2026-10-08", valor: 450.3, descricao: "Outra de 450,30" },
  { id: 3, tipo: "PAGAR" as const, status: "PAGO" as const, contaId: 1, data: "2026-10-06", valor: 450.3, descricao: "Paga em outra conta" },
  { id: 4, tipo: "RECEBER" as const, status: "ABERTO" as const, contaId: 2, data: "2026-10-07", valor: 300, descricao: "Débito" },
  { id: 5, tipo: "RECEBER" as const, status: "ABERTO" as const, contaId: 2, data: "2026-10-07", valor: 668.1, descricao: "Crédito" },
  { id: 6, tipo: "RECEBER" as const, status: "ABERTO" as const, contaId: 2, data: "2026-10-30", valor: 968.1, descricao: "Longe demais" },
];
const s1 = sugestoesParaLinha({ data: "2026-10-06", valor: -450.3, contaId: 2 }, candidatos, []);
igual("pago na conta vem antes do aberto", s1.map((x) => [x.tipo, x.lancamentos]), [["pago", [1]], ["aberto", [2]]]);
igual("pago em outra conta não é sugerido", s1.some((x) => x.lancamentos.includes(3)), false);
const s2 = sugestoesParaLinha({ data: "2026-10-07", valor: 968.1, contaId: 2 }, candidatos, []);
igual("lote da maquininha soma o depósito", s2.map((x) => [x.tipo, x.lancamentos]), [["lote", [4, 5]]]);
const s3 = sugestoesParaLinha({ data: "2026-10-09", valor: 100, contaId: 2 }, [], [{ id: 9, data: "2026-10-09", valor: 100, origemId: 1, destinoId: 2 }]);
igual("transferência que entra nesta conta", s3.map((x) => x.transferenciaId), [9]);
igual("transferência que sai de outra conta não serve para saída daqui", sugestoesParaLinha({ data: "2026-10-09", valor: -100, contaId: 2 }, [], [{ id: 9, data: "2026-10-09", valor: 100, origemId: 1, destinoId: 2 }]).length, 0);
igual("diferença: extrato pagou juros", diferencaDaConciliacao(-454.99, [{ valor: 450.3 }]), 4.69);
igual("diferença zero", diferencaDaConciliacao(968.1, [{ valor: 300 }, { valor: 668.1 }]), 0);

// --- anexos -------------------------------------------------------------------
const b = (t: string) => new TextEncoder().encode(t);
igual("PDF pelos primeiros bytes", detectarTipo(b("%PDF-1.7 ..."))?.mime, "application/pdf");
igual("JPEG", detectarTipo(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]))?.extensao, ".jpg");
igual("XML da NF-e com BOM", detectarTipo(b('\uFEFF<?xml version="1.0"?><nfeProc>'))?.mime, "application/xml");
igual("HTML disfarçado é recusado", detectarTipo(b("<!DOCTYPE html><html><script>")), null);
igual("texto qualquer é recusado", detectarTipo(b("oi, tudo bem")), null);
igual("nome ganha a extensão do tipo de verdade", nomeDoAnexo("boleto: luz/set.PDF", { mime: "application/pdf", extensao: ".pdf" }), "boleto luz set.pdf");

// ---- Trava do fechamento do dia ----
const livre = { baixadoPorId: null, status: "PAGO", linhaExtratoId: null, anexos: 0 };
igual("fechamento sem conferência pode refazer", travaDoFechamentoDoDia([livre, { ...livre, status: "ABERTO" }]), null);
igual("dinheiro conciliado com o extrato trava", travaDoFechamentoDoDia([livre, { ...livre, linhaExtratoId: 7 }])?.includes("conciliada"), true);
igual("baixa à mão trava", travaDoFechamentoDoDia([{ ...livre, status: "ABERTO", baixadoPorId: 1 }])?.includes("baixas"), true);
igual("cancelado trava", travaDoFechamentoDoDia([{ ...livre, status: "CANCELADO" }]) !== null, true);
igual("anexo trava", travaDoFechamentoDoDia([{ ...livre, anexos: 1 }])?.includes("anexo"), true);
igual("dia sem lançamentos pode refazer", travaDoFechamentoDoDia([]), null);

// ---- Fechar o mês para o contador ----
igual("mês passado, nada fechado: pode", motivoParaNaoFecharMes("2026-09", "2026-10", []), null);
igual("mês corrente não fecha", motivoParaNaoFecharMes("2026-10", "2026-10", []) !== null, true);
igual("mês futuro não fecha", motivoParaNaoFecharMes("2026-11", "2026-10", []) !== null, true);
igual("em ordem: anterior fechado, pode", motivoParaNaoFecharMes("2026-09", "2026-10", ["2026-08"]), null);
igual("fora de ordem: pula agosto", motivoParaNaoFecharMes("2026-09", "2026-10", ["2026-07"]), "Feche antes 2026-08: os meses fecham em ordem.");
igual("virada do ano em ordem", motivoParaNaoFecharMes("2026-01", "2026-03", ["2025-12"]), null);
igual("fechar um mês antigo antes dos fechados: pode", motivoParaNaoFecharMes("2026-05", "2026-10", ["2026-08"]), null);

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
