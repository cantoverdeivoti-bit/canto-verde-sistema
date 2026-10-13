import { medida, receitas } from "@/lib/eventos-calculo";
import type { ProducaoDoEvento } from "@/lib/eventos-dados";

import { Folha } from "./folha";

/**
 * A ordem de produção do evento em PDF, para a cozinha, como
 * `/imprimir/eventos/producao/[id]`: os pratos (em receitas), os
 * pré-preparos somados e os insumos em peso bruto, que é o de comprar.
 */
export async function producaoDoEventoEmPdf(titulo: string, subtitulo: string, producao: ProducaoDoEvento | null): Promise<Buffer> {
  const folha = new Folha({ titulo: `Ordem de produção ${titulo}`, margem: 36 });
  folha.nome = `Ordem de produção · ${titulo}`;
  folha.texto(`Ordem de produção · ${titulo}`, { tamanho: 17, negrito: true });
  folha.texto(subtitulo, { tamanho: 10, antes: 2 });
  folha.y += 5;
  folha.linha({ espessura: 1.5 });
  folha.y += 4;

  if (!producao || producao.pratos.length === 0) {
    folha.texto("O evento não tem cardápio escolhido.", { tamanho: 11, antes: 8 });
    return folha.terminar();
  }
  const p = producao;
  const inteiro = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

  folha.secao("Pratos");
  for (const x of p.pratos) {
    folha.linhaComValor({ nome: x.nome, detalhe: `${x.codigo} · ${inteiro(x.porcoes)} porções · ${receitas(x.receitas)}`, valor: x.pronto === null ? "-" : medida(x.pronto, x.unidade) });
  }
  if (p.preparos.length > 0) {
    folha.secao("Pré-preparos");
    for (const x of p.preparos) {
      folha.linhaComValor({ nome: x.nome, detalhe: x.receitas > 0 ? receitas(x.receitas) : "sem peso pronto na ficha", valor: medida(x.quantidade, x.unidade) });
    }
  }
  if (p.insumos.length > 0) {
    folha.secao("Insumos para comprar");
    for (const x of p.insumos) {
      folha.linhaComValor({
        nome: x.nome,
        valor: medida(x.bruto, x.unidade),
        detalheDoValor: Math.abs(x.bruto - x.limpo) > 0.5 ? `limpo ${medida(x.limpo, x.unidade)}` : undefined,
      });
    }
  }
  if (p.semIngredientes.length > 0) {
    folha.texto(`Sem ingredientes lançados na ficha: ${p.semIngredientes.join(", ")}. A lista de compra sai sem os insumos delas.`, { tamanho: 9.5, antes: 10 });
  }
  if (p.semRendimento.length > 0) {
    folha.texto(`Sem peso pronto na ficha, não dá para abrir: ${p.semRendimento.join(", ")}. Os insumos deles ficam fora da lista.`, { tamanho: 9.5, antes: 6 });
  }
  return folha.terminar();
}
