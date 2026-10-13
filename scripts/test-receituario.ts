import { casarIngredientes, extrairJson, lerReceita } from "../lib/receituario-importar";
import { documentoDoAssistente, textoDoPadrao } from "../lib/receituario-padrao";
import { CATEGORIAS, cmvDaVenda, corDaCategoria, coresDasCategorias, custoDoInsumo, custosDasFichas, custosDasVendas, fatorDaUnidadeDeCompras, PALETA, precosSugeridos, unidade, type CustoDaFicha, type CustoDoInsumo, type FichaParaCusto, type Unidade } from "../lib/receituario-regras";
import { sugerirEtiqueta } from "../lib/etiquetas-sugeridas";

/** As contas do Receituário, sem banco: insumo, ficha com pré-preparo e preço sugerido. */

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
const r4 = (n: number | null) => (n === null ? null : Math.round(n * 10000) / 10000);

igual("unidade: ml vira mL", unidade("ml"), "mL");
igual("unidade: desconhecida vira nulo", unidade("xícara"), null);
igual("kg em g", fatorDaUnidadeDeCompras("KG", "g"), 1000);
igual("caixa não converte", fatorDaUnidadeDeCompras("CX", "g"), null);
igual("kg não vira mL", fatorDaUnidadeDeCompras("KG", "mL"), null);

// Arroz da planilha: R$ 3,39/kg, rendimento 100%.
const arroz = custoDoInsumo({ unidadeUso: "g", precoCompra: 3.39, qtdPorUnidade: 1000, rendimento: 1 });
igual("digitado: R$/g", [r4(arroz.liquido), arroz.origem], [0.0034, "digitado"]);
// Abacaxi: R$ 4,67/kg, rende 50% → o líquido dobra.
igual("FC dobra o líquido", r4(custoDoInsumo({ unidadeUso: "g", precoCompra: 4.67, qtdPorUnidade: 1000, rendimento: 0.5 }).liquido), 0.0093);
const em = "2026-09-12T00:00:00.000Z";
const comCompra = custoDoInsumo({ unidadeUso: "g", precoCompra: 3.39, qtdPorUnidade: 1000, rendimento: 1, produto: { unidade: "KG", ultimoCusto: { valor: 4, em } } });
igual("compra vence o digitado", [r4(comCompra.liquido), comCompra.origem], [0.004, "compra"]);
const caixa = custoDoInsumo({ unidadeUso: "g", precoCompra: 3.39, qtdPorUnidade: 1000, rendimento: 1, produto: { unidade: "CX", ultimoCusto: { valor: 90, em } } });
igual("compra em caixa cai no digitado", caixa.origem, "digitado");
igual("sem preço nenhum", custoDoInsumo({ unidadeUso: "g", precoCompra: null, qtdPorUnidade: 1000, rendimento: 1 }).origem, null);

