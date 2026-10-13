import { pedidoPorExtenso, recadoDoPedido } from "../app/admin/compras/pedidos/texto-do-pedido";
import {
  bonificacaoPorExtenso,
  bonificacoesNoTexto,
  creditoCombinado,
  descontoNaNota,
  valorDaBonificacao,
  type BonificacaoParaMostrar,
} from "../lib/bonificacoes";
import { bonificacaoSchema, recebimentoSchema } from "../lib/validations";

/**
 * As regras da bonificação, sem banco: o texto que vai ao fornecedor, o
 * valor de cada tipo, o total a pagar com desconto na nota e a validação.
 *
 *   npx tsx scripts/test-bonificacao.ts
 */

let falhas = 0;
function check(rotulo: string, ok: boolean, extra?: unknown) {
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${rotulo}${!ok && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`);
}

const base = { nota: null, quantidadeRecebida: null, estado: "COMBINADA" as const };
const oleo: BonificacaoParaMostrar = {
  ...base,
  id: 1,
  tipo: "UNIDADES",
  produto: { nome: "Óleo de algodão", unidade: "CX" },
  quantidade: 1,
  valor: null,
};
const agua: BonificacaoParaMostrar = {
  ...base,
  id: 2,
  tipo: "BRINDE",
  produto: { nome: "Água mineral", unidade: "UN" },
  quantidade: 2,
  valor: null,
};
const desconto: BonificacaoParaMostrar = { ...base, id: 3, tipo: "DESCONTO_NA_NOTA", produto: null, quantidade: null, valor: 50 };
const credito: BonificacaoParaMostrar = { ...base, id: 4, tipo: "CREDITO", produto: null, quantidade: null, valor: 30 };

// --- Texto ------------------------------------------------------------------
{
  const t = (b: BonificacaoParaMostrar) => bonificacaoPorExtenso(b).replace(/ /g, " ");
  check("unidades a mais", t(oleo).startsWith("+ 1 ") && t(oleo).endsWith("de Óleo de algodão"), t(oleo));
  check("brinde", t(agua).startsWith("2 ") && t(agua).endsWith("de Água mineral (brinde)"), t(agua));
  check("desconto na nota", t(desconto) === "R$ 50,00 de desconto na nota", t(desconto));
  check("crédito", t(credito) === "R$ 30,00 de crédito para o próximo pedido", t(credito));
  check("sem bonificação, nada no texto", bonificacoesNoTexto([]).length === 0);
  check(
    "cancelada não vai no texto",
    bonificacoesNoTexto([{ ...oleo, estado: "CANCELADA" }]).length === 0,
  );
  const bloco = bonificacoesNoTexto([oleo, desconto]);
  check("bloco com título e uma linha por bonificação", bloco.length === 4 && bloco[1] === "Bonificação combinada:", bloco);
}

// --- Total a pagar ----------------------------------------------------------
{
  check("desconto soma só o desconto na nota", descontoNaNota([oleo, desconto, credito]) === 50);
  check("desconto que não veio não abate", descontoNaNota([{ ...desconto, estado: "NAO_VEIO" }]) === 0);
  check("desconto cancelado não abate", descontoNaNota([{ ...desconto, estado: "CANCELADA" }]) === 0);
  check("crédito combinado", creditoCombinado([desconto, credito]) === 30);

  const pedido = {
    total: 500,
    entregaPrevista: null,
    token: null,
    itens: [{ nome: "Óleo de algodão", unidade: "CX" as const, quantidade: 10, precoUnitario: 50 }],
    bonificacoes: [oleo, desconto, credito],
  };
  const texto = pedidoPorExtenso(pedido).replace(/ /g, " ");
  check("mensagem lista a bonificação", texto.includes("Bonificação combinada:") && texto.includes("de Óleo de algodão"), texto);
  check("mensagem mostra o total a pagar", texto.includes("Total: R$ 500,00 − R$ 50,00 de desconto = R$ 450,00"), texto);
  const semBonificacao = pedidoPorExtenso({ ...pedido, bonificacoes: [] }).replace(/ /g, " ");
  check("sem bonificação, total simples", /^Total: R\$ 500,00$/m.test(semBonificacao), semBonificacao);
  check("sem bonificação, sem o bloco", !semBonificacao.includes("Bonificação"), semBonificacao);
  const link = recadoDoPedido({ ...pedido, token: "abc" }, "https://x");
  check("recado com link também leva a bonificação", link.includes("/comprador/pedido/abc") && link.includes("Bonificação combinada:"), link);
}

// --- Valor ------------------------------------------------------------------
{
  check("mercadoria vale quantidade × custo", valorDaBonificacao(oleo, 120) === 120);
  check("mercadoria recebida vale o que veio", valorDaBonificacao({ ...oleo, quantidadeRecebida: 2 }, 120) === 240);
  check("mercadoria sem custo vale zero", valorDaBonificacao(oleo, null) === 0);
  check("brinde arredonda centavos", valorDaBonificacao({ ...agua, quantidade: 3 }, 1.333) === 4);
  check("dinheiro vale o combinado", valorDaBonificacao(desconto, 999) === 50);
}

// --- Validação --------------------------------------------------------------
{
  const ok = (v: unknown) => bonificacaoSchema.safeParse(v).success;
  const cot = { cotacaoId: 1, pedidoCompraId: null, fornecedorId: 2, nota: "" };
  check("unidades na cotação", ok({ ...cot, tipo: "UNIDADES", produtoId: 3, quantidade: 1, valor: undefined }));
  check("valor com vírgula", ok({ ...cot, tipo: "DESCONTO_NA_NOTA", produtoId: null, quantidade: undefined, valor: "50,00" }));
  check("mercadoria sem produto é recusada", !ok({ ...cot, tipo: "BRINDE", produtoId: null, quantidade: 1, valor: undefined }));
  check("mercadoria sem quantidade é recusada", !ok({ ...cot, tipo: "UNIDADES", produtoId: 3, quantidade: undefined, valor: undefined }));
  check("dinheiro sem valor é recusado", !ok({ ...cot, tipo: "CREDITO", produtoId: null, quantidade: undefined, valor: "" }));
  check("valor zero é recusado", !ok({ ...cot, tipo: "CREDITO", produtoId: null, quantidade: undefined, valor: "0" }));
  check(
    "cotação e pedido ao mesmo tempo é recusado",
    !ok({ ...cot, pedidoCompraId: 5, tipo: "CREDITO", produtoId: null, quantidade: undefined, valor: 10 }),
  );
  check(
    "nem cotação nem pedido é recusado",
    !ok({ ...cot, cotacaoId: null, tipo: "CREDITO", produtoId: null, quantidade: undefined, valor: 10 }),
  );
  check(
    "na cotação sem fornecedor é recusado",
    !ok({ ...cot, fornecedorId: null, tipo: "CREDITO", produtoId: null, quantidade: undefined, valor: 10 }),
  );
  check(
    "no pedido, sem fornecedor (vem do pedido)",
    ok({ cotacaoId: null, pedidoCompraId: 5, fornecedorId: null, nota: "", tipo: "CREDITO", produtoId: null, quantidade: undefined, valor: 10 }),
  );
  check("nota longa é recusada", !ok({ ...cot, nota: "x".repeat(301), tipo: "CREDITO", produtoId: null, quantidade: undefined, valor: 10 }));

  const item = { "1": { quantidade: 10 } };
  const rec = (b: unknown) => recebimentoSchema.safeParse({ itens: item, bonificacoes: b });
  check("recebimento sem bonificação", recebimentoSchema.safeParse({ itens: item }).success);
  check("bonificação veio com quantidade", rec({ "7": { veio: true, quantidade: 1 } }).success);
  check("bonificação não veio", rec({ "7": { veio: false } }).success);
  check("quantidade zero na bonificação é recusada", !rec({ "7": { veio: true, quantidade: 0 } }).success);
  check("quantidade absurda na bonificação é recusada", !rec({ "7": { veio: true, quantidade: 10_000_000 } }).success);
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
