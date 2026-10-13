import { formatMoney } from "@/lib/format";
import { CANAIS_DE_VENDA, UNIDADES_DE_VENDA } from "@/lib/receituario-regras";
import type { ItemDeVenda } from "@/lib/receituario-vendas";

import { Folha } from "./folha";

/**
 * A lista de preços do balcão em PDF, como `/imprimir/receituario/precos`:
 * só o nome e o preço, sem custo, um bloco por canal. `itens` já vem
 * filtrado (ativos, com preço, do canal pedido).
 */
export async function precosEmPdf(itens: ItemDeVenda[], canal: string | undefined, hoje: string): Promise<Buffer> {
  const folha = new Folha({ titulo: "Lista de preços", margem: 36 });
  folha.nome = "Lista de preços";

  folha.doc.font("Helvetica").fontSize(10).text(hoje, folha.x, folha.y + 8, { width: folha.largura, align: "right" });
  folha.texto("Lista de preços", { tamanho: 20, negrito: true });
  folha.y += 4;
  folha.linha({ espessura: 1.5 });
  folha.y += 10;

  if (itens.length === 0) folha.texto("Nenhum item com preço na lista.", { tamanho: 11 });

  for (const c of CANAIS_DE_VENDA.filter((x) => !canal || x.chave === canal)) {
    const doCanal = itens.filter((i) => i.canal === c.chave);
    if (doCanal.length === 0) continue;
    folha.cabe(50);
    folha.texto(c.nome, { tamanho: 14, negrito: true, antes: 6 });
    folha.y += 3;
    for (const i of doCanal) {
      folha.linhaComValor({ nome: i.nome, valor: `${formatMoney(i.precoVenda!)}${UNIDADES_DE_VENDA.find((u) => u.chave === i.unidadeVenda)?.curto ?? ""}`, tamanho: 11 });
    }
    folha.y += 10;
  }

  return folha.terminar();
}
