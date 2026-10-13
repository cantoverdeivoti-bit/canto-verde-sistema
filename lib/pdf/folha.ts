import PDFDocument from "pdfkit";

/**
 * As peças das folhas em PDF, desenhadas com o pdfkit: JavaScript puro, sem
 * navegador, roda na Vercel do jeito que está (o checklist e o relatório de
 * compras já saem assim). Cada folha (`lib/pdf/*-pdf.ts`) monta a sua com
 * estas peças e recebe os dados prontos, sem banco.
 *
 * A Helvetica do PDF só tem o Latin-1: `paraHelvetica` troca o que o
 * celular escreve fora dele (aspas curvas, travessão, setas) e tira o resto
 * (emoji), que sairia como lixo.
 */

export function paraHelvetica(t: string | null | undefined): string {
  return (t ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/→/g, "->")
    .replace(/[☐]/g, "[ ]")
    .replace(/[☑☒]/g, "[x]")
    .replace(/[^\u0000-ÿ]/g, "")
    .trim();
}

export type Coluna = {
  titulo: string;
  /** Largura relativa: as colunas dividem a largura da folha na proporção. */
  peso: number;
  direita?: boolean;
  centro?: boolean;
};

const CINZA = "#e5e5e5";
const BORDA = "#a3a3a3";

/**
 * Uma folha A4 com a posição de escrita (`y`) e a quebra de página. Quem
 * desenha pede espaço com `cabe(altura)`: se não couber, a página vira, e a
 * nova leva o nome da folha com "(continuação)" e o que `aoVirar` desenhar
 * (a faixa da categoria, na ficha).
 */
export class Folha {
  readonly doc: PDFKit.PDFDocument;
  readonly margem: number;
  /** Onde o conteúdo começa e quanto mede, sem a faixa lateral. */
  x: number;
  largura: number;
  y: number;
  /** O nome que vai no alto das páginas de continuação. */
  nome = "";
  /** Desenha o que toda página da folha repete (a faixa da ficha). */
  aoVirar: (() => void) | null = null;
  private readonly partes: Buffer[] = [];
  private readonly fim: Promise<Buffer>;

  constructor({ titulo, deitado = false, margem = 28, reservaDireita = 0 }: { titulo: string; deitado?: boolean; margem?: number; reservaDireita?: number }) {
    this.doc = new PDFDocument({
      size: "A4",
      layout: deitado ? "landscape" : "portrait",
      margins: { top: margem, bottom: margem, left: margem, right: margem },
      info: { Title: paraHelvetica(titulo), Author: "Canto Verde" },
    });
    this.doc.on("data", (p: Buffer) => this.partes.push(p));
    this.fim = new Promise<Buffer>((ok) => this.doc.on("end", () => ok(Buffer.concat(this.partes))));
    this.margem = margem;
    this.x = margem;
    this.largura = this.doc.page.width - margem * 2 - reservaDireita;
    this.y = margem;
    this.doc.lineWidth(0.6).strokeColor("#000000").fillColor("#000000").font("Helvetica");
  }

  get fundo() {
    return this.doc.page.height - this.margem;
  }

  /** Página nova para a mesma folha: o nome em cima, com "(continuação)". */
  continuar() {
    this.doc.addPage();
    this.y = this.margem;
    this.aoVirar?.();
    if (this.nome) {
      this.doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text(`${paraHelvetica(this.nome).toUpperCase()} (continuação)`, this.x, this.y, { width: this.largura });
      this.y = this.doc.y + 6;
    }
  }

  /** Página nova para outra folha (outra ficha da lista): sem "(continuação)". */
  novaFolha() {
    this.doc.addPage();
    this.y = this.margem;
    this.aoVirar?.();
  }

  cabe(altura: number) {
    if (this.y + altura > this.fundo) this.continuar();
  }

  /** Um parágrafo; `antes` é o respiro acima dele. */
  texto(t: string, { tamanho = 10, negrito = false, cor = "#000000", antes = 0, largura, x }: { tamanho?: number; negrito?: boolean; cor?: string; antes?: number; largura?: number; x?: number } = {}) {
    const limpo = paraHelvetica(t);
    if (!limpo) return;
    const w = largura ?? this.largura;
    this.doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(tamanho);
    const altura = this.doc.heightOfString(limpo, { width: w });
    this.y += antes;
    // Texto mais alto que uma página quebra sozinho no pdfkit; o resto pede espaço antes.
    if (altura < this.fundo - this.margem) this.cabe(altura);
    this.doc.fillColor(cor).text(limpo, x ?? this.x, this.y, { width: w });
    this.y = this.doc.y;
    this.doc.fillColor("#000000");
  }