// A ficha 264C Arroz Branco da planilha: total R$ 2,1809, perda 17,5%.
const ins = new Map([
  [1, { ...custoDoInsumo({ unidadeUso: "g", precoCompra: 3.39, qtdPorUnidade: 1000, rendimento: 1 }), unidadeUso: "g" as const }],
  [2, { ...custoDoInsumo({ unidadeUso: "mL", precoCompra: 7.1, qtdPorUnidade: 1000, rendimento: 1 }), unidadeUso: "mL" as const }],
  [3, { ...custoDoInsumo({ unidadeUso: "g", precoCompra: 17, qtdPorUnidade: 1000, rendimento: 1 }), unidadeUso: "g" as const }],
  [4, { ...custoDoInsumo({ unidadeUso: "g", precoCompra: 1.79, qtdPorUnidade: 1000, rendimento: 1 }), unidadeUso: "g" as const }],
  [5, { ...custoDoInsumo({ unidadeUso: "g", precoCompra: null, qtdPorUnidade: 1000, rendimento: 1 }), unidadeUso: "g" as const }],
]);
const l = (insumoId: number | null, quantidade: number, u: "g" | "mL" | null, subFichaId: number | null = null) => ({ insumoId, quantidade, unidade: u, subFichaId });
const fichas: FichaParaCusto[] = [
  { id: 10, porcoes: 10, rendimentoTotal: 1200, custoManualPorcao: null, ingredientes: [l(1, 500, "g"), l(null, 900, null), l(2, 30, "mL"), l(3, 15, "g"), l(4, 10, "g")] },
  // Usa 600 g do arroz pronto (metade) e um insumo sem preço.
  { id: 20, porcoes: 2, rendimentoTotal: 600, custoManualPorcao: null, ingredientes: [l(null, 600, "g", 10), l(5, 50, "g")] },
  // Laço: 30 chama 31, 31 chama 30.
  { id: 30, porcoes: 1, rendimentoTotal: 100, custoManualPorcao: null, ingredientes: [l(null, 50, "g", 31), l(1, 100, "g")] },
  { id: 31, porcoes: 1, rendimentoTotal: 100, custoManualPorcao: null, ingredientes: [l(null, 50, "g", 30)] },
  // Receita de evento sem ingredientes: custo por porção digitado.
  { id: 40, porcoes: 4, rendimentoTotal: null, custoManualPorcao: 2.5, ingredientes: [] },
];
const c = custosDasFichas(fichas, ins);
const arrozBranco = c.get(10)!;
igual("264C: total igual à planilha", r4(arrozBranco.total), 2.1809);
igual("264C: por porção e por kg", [r4(arrozBranco.porPorcao), r4(arrozBranco.porKg)], [0.2181, 1.8174]);
igual("264C: perda 17,5%", r4(arrozBranco.perda), 0.1753);
igual("água não é alerta", arrozBranco.semPreco, 0);
const usa = c.get(20)!;
igual("pré-preparo entra pelo custo por grama", r4(usa.total), r4(2.1809 / 2));
igual("insumo sem preço vira alerta", usa.semPreco, 1);
igual("laço não trava: a linha do laço fica sem preço", [c.get(30)!.semPreco + c.get(31)!.semPreco >= 1, r4(c.get(30)!.total)], [true, 0.339]);
igual("custo manual por porção", [c.get(40)!.total, c.get(40)!.porPorcao], [10, 2.5]);
igual("preço sugerido: 30% e markup 3", precosSugeridos(6, 0.3, 3), { minimo: 20, markup: 18 });

// Etiqueta sugerida: o nome manda; depois o modo do forno.
const sug = (nome: string, modoForno: string | null, temperatura: string | null = null, umidade: string | null = null) =>
  sugerirEtiqueta({ nome, modoForno, temperatura, umidade }).etiqueta;
igual("nome grelhado", sug("Frango grelhado", "Ar seco", "200 °C"), "Grelhado");
igual("nome arroz", sug("Arroz Branco", "Combinado", "200 °C"), "Cozido");
igual("nome frito", sug("Polenta frita", "Fritadeira (apoio)"), "Outros");
igual("vapor", sug("Brócolis", "Vapor", "100 °C", "100%"), "Cozido");
igual("vapor e depois ar seco", sug("Batata", "Vapor + Ar seco", "100 °C", "100%"), "Cozido");
igual("ar seco quente", sug("Pernil", "Ar seco", "180 °C", "0%"), "Assado");
igual("combinado úmido e baixo", sug("Peixe", "Combinado", "120 °C", "80%"), "Cozido");
igual("combinado alto", sug("Costela", "Combinado", "200 → 180 °C", "20%"), "Assado");
igual("chapa", sug("Bife", "Chapa (apoio)"), "Grelhado");
igual("fogão", sug("Feijoada leve", "Fogão (apoio)"), "Cozido");
igual("sem forno", sug("Salada verde", null), "Outros");
igual("ao molho não é o molho", sug("Bife ao Molho Madeira", "Ar seco", "200 °C", "0%"), "Assado");
igual("molho é cozido", sug("Molho de tomate", "Fogão (apoio)"), "Cozido");
igual("lentilha é cozida mesmo no ar seco", sug("Lentilha", "Ar seco", "200 °C", "0%"), "Cozido");

