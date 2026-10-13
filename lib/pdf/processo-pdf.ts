import { Folha, paraHelvetica } from "./folha";

/** A data do banco (só dia, em UTC) como "aaaa-mm-dd", sem passar pelo `lib/availability`, que abre o banco. */
const dia = (d: Date) => d.toISOString().slice(0, 10);

type Processo = {
  titulo: string;
  objetivo: string | null;
  passos: string[];
  observacoes: string | null;
  revisadoEm: Date | null;
  obrigatorio: { funcao: { nome: string } }[];
};

/** O processo em PDF, como `/imprimir/operacional/processo/[id]`: título, objetivo, os passos numerados e as observações. */
export async function processoEmPdf(p: Processo): Promise<Buffer> {
  const folha = new Folha({ titulo: p.titulo, margem: 34 });
  const doc = folha.doc;
  folha.nome = p.titulo;
  folha.texto(p.titulo, { tamanho: 17, negrito: true });
  const para = p.obrigatorio.length > 0 ? `Para: ${p.obrigatorio.map((o) => o.funcao.nome).join(", ")} · ` : "";
  folha.texto(`${para}${p.revisadoEm ? `Revisado em ${dia(p.revisadoEm).split("-").reverse().join("/")}` : "Sem revisão"}`, { tamanho: 9, antes: 2 });
  folha.y += 4;
  folha.linha({ espessura: 1.5 });
  folha.y += 6;

  if (p.objetivo) {
    folha.texto("Objetivo", { tamanho: 11, negrito: true, antes: 4 });
    folha.texto(p.objetivo, { tamanho: 10.5, antes: 2 });
  }
  folha.texto("Passo a passo", { tamanho: 11, negrito: true, antes: 10 });
  folha.y += 3;
  p.passos.forEach((passo, i) => {
    const texto = paraHelvetica(passo);
    doc.font("Helvetica").fontSize(10.5);
    const altura = doc.heightOfString(texto, { width: folha.largura - 26 });
    folha.cabe(altura + 5);
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#000000").text(`${i + 1}.`, folha.x, folha.y, { width: 20, align: "right" });
    doc.font("Helvetica").fontSize(10.5).text(texto, folha.x + 26, folha.y, { width: folha.largura - 26 });
    folha.y = doc.y + 5;
  });
  if (p.observacoes) {
    folha.texto("Observações", { tamanho: 11, negrito: true, antes: 8 });
    folha.texto(p.observacoes, { tamanho: 10.5, antes: 2 });
  }
  return folha.terminar();
}