  /** O título de uma parte da folha, em caixa alta: "INGREDIENTES". */
  secao(t: string) {
    this.cabe(40);
    this.y += 8;
    this.doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#000000").text(paraHelvetica(t).toUpperCase(), this.x, this.y, { width: this.largura, characterSpacing: 0.3 });
    this.y = this.doc.y + 3;
  }

  /** Uma linha horizontal na largura da folha. */
  linha({ cor = "#000000", espessura = 0.6 }: { cor?: string; espessura?: number } = {}) {
    this.doc.moveTo(this.x, this.y).lineTo(this.x + this.largura, this.y).lineWidth(espessura).strokeColor(cor).stroke().lineWidth(0.6).strokeColor("#000000");
  }

  /**
   * Uma tabela com borda: cabeçalho cinza, linhas que crescem com o texto, e
   * o cabeçalho repetido na página seguinte quando ela não cabe. `negrito`
   * diz quais linhas saem em negrito (o total, um título de grupo).
   */
  tabela(
    colunas: Coluna[],
    linhas: string[][],
    {
      tamanho = 9,
      negrito,
      cabecalho = true,
      fundoDoCabecalho = CINZA,
      corDoCabecalho = "#000000",
      faixa,
      alturaMinima = 14,
      respiro = 5,
    }: {
      tamanho?: number;
      negrito?: (i: number) => boolean;
      cabecalho?: boolean;
      fundoDoCabecalho?: string;
      corDoCabecalho?: string;
      /** A cor de fundo quando a linha é uma faixa de grupo: uma célula só, com o texto da primeira em branco. */
      faixa?: (i: number) => string | null;
      alturaMinima?: number;
      /** O espaço em cima e embaixo do texto de cada linha, somados. */
      respiro?: number;
    } = {},
  ) {
    const doc = this.doc;
    const soma = colunas.reduce((s, c) => s + c.peso, 0);
    const larguras = colunas.map((c) => (c.peso / soma) * this.largura);
    const alinhar = (c: Coluna) => (c.direita ? "right" : c.centro ? "center" : "left");

    const desenharCabecalho = () => {
      if (!cabecalho) return;
      doc.font("Helvetica-Bold").fontSize(tamanho - 1);
      const altura = Math.max(...colunas.map((c, i) => doc.heightOfString(paraHelvetica(c.titulo).toUpperCase(), { width: larguras[i] - 8 }))) + 6;
      doc.rect(this.x, this.y, this.largura, altura).fillAndStroke(fundoDoCabecalho, BORDA);
      let x = this.x;
      colunas.forEach((c, i) => {
        doc.fillColor(corDoCabecalho).text(paraHelvetica(c.titulo).toUpperCase(), x + 4, this.y + 3.5, { width: larguras[i] - 8, align: alinhar(c) });
        x += larguras[i];
      });
      this.y += altura;
    };

    this.cabe(40);
    desenharCabecalho();
    linhas.forEach((linha, li) => {
      const corDaFaixa = faixa?.(li) ?? null;
      if (corDaFaixa) {
        doc.font("Helvetica-Bold").fontSize(tamanho);
        const texto = paraHelvetica(linha[0]).toUpperCase();
        const altura = doc.heightOfString(texto, { width: this.largura - 8 }) + respiro;
        // A faixa não fica sozinha no pé da página: leva junto a primeira linha do grupo.
        if (this.y + altura + alturaMinima > this.fundo) {
          this.continuar();
          desenharCabecalho();
        }
        doc.rect(this.x, this.y, this.largura, altura).fillAndStroke(corDaFaixa, BORDA);
        doc.font("Helvetica-Bold").fontSize(tamanho).fillColor("#ffffff").text(texto, this.x + 4, this.y + respiro / 2 + 0.5, { width: this.largura - 8 });
        this.y += altura;
        return;
      }
      const fonte = negrito?.(li) ? "Helvetica-Bold" : "Helvetica";
      doc.font(fonte).fontSize(tamanho);
      const textos = linha.map(paraHelvetica);
      const altura = Math.max(alturaMinima, ...textos.map((t, i) => doc.heightOfString(t || " ", { width: larguras[i] - 8 }) + respiro));
      if (this.y + altura > this.fundo) {
        this.continuar();
        desenharCabecalho();
        doc.font(fonte).fontSize(tamanho);
      }
      doc.rect(this.x, this.y, this.largura, altura).lineWidth(0.6).strokeColor(BORDA).stroke();
      let x = this.x;
      textos.forEach((t, i) => {
        if (i > 0) doc.moveTo(x, this.y).lineTo(x, this.y + altura).strokeColor(BORDA).stroke();
        doc.fillColor("#000000").text(t, x + 4, this.y + respiro / 2 + 0.5, { width: larguras[i] - 8, align: alinhar(colunas[i]) });
        x += larguras[i];
      });
      this.y += altura;
    });
    doc.strokeColor("#000000");
  }