// As cores das categorias: o padrão, a escolha por cima e o que não vale.
const padrao = coresDasCategorias({});
igual("toda categoria tem cor da paleta", CATEGORIAS.every((c) => PALETA.some((p) => p.hex === padrao[c.nome])), true);
igual("Entrada tem cor (não é mais cinza)", corDaCategoria("Entrada", padrao), "#0f766e");
igual("escolha vai por cima do padrão", coresDasCategorias({ Salada: "rosa" }).Salada, "#c2185b");
igual("cor fora da paleta fica no padrão", coresDasCategorias({ Salada: "#ff0000" }).Salada, padrao.Salada);
igual("config vazia (nulo) dá o padrão", coresDasCategorias(null), padrao);
igual("categoria desconhecida fica cinza", corDaCategoria("Lanche", padrao), "#6b7280");
igual("são 10 cores na paleta", new Set(PALETA.map((p) => p.hex)).size, 10);

// A venda fora do buffet: receita pronta × custo por g, mais os extras.
{
  // Maionese: R$ 20 de custo para 1000 g prontos (R$ 0,02 por g).
  const fichas = new Map<number, CustoDaFicha>([
    [1, { total: 20, porPorcao: 2, porUnidade: 0.02, porKg: 20, perda: 0, semPreco: 0, linhas: [] }],
    [2, { total: 10, porPorcao: null, porUnidade: null, porKg: null, perda: null, semPreco: 0, linhas: [] }],
  ]);
  const insumos = new Map<number, CustoDoInsumo & { unidadeUso: Unidade }>([
    [10, { bruto: 1.5, liquido: 1.5, origem: "digitado", em: null, unidadeUso: "un" }], // pote
    [11, { bruto: 0.4, liquido: 0.4, origem: "digitado", em: null, unidadeUso: "un" }], // sacola
    [12, { bruto: null, liquido: null, origem: null, em: null, unidadeUso: "un" }], // lacre sem preço
  ]);
  const c = custosDasVendas(
    [
      { id: 1, fichaId: 1, quantidade: 500, baseId: null, extras: [{ insumoId: 10, subFichaId: null, quantidade: 1 }] },
      { id: 2, fichaId: 1, quantidade: 500, baseId: 1, extras: [{ insumoId: 11, subFichaId: null, quantidade: 1 }, { insumoId: 12, subFichaId: null, quantidade: 1 }] },
      { id: 3, fichaId: 2, quantidade: 1, baseId: null, extras: [] },
      { id: 4, fichaId: 1, quantidade: 1000, baseId: 5, extras: [] },
      { id: 5, fichaId: 1, quantidade: 1000, baseId: 4, extras: [] },
      { id: 6, fichaId: 1, quantidade: 1000, baseId: null, extras: [{ insumoId: null, subFichaId: 1, quantidade: 100 }] },
    ],
    fichas,
    insumos,
  );
  const perto = (a: number | null | undefined, b: number) => a !== null && a !== undefined && Math.abs(a - b) < 1e-9;
  igual("pote de 500 g: R$ 10 de maionese + R$ 1,50 do pote", perto(c.get(1)?.total, 11.5), true);
  igual("delivery parte da encomenda e soma a sacola", perto(c.get(2)?.total, 11.9), true);
  igual("extra sem preço conta como sem preço", c.get(2)?.semPreco, 1);
  igual("ficha sem peso pronto: custo nulo", c.get(3)?.total, null);
  igual("base em laço não trava", c.get(4)?.total === null || c.get(5)?.total === null, true);
  igual("guarnição de outra ficha entra pelo custo por g", perto(c.get(6)?.extras, 2), true);
  igual("CMV de R$ 11,50 vendido a R$ 30", perto(cmvDaVenda(11.5, 30), 11.5 / 30), true);
  igual("sem preço de venda, sem CMV", cmvDaVenda(11.5, null), null);
}

