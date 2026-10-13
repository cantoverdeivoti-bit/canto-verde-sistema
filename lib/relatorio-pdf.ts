import PDFDocument from "pdfkit";

import { UNIT_LABEL, formatAmount, formatMoney, plural } from "@/lib/format";
import type { DadosDoRelatorio } from "@/lib/relatorio-agendado";
import { NO_RELATORIO } from "@/lib/relatorio-agendado";

/**
 * O relatório de compras em PDF (A4), com pdfkit: JavaScript puro, sem
 * navegador, roda na Vercel do jeito que está.
 *
 * Fonte Helvetica, a padrão do PDF, que tem os acentos do português mas não
 * tem setas nem o sinal de menos tipográfico: `limpo` troca esses símbolos
 * antes de escrever, senão saem como lixo.
 */

const COR = {
  faixa: "#00461E",
  verde: "#186618",
  texto: "#1d1d1b",
  apagado: "#5c625f",
  linha: "#dfe3e1",
  fundo: "#f3f5f4",
  vermelho: "#b42318",
  ocre: "#9a5b13",
};

const MARGEM = 40;
const LARGURA = 595.28 - MARGEM * 2;
const FUNDO_DA_PAGINA = 841.89 - 50;

/** Os símbolos que a Helvetica do PDF não tem. */
function limpo(t: string) {
  return t
    .replace(/→/g, "->")
    .replace(/−/g, "-")
    .replace(/[▲]/g, "+")
    .replace(/[▼]/g, "-")
    .replace(/★/g, "");
}

/** "22/09" */
const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
/** "22/09/2026" */
const diaMesAno = (dia: string) => `${diaMes(dia)}/${dia.slice(0, 4)}`;
const pct = (n: number, casas = 1) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;
const comSinal = (n: number) => `${n > 0 ? "+" : n < 0 ? "-" : ""}${pct(Math.abs(n))}`;
const dinheiroComSinal = (n: number) => `${n >= 0 ? "+" : "-"}${formatMoney(Math.abs(n))}`;

type Coluna = { titulo: string; largura: number; direita?: boolean };