  /** Quadros lado a lado com rótulo pequeno e valor: "PESO PRONTO / 900 g". O terceiro item diz que o valor é texto longo, em letra menor. */
  quadros(itens: [string, string, "pequeno"?][], { tamanhoDoValor = 12 }: { tamanhoDoValor?: number } = {}) {
    const doc = this.doc;
    const vao = 6;
    const w = (this.largura - vao * (itens.length - 1)) / itens.length;
    const fonte = (pequeno?: string) => (pequeno ? ["Helvetica", 8.5] : ["Helvetica-Bold", tamanhoDoValor]) as [string, number];
    const altura =
      Math.max(
        ...itens.map(([, v, p]) => {
          const [f, t] = fonte(p);
          return doc.font(f).fontSize(t).heightOfString(paraHelvetica(v) || "-", { width: w - 10 });
        }),
      ) + 20;
    this.cabe(altura);
    itens.forEach(([rotulo, valor, pequeno], i) => {
      const x = this.x + i * (w + vao);
      const [f, t] = fonte(pequeno);
      doc.roundedRect(x, this.y, w, altura, 3).lineWidth(0.6).strokeColor(BORDA).stroke();
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#525252").text(paraHelvetica(rotulo).toUpperCase(), x + 5, this.y + 5, { width: w - 10 });
      doc.font(f).fontSize(t).fillColor("#000000").text(paraHelvetica(valor) || "-", x + 5, this.y + 15, { width: w - 10 });
    });
    this.y += altura;
    doc.strokeColor("#000000");
  }

  /**
   * Uma linha de lista: o nome (e um detalhe pequeno embaixo) à esquerda, o
   * valor (e um detalhe embaixo) à direita, e um fio cinza embaixo.
   */
  linhaComValor({ nome, detalhe, valor, detalheDoValor, tamanho = 10.5 }: { nome: string; detalhe?: string; valor?: string; detalheDoValor?: string; tamanho?: number }) {
    const doc = this.doc;
    const larguraDoValor = 120;
    const w = this.largura - larguraDoValor - 8;
    const n = paraHelvetica(nome);
    const d = paraHelvetica(detalhe);
    doc.font("Helvetica-Bold").fontSize(tamanho);
    let altura = doc.heightOfString(n, { width: w });
    if (d) altura += doc.font("Helvetica").fontSize(tamanho - 2).heightOfString(d, { width: w }) + 1;
    altura = Math.max(altura, detalheDoValor ? tamanho * 2.2 : 0) + 9;
    this.cabe(altura);
    const topo = this.y + 4;
    doc.font("Helvetica-Bold").fontSize(tamanho).fillColor("#000000").text(n, this.x, topo, { width: w });
    if (d) doc.font("Helvetica").fontSize(tamanho - 2).fillColor("#404040").text(d, this.x, doc.y + 1, { width: w });
    if (valor) doc.font("Helvetica-Bold").fontSize(tamanho).fillColor("#000000").text(paraHelvetica(valor), this.x + w + 8, topo, { width: larguraDoValor, align: "right" });
    if (detalheDoValor) doc.font("Helvetica").fontSize(tamanho - 2).fillColor("#404040").text(paraHelvetica(detalheDoValor), this.x + w + 8, doc.y + 1, { width: larguraDoValor, align: "right" });
    this.y += altura;
    this.linha({ cor: "#d4d4d4" });
    doc.fillColor("#000000");
  }

  /** As linhas de assinatura no pé da página (ou da seguinte, se não couber). */
  assinaturas(rotulos: string[]) {
    const doc = this.doc;
    const alturaFixa = this.fundo - 22;
    if (this.y + 34 > alturaFixa) this.continuar();
    const vao = 18;
    const w = (this.largura - vao * (rotulos.length - 1)) / rotulos.length;
    rotulos.forEach((r, i) => {
      const x = this.x + i * (w + vao);
      doc.moveTo(x, alturaFixa).lineTo(x + w, alturaFixa).lineWidth(0.6).strokeColor("#000000").stroke();
      doc.font("Helvetica").fontSize(8.5).fillColor("#000000").text(paraHelvetica(r), x, alturaFixa + 3, { width: w, lineBreak: false });
    });
    this.y = this.fundo;
  }

  terminar(): Promise<Buffer> {
    this.doc.end();
    return this.fim;
  }
}