// A receita feita por IA: achar o JSON, conferir e ligar aos insumos.
{
  const resposta = `Claro! Aqui está a receita:
\`\`\`json
{
  "formato": "ponto07-receita-1",
  "nome": "Arroz — de forno",
  "categoria": "acompanhamento",
  "tipo": "PRONTA",
  "operacoes": ["buffet", "Eventos", "inventada"],
  "porcoes": 20,
  "rendimento": { "quantidade": 3, "unidade": "kg" },
  "ingredientes": [
    { "nome": "Arroz agulhinha tipo 1", "quantidade": 1.2, "unidade": "kg", "preparo": "lavado" },
    { "nome": "Caldo de legumes", "quantidade": 2, "unidade": "L", "ficha": "900B" },
    { "nome": "Cebola roxa", "quantidade": 200, "unidade": "g" },
    { "nome": "OVO", "quantidade": 4, "unidade": "un" }
  ],
  "passos": ["Refogar a cebola — sem dourar.", ""],
  "forno": { "modo": "Combinado", "temperatura": "180 °C" }
}
\`\`\`
Bom apetite!`;
  igual("acha o bloco json no meio do texto", extrairJson(resposta)?.startsWith("{"), true);
  igual("sem bloco, acha o primeiro { }", extrairJson('a {"x": 1} b'), '{"x": 1}');
  const r = lerReceita(resposta);
  igual("lê a resposta", r.ok, true);
  if (r.ok) {
    igual("categoria sem maiúscula vira a da casa", r.receita.categoria, "Acompanhamento");
    igual("operações da casa, sem a inventada", r.receita.operacoes, ["BUFFET", "EVENTOS"]);
    igual("rendimento em kg vira g", r.receita.rendimento, { quantidade: 3000, unidade: "g" });
    igual("kg do ingrediente vira g", r.receita.ingredientes[0].quantidade, 1200);
    igual("L vira mL", [r.receita.ingredientes[1].quantidade, r.receita.ingredientes[1].unidade], [2000, "mL"]);
    igual("travessão sai do nome e dos passos", [r.receita.nome, r.receita.passos], ["Arroz, de forno", ["Refogar a cebola, sem dourar."]]);
    const linhas = casarIngredientes(
      r.receita.ingredientes,
      [
        { id: 1, nome: "Arroz agulhinha tipo 1", unidade: "g" },
        { id: 2, nome: "Cebola", unidade: "g" },
        { id: 3, nome: "Cebola branca", unidade: "g" },
        { id: 4, nome: "Ovo", unidade: "un" },
      ],
      [{ id: 9, nome: "Caldo de legumes da casa", unidade: "mL", codigo: "900B" }],
    );
    igual("casa pelo nome exato", linhas[0].insumoId, 1);
    igual("casa pela ficha do código", linhas[1].subFichaId, 9);
    igual("sem par fica sem escolha", [linhas[2].insumoId, linhas[2].subFichaId, linhas[2].rotulo], [null, null, "Cebola roxa"]);
    igual("sugere os parecidos", linhas[2].sugestoes.map((s) => s.nome), ["Cebola", "Cebola branca"]);
    igual("maiúscula não atrapalha", linhas[3].insumoId, 4);
  }
  const ruim = lerReceita('{"nome": "X de teste", "categoria": "Massa", "porcoes": 2, "ingredientes": [{"nome": "Leite", "quantidade": 1, "unidade": "xícara"}]}');
  igual("unidade inválida diz onde", ruim.ok ? [] : ruim.erros, ['ingredientes 1: unidade "xícara" não vale; use g, mL ou un']);
  igual("categoria inventada recusa", lerReceita('{"nome": "Y", "categoria": "Lanche", "porcoes": 1, "ingredientes": [{"nome": "a", "quantidade": 1, "unidade": "g"}]}').ok, false);
  igual("JSON quebrado avisa", lerReceita("{ nome: ").ok, false);
  // O exemplo do próprio padrão tem de importar: é ele que a IA copia.
  const doPadrao = lerReceita(textoDoPadrao());
  igual("o exemplo do padrão importa", doPadrao.ok ? doPadrao.receita.nome : doPadrao.erros, "Frango assado com ervas");
  igual("o padrão é curto", textoDoPadrao().split("\n").length < 50, true);
  const doc = documentoDoAssistente([{ nome: "Alho", unidadeUso: "g" }]);
  igual("o documento leva instruções, padrão e insumos", [doc.includes("# Instruções"), doc.includes("```json"), doc.includes("- Alho (g)")], [true, true, true]);
  igual("o documento começa pela regra de geração", doc.startsWith("## Regra de Geração da Ficha Técnica\n"), true);
  igual("o documento também importa (o exemplo do padrão)", lerReceita(doc).ok, true);
}

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