export async function relatorioEmPdf(d: DadosDoRelatorio, geradoEm: string): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGEM, bottom: 50, left: MARGEM, right: MARGEM },
    bufferPages: true,
    info: { Title: `Relatório de compras ${diaMes(d.de)} a ${diaMes(d.ate)}`, Author: "Canto Verde" },
  });
  const partes: Buffer[] = [];
  doc.on("data", (p: Buffer) => partes.push(p));
  const pronto = new Promise<Buffer>((ok) => doc.on("end", () => ok(Buffer.concat(partes))));

  const { kpis } = d.painel;

  // --- Cabeçalho -----------------------------------------------------------
  doc.rect(0, 0, doc.page.width, 92).fill(COR.faixa);
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text("Relatório de compras", MARGEM, 28, { width: LARGURA });
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor("#cfe8d2")
    .text(
      `${diaMesAno(d.de)} a ${diaMesAno(d.ate)}  ·  comparado com ${diaMes(d.antes.de)} a ${diaMes(d.antes.ate)}`,
      MARGEM,
      56,
      { width: LARGURA },
    );
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#00d700").text("CANTO VERDE", MARGEM, 30, {
    width: LARGURA,
    align: "right",
    characterSpacing: 1.5,
  });
  doc.y = 112;

  // --- Peças ---------------------------------------------------------------
  const cabe = (altura: number) => {
    if (doc.y + altura > FUNDO_DA_PAGINA) {
      doc.addPage();
      doc.y = MARGEM;
    }
  };

  const secao = (titulo: string, dica?: string) => {
    cabe(70);
    doc.moveDown(0.6);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(COR.apagado)
      .text(titulo.toUpperCase(), MARGEM, doc.y, { characterSpacing: 1.2 });
    if (dica) doc.font("Helvetica").fontSize(8.5).fillColor(COR.apagado).text(limpo(dica), MARGEM, doc.y + 2, { width: LARGURA });
    doc.y += 6;
  };

  const tabela = (colunas: Coluna[], linhas: string[][], cor?: (linha: number, coluna: number) => string | null) => {
    const total = colunas.reduce((s, c) => s + c.largura, 0);
    const escala = LARGURA / total;
    const larguras = colunas.map((c) => c.largura * escala);
    const desenharTitulo = () => {
      let x = MARGEM;
      const y = doc.y;
      doc.font("Helvetica-Bold").fontSize(8).fillColor(COR.apagado);
      colunas.forEach((c, i) => {
        doc.text(c.titulo, x + 4, y, { width: larguras[i] - 8, align: c.direita ? "right" : "left" });
        x += larguras[i];
      });
      doc.y = y + 14;
      doc.moveTo(MARGEM, doc.y).lineTo(MARGEM + LARGURA, doc.y).lineWidth(0.6).strokeColor(COR.linha).stroke();
      doc.y += 3;
    };
    cabe(40);
    desenharTitulo();
    linhas.forEach((linha, li) => {
      doc.font("Helvetica").fontSize(9);
      const altura =
        Math.max(...linha.map((t, i) => doc.heightOfString(limpo(t), { width: larguras[i] - 8 }))) + 8;
      if (doc.y + altura > FUNDO_DA_PAGINA) {
        doc.addPage();
        doc.y = MARGEM;
        desenharTitulo();
      }
      const y = doc.y;
      if (li % 2 === 1) doc.rect(MARGEM, y - 1, LARGURA, altura).fill(COR.fundo);
      let x = MARGEM;
      linha.forEach((t, i) => {
        doc
          .font(i === 0 ? "Helvetica-Bold" : "Helvetica")
          .fontSize(9)
          .fillColor(cor?.(li, i) ?? COR.texto)
          .text(limpo(t), x + 4, y + 3, { width: larguras[i] - 8, align: colunas[i].direita ? "right" : "left" });
        x += larguras[i];
      });
      doc.y = y + altura;
    });
    doc.y += 4;
  };

  const vazio = (texto: string) => {
    cabe(24);
    doc.font("Helvetica").fontSize(9.5).fillColor(COR.apagado).text(texto, MARGEM, doc.y, { width: LARGURA });
    doc.y += 6;
  };

  // --- 1. Os números -------------------------------------------------------
  secao("Números do período", "Cada um contra o período anterior de mesmo tamanho.");
  const variacaoGasto = kpis.gastoAntes > 0 ? ((kpis.gasto - kpis.gastoAntes) / kpis.gastoAntes) * 100 : null;
  const cartoes: { rotulo: string; valor: string; detalhe: string; alerta?: boolean }[] = [
    {
      rotulo: "Gasto recebido",
      valor: formatMoney(kpis.gasto),
      detalhe: variacaoGasto === null ? "sem compra no período anterior" : `${comSinal(variacaoGasto)} vs anterior`,
    },
    {
      rotulo: "Uso do orçamento",
      valor: kpis.orcamento.uso === null ? "-" : pct(kpis.orcamento.uso),
      detalhe: kpis.orcamento.semanas === 0 ? "sem orçamento no período" : "pedido contra o orçamento",
      alerta: kpis.orcamento.uso !== null && kpis.orcamento.uso > 100,
    },
    {
      rotulo: "Preço da mesma cesta",
      valor: kpis.cesta.variacao === null ? "-" : comSinal(kpis.cesta.variacao),
      detalhe: kpis.cesta.produtos === 0 ? "sem produto comprado nos dois" : `${dinheiroComSinal(kpis.cesta.efeito)} só de preço`,
      alerta: kpis.cesta.variacao !== null && kpis.cesta.variacao >= 5,
    },
    {
      rotulo: "Entregas no prazo",
      valor: kpis.prazo.pct === null ? "-" : pct(kpis.prazo.pct),
      detalhe:
        kpis.prazo.semChegar > 0
          ? plural(kpis.prazo.semChegar, "atrasado sem chegar", "atrasados sem chegar")
          : `${plural(kpis.prazo.entregas, "entrega", "entregas")} com previsão`,
      alerta: kpis.prazo.pct !== null && kpis.prazo.pct < 70,
    },
    {
      rotulo: "Economia negociada",
      valor: formatMoney(d.economia.valor),
      detalhe: d.economia.itens > 0 ? `em ${plural(d.economia.itens, "item", "itens")}` : "nenhuma negociação no período",
    },
    {
      rotulo: "Bonificações recebidas",
      valor: formatMoney(d.bonificacao.valor),
      detalhe:
        d.bonificacao.itens > 0
          ? plural(d.bonificacao.itens, "bonificação", "bonificações")
          : "nenhuma no período",
    },
    {
      rotulo: "A caminho",
      valor: formatMoney(kpis.aCaminho.valor),
      detalhe:
        kpis.aCaminho.semPreco > 0
          ? `${plural(kpis.aCaminho.semPreco, "item", "itens")} sem preço`
          : "pedido e ainda não recebido",
    },
  ];
  const linhasDeCartoes = Math.ceil(cartoes.length / 3);
  cabe(linhasDeCartoes * 62 + 6);
  const largCartao = (LARGURA - 16) / 3;
  const yCartoes = doc.y;
  cartoes.forEach((c, i) => {
    const x = MARGEM + (i % 3) * (largCartao + 8);
    const y = yCartoes + Math.floor(i / 3) * 62;
    doc.roundedRect(x, y, largCartao, 54, 6).fill(COR.fundo);
    doc.font("Helvetica").fontSize(8).fillColor(COR.apagado).text(c.rotulo, x + 10, y + 8, { width: largCartao - 20 });
    doc
      .font("Helvetica-Bold")
      .fontSize(15)
      .fillColor(c.alerta ? COR.vermelho : COR.verde)
      .text(c.valor, x + 10, y + 20, { width: largCartao - 20 });
    doc.font("Helvetica").fontSize(7.5).fillColor(COR.apagado).text(limpo(c.detalhe), x + 10, y + 39, { width: largCartao - 20 });
  });
  doc.y = yCartoes + linhasDeCartoes * 62 + 4;

  // --- 2. O que pede decisão -----------------------------------------------
  secao("O que pede decisão");
  if (d.painel.insights.length === 0) vazio(kpis.gasto === 0 ? "Sem compra recebida no período." : "Nada pedindo ação.");
  for (const i of d.painel.insights) {
    cabe(40);
    const y = doc.y;
    const cor = i.tom === "perda" ? COR.vermelho : COR.ocre;
    doc.rect(MARGEM, y, 3, 30).fill(cor);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COR.texto).text(limpo(i.titulo), MARGEM + 10, y + 1, {
      width: LARGURA - 110,
    });
    if (i.texto) doc.font("Helvetica").fontSize(8.5).fillColor(COR.apagado).text(limpo(i.texto), MARGEM + 10, doc.y + 1, { width: LARGURA - 110 });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(cor)
      .text(i.impacto !== null ? formatMoney(i.impacto) : "risco", MARGEM, y + 1, { width: LARGURA, align: "right" });
    doc.y = Math.max(doc.y, y + 30) + 8;
  }

  // --- 3. Produtos mais comprados ------------------------------------------
  secao("Produtos mais comprados", `Os ${NO_RELATORIO.produtos} de maior gasto no período.`);
  const produtos = d.painel.abc.slice(0, NO_RELATORIO.produtos);
  if (produtos.length === 0) vazio("Nenhuma compra recebida no período.");
  else
    tabela(
      [
        { titulo: "Produto", largura: 34 },
        { titulo: "Quantidade", largura: 16, direita: true },
        { titulo: "Gasto", largura: 16, direita: true },
        { titulo: "% do total", largura: 12, direita: true },
        { titulo: "Preço vs antes", largura: 16, direita: true },
      ],
      produtos.map((p) => [
        p.nome,
        `${formatAmount(p.quantidade)} ${UNIT_LABEL[p.unidade]}`,
        formatMoney(p.valor),
        pct(p.pct),
        p.variacaoPreco === null ? "novo" : comSinal(p.variacaoPreco),
      ]),
      (li, ci) => {
        const v = produtos[li].variacaoPreco;
        if (ci !== 4 || v === null || Math.abs(v) < 0.05) return null;
        return v > 0 ? COR.vermelho : COR.verde;
      },
    );

  // --- 4. Elevação de preço ------------------------------------------------
  const tabelaDePreco = (linhas: DadosDoRelatorio["altas"], cor: string) =>
    tabela(
      [
        { titulo: "Produto", largura: 34 },
        { titulo: "Antes", largura: 16, direita: true },
        { titulo: "Agora", largura: 16, direita: true },
        { titulo: "Variação", largura: 14, direita: true },
        { titulo: "Pesou", largura: 16, direita: true },
      ],
      linhas.map((v) => [
        v.nome,
        `${formatMoney(v.antes)}/${UNIT_LABEL[v.unidade]}`,
        `${formatMoney(v.agora)}/${UNIT_LABEL[v.unidade]}`,
        comSinal(v.variacao),
        dinheiroComSinal(v.efeito),
      ]),
      (_, ci) => (ci >= 3 ? cor : null),
    );
  secao("Maiores altas de preço", "Preço médio pago neste período contra o anterior, do que mais pesou em reais.");
  if (d.altas.length === 0) vazio("Nenhum produto ficou mais caro.");
  else tabelaDePreco(d.altas, COR.vermelho);
  secao("Maiores quedas de preço");
  if (d.quedas.length === 0) vazio("Nenhum produto ficou mais barato.");
  else tabelaDePreco(d.quedas, COR.verde);

  // --- 5. Fornecedores -----------------------------------------------------
  secao("Fornecedores", "Gasto pelo que chegou. No prazo conta como atraso o pedido que passou do dia e não chegou.");
  if (d.fornecedores.length === 0) vazio("Nenhum pedido recebido no período.");
  else
    tabela(
      [
        { titulo: "Fornecedor", largura: 28 },
        { titulo: "Gasto", largura: 15, direita: true },
        { titulo: "No prazo", largura: 13, direita: true },
        { titulo: "Sem chegar", largura: 11, direita: true },
        { titulo: "Problemas", largura: 18 },
        { titulo: "Crédito", largura: 15, direita: true },
      ],
      d.fornecedores.map((f) => {
        const problemas = [
          f.naoEntregue > 0 && plural(f.naoEntregue, "não entregue", "não entregues"),
          f.falta > 0 && plural(f.falta, "falta", "faltas"),
          f.devolvido > 0 && plural(f.devolvido, "devolvido", "devolvidos"),
          f.avaria > 0 && plural(f.avaria, "avaria", "avarias"),
        ].filter(Boolean);
        return [
          f.nome,
          formatMoney(f.gasto),
          f.comPrevisao > 0 ? `${f.noPrazo} de ${f.comPrevisao}` : "-",
          f.semChegar > 0 ? String(f.semChegar) : "-",
          problemas.length > 0 ? problemas.join(", ") : "-",
          f.extras && f.extras.creditos > 0 ? formatMoney(f.extras.creditos) : "-",
        ];
      }),
      (li, ci) => {
        const f = d.fornecedores[li];
        if (ci === 2 && f.comPrevisao > 0 && f.noPrazo < f.comPrevisao) return COR.vermelho;
        if (ci === 3 && f.semChegar > 0) return COR.vermelho;
        if (ci === 4 && (f.naoEntregue || f.falta || f.devolvido || f.avaria)) return COR.vermelho;
        if (ci === 5 && f.extras && f.extras.creditos > 0) return COR.ocre;
        return null;
      },
    );

  // --- 6. Gasto por categoria ----------------------------------------------
  secao("Gasto por categoria");
  if (d.painel.categorias.length === 0) vazio("Nenhuma compra recebida no período.");
  else {
    const maior = Math.max(...d.painel.categorias.map((c) => c.pct), 0);
    for (const c of d.painel.categorias) {
      cabe(18);
      const y = doc.y;
      doc.font("Helvetica").fontSize(9).fillColor(COR.texto).text(c.categoria, MARGEM, y, { width: 130, ellipsis: true, lineBreak: false });
      const xBarra = MARGEM + 136;
      const largBarra = LARGURA - 136 - 130;
      doc.rect(xBarra, y + 1, largBarra, 8).fill(COR.fundo);
      doc.rect(xBarra, y + 1, maior > 0 ? Math.max((c.pct / maior) * largBarra, 2) : 0, 8).fill(COR.verde);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(COR.texto)
        .text(`${formatMoney(c.valor)} · ${pct(c.pct)}`, MARGEM, y, { width: LARGURA, align: "right" });
      doc.y = y + 15;
    }
    doc.y += 4;
  }

  // --- 7. Orçamento semana a semana ----------------------------------------
  secao("Orçamento semana a semana", "Pedido feito na semana contra o orçamento dela.");
  if (d.painel.semanas.length === 0) vazio("Nenhuma semana no período.");
  else {
    const semanas = [...d.painel.semanas].reverse();
    tabela(
      [
        { titulo: "Semana", largura: 18 },
        { titulo: "Orçamento", largura: 20, direita: true },
        { titulo: "Pedido", largura: 20, direita: true },
        { titulo: "% do orçamento", largura: 20, direita: true },
        { titulo: "Recebido", largura: 20, direita: true },
      ],
      semanas.map((s) => [
        `de ${diaMes(s.semana)}`,
        s.orcamento === null ? "sem orçamento" : formatMoney(s.orcamento),
        formatMoney(s.pedido),
        s.orcamento ? pct((s.pedido / s.orcamento) * 100) : "-",
        formatMoney(s.recebido),
      ]),
      (li, ci) => {
        const s = semanas[li];
        return ci === 3 && s.orcamento !== null && s.pedido > s.orcamento ? COR.vermelho : null;
      },
    );
  }

  // --- Rodapé em todas as páginas ------------------------------------------
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    // Sem isto o pdfkit acha que o rodapé passou da margem e abre página nova.
    doc.page.margins.bottom = 0;
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(COR.apagado)
      .text(`Canto Verde · relatório de compras · gerado em ${geradoEm}`, MARGEM, 841.89 - 32, {
        width: LARGURA,
        lineBreak: false,
      });
    doc.text(`Página ${i + 1} de ${paginas.count}`, MARGEM, 841.89 - 32, { width: LARGURA, align: "right", lineBreak: false });
  }

  doc.end();
  return pronto;
}
