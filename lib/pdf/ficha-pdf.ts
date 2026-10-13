import { formatMoney } from "@/lib/format";
import type { FichaParaImprimir, TipoDeFicha } from "@/lib/receituario-impressao";
import { corDaCategoria, OPERACOES, precosSugeridos } from "@/lib/receituario-regras";

import { Folha, paraHelvetica } from "./folha";

/**
 * As fichas do Receituário em PDF, uma por folha A4, como a de
 * `/imprimir/receituario` (`app/imprimir/receituario/ficha-impressa.tsx`):
 * a faixa da cor da categoria na borda direita, o alto com o nome e a foto,
 * os quatro quadros, os ingredientes e, na operacional, o modo de preparo e
 * o forno. A técnica troca o preparo pelo preço e pelo custo.
 *
 * `fotos` traz a foto de cada ficha (JPEG ou PNG, que é o que o pdfkit lê),
 * pelo id da ficha; quem não tem foto sai sem.
 */

const FAIXA = 24;
const VAO_DA_FAIXA = 10;
const numero = (n: number, casas = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

export async function fichasEmPdf(itens: FichaParaImprimir[], tipo: TipoDeFicha, fotos: Map<number, Buffer>): Promise<Buffer> {
  const tecnica = tipo === "tecnica";
  const titulo = itens.length === 1 ? `Ficha ${itens[0].ficha.codigo} ${itens[0].ficha.nome}` : "Fichas";
  const folha = new Folha({ titulo, reservaDireita: FAIXA + VAO_DA_FAIXA });
  const doc = folha.doc;

  if (itens.length === 0) {
    folha.texto("Nenhuma ficha para imprimir.", { tamanho: 12 });
    return folha.terminar();
  }

  itens.forEach((item, indice) => {
    const { ficha: f, custo, config } = item;
    const cor = corDaCategoria(f.categoria, config.cores);

    // A faixa da categoria em toda página da ficha, com o nome de pé.
    folha.aoVirar = () => {
      const x = doc.page.width - folha.margem - FAIXA;
      const topo = folha.margem;
      const altura = doc.page.height - folha.margem * 2;
      doc.save();
      doc.roundedRect(x, topo, FAIXA, altura, 3).fill(cor);
      doc.rotate(90, { origin: [x + FAIXA / 2, topo + altura / 2] });
      doc
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#ffffff")
        .text(paraHelvetica(f.categoria).toUpperCase(), x + FAIXA / 2 - altura / 2, topo + altura / 2 - 5, { width: altura, align: "center", characterSpacing: 2, lineBreak: false });
      doc.restore();
      doc.fillColor("#000000");
    };
    folha.nome = `${f.codigo} ${f.nome}`;
    if (indice === 0) folha.aoVirar();
    else folha.novaFolha();

    // O alto: o tipo e o código, o nome, as etiquetas, onde é usada; a foto à direita.
    const foto = fotos.get(f.id);
    // O quadro da foto: 4 x 3 cm, como na folha de imprimir.
    const QUADRO = { w: 113, h: 85 };
    const larguraDoTexto = foto ? folha.largura - QUADRO.w - 10 : folha.largura;
    const topo = folha.y;
    folha.texto(`${tecnica ? "Ficha técnica" : "Ficha operacional"} · ${f.codigo}${f.tipo === "PRE_PREPARO" ? " · pré-preparo" : ""}`, {
      tamanho: 8,
      negrito: true,
      cor: "#525252",
      largura: larguraDoTexto,
    });
    folha.texto(f.nome, { tamanho: 20, negrito: true, antes: 2, largura: larguraDoTexto });
    if (f.etiquetas.length > 0) folha.texto(f.etiquetas.join("  ·  ").toUpperCase(), { tamanho: 8, negrito: true, cor, antes: 2, largura: larguraDoTexto });
    if (f.operacoes.length > 0) {
      folha.texto(`Usada em: ${f.operacoes.map((o) => OPERACOES.find((x) => x.chave === o)?.nome ?? o).join(" · ")}`, { tamanho: 8.5, cor: "#525252", antes: 2, largura: larguraDoTexto });
    }
    if (foto) {
      // A foto preenche o quadro, cortada no meio e com cantos arredondados (o `object-cover` da folha).
      const x = folha.x + folha.largura - QUADRO.w;
      doc.save();
      try {
        doc.roundedRect(x, topo, QUADRO.w, QUADRO.h, 4).clip();
        doc.image(foto, x, topo, { cover: [QUADRO.w, QUADRO.h], align: "center", valign: "center" });
        folha.y = Math.max(folha.y, topo + QUADRO.h);
      } catch {
        // Imagem que o pdfkit não abre: a ficha sai sem ela.
      }
      doc.restore();
    }
    folha.y += 6;
    folha.linha({ cor, espessura: 1.5 });
    folha.y += 8;

    const rend = f.rendimentoTotal === null ? null : Number(f.rendimentoTotal);
    const porcao = rend !== null && f.porcoes > 0 ? rend / f.porcoes : null;
    folha.quadros([
      ["Peso pronto", rend === null ? "-" : `${numero(rend)} ${f.unidadeRendimento}`],
      ["Porções", porcao === null ? String(f.porcoes) : `${f.porcoes} de ${numero(porcao)} ${f.unidadeRendimento}`],
      ["Tempo de preparo", f.tempoPreparo ?? "-"],
      ["Validade", f.armazenamento ?? "-", "pequeno"],
    ]);

    folha.secao("Ingredientes");
    const nomeDaLinha = (l: (typeof f.ingredientes)[number]) => (l.subFicha ? `${l.subFicha.nome} (ficha ${l.subFicha.codigo})` : (l.insumo?.nome ?? l.nomeLivre ?? ""));
    const qtd = (l: (typeof f.ingredientes)[number]) => `${numero(Number(l.quantidade), 1)} ${l.unidade ?? ""}`.trim();
    if (tecnica) {
      folha.tabela(
        [
          { titulo: "Ingrediente", peso: 5 },
          { titulo: "Qtd", peso: 1.4, direita: true },
          { titulo: "Preço", peso: 1.8, direita: true },
          { titulo: "Custo", peso: 1.4, direita: true },
        ],
        f.ingredientes.map((l, i) => {
          const p = item.precos[i];
          const c = custo.linhas[i];
          return [nomeDaLinha(l), qtd(l), p ? `${formatMoney(p.valor)}/${p.por}` : "-", c === null ? "s/ preço" : l.nomeLivre ? "-" : formatMoney(c)];
        }),
      );
    } else {
      folha.tabela(
        [
          { titulo: "Ingrediente", peso: 4 },
          { titulo: "Qtd", peso: 1.3, direita: true },
          { titulo: "Preparo do item", peso: 3.2 },
        ],
        f.ingredientes.map((l) => [nomeDaLinha(l), qtd(l), l.preparo ?? ""]),
      );
    }

    if (tecnica) {
      const precos = precosSugeridos(custo.porPorcao, config.metaFoodCost, config.markup);
      folha.y += 10;
      folha.quadros(
        [
          ["Total", formatMoney(custo.total)],
          ["Por porção", custo.porPorcao === null ? "-" : formatMoney(custo.porPorcao)],
          ["Por kg pronto", custo.porKg === null ? "-" : formatMoney(custo.porKg)],
        ],
        { tamanhoDoValor: 11 },
      );
      folha.y += 6;
      folha.quadros(
        [
          ["Perda", custo.perda === null ? "-" : `${numero(custo.perda * 100, 1)}%`],
          ["Preço mínimo", precos.minimo === null ? "-" : formatMoney(precos.minimo)],
          [`Pelo markup ${numero(config.markup, 2)}`, precos.markup === null ? "-" : formatMoney(precos.markup)],
        ],
        { tamanhoDoValor: 11 },
      );
    } else {
      if (f.passos.length > 0) {
        folha.secao("Modo de preparo");
        f.passos.forEach((p, i) => {
          const texto = paraHelvetica(p);
          doc.font("Helvetica").fontSize(9.5);
          const altura = doc.heightOfString(texto, { width: folha.largura - 20 });
          folha.cabe(altura + 4);
          doc.circle(folha.x + 6.5, folha.y + 6, 6).fill(cor);
          doc
            .font("Helvetica-Bold")
            .fontSize(7)
            .fillColor("#ffffff")
            .text(String(i + 1), folha.x, folha.y + 3.3, { width: 13, align: "center", lineBreak: false });
          doc.font("Helvetica").fontSize(9.5).fillColor("#000000").text(texto, folha.x + 19, folha.y + 1.5, { width: folha.largura - 20 });
          folha.y = doc.y + 3;
        });
      }

      const forno = (
        [
          ["Viabilidade", f.viabilidade],
          ["Modo", f.modoForno],
          ["Temperatura", f.temperatura],
          ["Umidade", f.umidade],
          ["Tempo", f.tempoForno],
          ["Sonda", f.sonda],
        ] as [string, string | null][]
      ).filter((x): x is [string, string] => Boolean(x[1]));
      const blocos = (
        [
          ["Utensílios e equipamentos", f.utensilios],
          ["Ponto de controle", f.pontoDeControle],
          ["Montagem e porcionamento", f.montagem],
        ] as [string, string | null][]
      ).filter((x): x is [string, string] => Boolean(x[1]));
      if (forno.length > 0 || blocos.length > 0) {
        folha.secao("Ficha operacional");
        if (forno.length > 0) {
          folha.texto("Forno combinado", { tamanho: 8, negrito: true, antes: 2 });
          folha.texto(forno.map(([r, v]) => `${r}: ${v}`).join(" · "), { tamanho: 9.5 });
          if (f.ajusteForno) folha.texto(f.ajusteForno, { tamanho: 8.5, cor: "#404040", antes: 1 });
        }
        for (const [r, v] of blocos) {
          folha.texto(r, { tamanho: 8, negrito: true, antes: 5 });
          folha.texto(v, { tamanho: 9.5 });
        }
      }

      if (f.alergenicos.length > 0 || f.observacoes) {
        folha.y += 8;
        if (f.alergenicos.length > 0) folha.texto(`Alergênicos: ${f.alergenicos.join(", ")}`, { tamanho: 9.5, negrito: true });
        if (f.observacoes) folha.texto(f.observacoes, { tamanho: 9.5, antes: 2 });
      }
    }

    folha.assinaturas([`${f.conferida ? "[x]" : "[ ]"} Conferida na cozinha`, "Responsável", "Revisada em ___/___/______"]);
  });

  return folha.terminar();
}
