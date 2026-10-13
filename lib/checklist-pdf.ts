import PDFDocument from "pdfkit";

import { DIAS_DA_FOLHA } from "@/lib/operacional-regras";

/**
 * A folha de checklist em PDF (A4 em pé), com pdfkit, para baixar e mandar
 * ou imprimir depois: a mesma folha da planilha da casa, uma por
 * subdepartamento, a abertura e o fechamento em tabelas com um quadradinho
 * por dia. Folha comprida continua na página seguinte, com o cabeçalho da
 * tabela repetido. Sem banco: quem chama passa as folhas já filtradas.
 */

export type FolhaDoPdf = {
  titulo: string;
  momentos: { chave: string; nome: string; tarefas: { id: number; texto: string }[] }[];
};

const MARGEM = 30;
const LARGURA = 595.28 - MARGEM * 2;
const FUNDO = 841.89 - MARGEM;
const DIA = 28.35; // 10 mm por quadradinho
const TAREFA = LARGURA - DIA * DIAS_DA_FOLHA.length;
const CINZA = "#d4d4d4";

/**
 * A Helvetica do PDF só tem o Latin-1: troca as aspas e o travessão do
 * celular e tira o resto (emoji), que sairia como lixo.
 */
function paraHelvetica(t: string) {
  return t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\u0000-ÿ]/g, "")
    .trim();
}

export async function checklistEmPdf(folhas: FolhaDoPdf[], casa: string): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: MARGEM, bottom: MARGEM, left: MARGEM, right: MARGEM },
    info: { Title: folhas.length === 1 ? `Checklist ${paraHelvetica(folhas[0].titulo)}` : "Checklists", Author: "Canto Verde" },
  });
  const partes: Buffer[] = [];
  doc.on("data", (p: Buffer) => partes.push(p));
  const pronto = new Promise<Buffer>((ok) => doc.on("end", () => ok(Buffer.concat(partes))));
  doc.lineWidth(0.75).strokeColor("#000000").fillColor("#000000");

  if (folhas.length === 0) {
    doc.font("Helvetica").fontSize(12).text("Nenhuma tarefa para imprimir.", MARGEM, MARGEM);
  }

  folhas.forEach((f, i) => {
    if (i > 0) doc.addPage();
    let y = MARGEM;

    // O topo: o nome da folha e a casa à esquerda, a semana à direita.
    doc.font("Helvetica-Bold").fontSize(10).text("Semana: ____/____ a ____/____", MARGEM, y + 8, { width: LARGURA, align: "right" });
    doc.font("Helvetica-Bold").fontSize(16).text(paraHelvetica(f.titulo).toUpperCase(), MARGEM, y, { width: LARGURA - 190 });
    doc.font("Helvetica").fontSize(9).text(paraHelvetica(casa), MARGEM, doc.y + 1, { width: LARGURA - 190 });
    y = doc.y + 4;
    doc.moveTo(MARGEM, y).lineTo(MARGEM + LARGURA, y).lineWidth(1.5).stroke().lineWidth(0.75);
    y += 12;

    // Página que continua a folha: o nome em cima, para não misturar ao imprimir.
    const continuar = () => {
      doc.addPage();
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text(`${paraHelvetica(f.titulo).toUpperCase()} (continuação)`, MARGEM, MARGEM, { width: LARGURA });
      y = doc.y + 6;
    };

    const cabecalho = (nome: string) => {
      const altura = 18;
      doc.rect(MARGEM, y, LARGURA, altura).fillAndStroke(CINZA, "#000000");
      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(10).text(paraHelvetica(nome).toUpperCase(), MARGEM + 5, y + 5, { width: TAREFA - 10, lineBreak: false });
      doc.fontSize(8);
      DIAS_DA_FOLHA.forEach((d, k) => {
        const x = MARGEM + TAREFA + DIA * k;
        doc.moveTo(x, y).lineTo(x, y + altura).stroke();
        doc.text(d, x, y + 6, { width: DIA, align: "center", lineBreak: false });
      });
      y += altura;
    };

    for (const m of f.momentos) {
      if (y + 18 * 2 > FUNDO) continuar();
      cabecalho(m.nome);
      for (const t of m.tarefas) {
        const texto = paraHelvetica(t.texto);
        doc.font("Helvetica").fontSize(10);
        const altura = Math.max(18, doc.heightOfString(texto, { width: TAREFA - 10 }) + 7);
        if (y + altura > FUNDO) {
          continuar();
          cabecalho(m.nome);
          doc.font("Helvetica").fontSize(10);
        }
        doc.rect(MARGEM, y, LARGURA, altura).stroke();
        doc.text(texto, MARGEM + 5, y + 4, { width: TAREFA - 10 });
        DIAS_DA_FOLHA.forEach((_, k) => {
          const x = MARGEM + TAREFA + DIA * k;
          doc.moveTo(x, y).lineTo(x, y + altura).stroke();
        });
        y += altura;
      }
      y += 12;
    }

    // As assinaturas no fim da folha.
    if (y + 50 > FUNDO) continuar();
    y += 26;
    const metade = (LARGURA - 24) / 2;
    doc.font("Helvetica").fontSize(10);
    [
      ["Responsável", MARGEM],
      ["Conferido por", MARGEM + metade + 24],
    ].forEach(([rotulo, x]) => {
      doc.moveTo(x as number, y).lineTo((x as number) + metade, y).stroke();
      doc.text(rotulo as string, x as number, y + 3, { width: metade, lineBreak: false });
    });
  });

  doc.end();
  return pronto;
}
