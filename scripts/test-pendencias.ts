import { divergenciaDoItem, type ItemConferido } from "../lib/pendencias";

/**
 * A regra de "chegou diferente do combinado", sem banco.
 *
 *   npx tsx --env-file=.env scripts/test-pendencias.ts
 */

let falhas = 0;
function check(rotulo: string, ok: boolean, extra?: unknown) {
  if (!ok) falhas += 1;
  console.log(`${ok ? "ok  " : "FALHA"} ${rotulo}${!ok && extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`);
}
const item = (x: Partial<ItemConferido>): ItemConferido => ({
  quantidadeSolicitada: 10,
  quantidadeRecebida: 10,
  precoUnitario: 5,
  precoPago: 5,
  problema: null,
  ...x,
});

check("veio certo: sem divergência", divergenciaDoItem(item({})) === null);
check("um centavo de arredondamento não conta", divergenciaDoItem(item({ precoPago: 5.004 })) === null);

const menos = divergenciaDoItem(item({ quantidadeRecebida: 8 }));
check("veio a menos: faltou 2, R$ 10 não veio", menos?.faltou === 2 && menos.valorQueFaltou === 10, menos);

const naoVeio = divergenciaDoItem(item({ quantidadeRecebida: null }));
check("ninguém tocou (nulo) = não veio nada", naoVeio?.faltou === 10 && naoVeio.valorQueFaltou === 50, naoVeio);

const mais = divergenciaDoItem(item({ quantidadeRecebida: 12 }));
check("veio a mais: sobrou 2", mais?.sobrou === 2 && mais.faltou === 0, mais);

const caro = divergenciaDoItem(item({ precoPago: 5.4 }));
check("pagou mais caro: R$ 4 a mais em 10", caro !== null && Math.abs(caro.pagoAMais - 4) < 0.001 && Math.abs(caro.diferencaPreco - 0.4) < 0.001, caro);

const barato = divergenciaDoItem(item({ precoPago: 4.5 }));
check("pagou mais barato também aparece (negativo)", barato !== null && barato.pagoAMais < 0, barato);

const avaria = divergenciaDoItem(item({ problema: "AVARIA" }));
check("problema marcado, mesmo com tudo igual", avaria?.problema === "AVARIA", avaria);

check("sem preço combinado, o preço não conta", divergenciaDoItem(item({ precoUnitario: null, precoPago: 7 })) === null);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
