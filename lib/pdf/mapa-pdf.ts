import { ddmm } from "@/lib/buffet";
import type { DiaDoBuffet, GrupoDoBuffet } from "@/lib/buffet-dados";
import { DIAS_DA_SEMANA, diaDaSemanaBuffet } from "@/lib/buffet-regras";
import type { FormaDaPosicao } from "@/generated/prisma/client";

import { Folha, paraHelvetica } from "./folha";

type Posicao = { grupoId: number; numero: number; forma: FormaDaPosicao; linha: number; coluna: number; largura: number; altura: number };

/**
 * O mapa do buffet de um dia em PDF, numa A4 deitada para colar na parede,
 * como `/imprimir/buffet/[data]/mapa` (`app/admin/buffet/mapa/mapa-do-buffet.tsx`):
 * cada estação no lugar dela (grade de duas colunas, pelos campos `mapa*`
 * do grupo) com a borda da cor dela, e dentro as cubas pelo número, com a
 * forma e o prato do dia. A cuba trocada no dia sai em amarelo.
 *
 * A altura das cubas se ajusta para o mapa caber numa folha só.
 */
export async function mapaDoBuffetEmPdf(data: string, dia: DiaDoBuffet | null, grupos: GrupoDoBuffet[], posicoes: Posicao[]): Promise<Buffer> {
  const titulo = `Mapa do buffet · ${DIAS_DA_SEMANA[diaDaSemanaBuffet(data) - 1]} ${ddmm(data)}${dia?.tema ? ` · ${dia.tema}` : ""}`;
  const folha = new Folha({ titulo, deitado: true, margem: 24 });
  const doc = folha.doc;
  const percurso = [...grupos].sort((a, b) => a.ordem - b.ordem);
  const porLugar = new Map((dia?.itens ?? []).map((i) => [`${i.grupoId}:${i.posicao}`, i]));

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#000000").text(paraHelvetica(titulo).toUpperCase(), folha.x, folha.y, { width: folha.largura, align: "center" });
  folha.y = doc.y + 2;
  folha.texto(`Percurso do cliente, no sentido anti-horário: ${percurso.map((g) => g.nome).join(" -> ")}.`, { tamanho: 8, cor: "#525252" });
  folha.y += 6;

  // Quantas linhas de cubas cada estação tem, e quantas estações por linha da grade.
  const linhasDaEstacao = (g: GrupoDoBuffet) => Math.max(1, ...posicoes.filter((p) => p.grupoId === g.id).map((p) => p.linha + p.altura - 1));
  const linhasDaGrade = [...new Set(percurso.map((g) => g.mapaLinha))].sort((a, b) => a - b);
  const VAO = 8;
  const CABECALHO = 16;
  const ACOLCHOADO = 5;
  const VAO_DA_CUBA = 3;
  // A altura da cuba que faz o mapa caber na folha (no máximo 40 pt).
  const cubasPorLinhaDaGrade = linhasDaGrade.map((l) => Math.max(...percurso.filter((g) => g.mapaLinha === l).map(linhasDaEstacao)));
  const fixo = linhasDaGrade.length * (CABECALHO + ACOLCHOADO * 2) + (linhasDaGrade.length - 1) * VAO + cubasPorLinhaDaGrade.reduce((s, n) => s + (n - 1) * VAO_DA_CUBA, 0);
  const totalDeCubas = cubasPorLinhaDaGrade.reduce((s, n) => s + n, 0);
  const cuba = Math.max(18, Math.min(40, (folha.fundo - folha.y - fixo) / Math.max(1, totalDeCubas)));
  const metade = (folha.largura - VAO) / 2;

  let topo = folha.y;
  linhasDaGrade.forEach((l, li) => {
    const alturaDaLinha = CABECALHO + ACOLCHOADO * 2 + cubasPorLinhaDaGrade[li] * cuba + (cubasPorLinhaDaGrade[li] - 1) * VAO_DA_CUBA;
    for (const g of percurso.filter((x) => x.mapaLinha === l)) {
      const x = folha.x + (g.mapaColuna - 1) * (metade + VAO);
      const w = g.mapaLargura >= 2 ? folha.largura : metade;
      doc.roundedRect(x, topo, w, alturaDaLinha, 6).lineWidth(1.5).strokeColor(g.cor).stroke();
      doc.font("Helvetica-Bold").fontSize(8).fillColor(g.cor).text(paraHelvetica(g.nome).toUpperCase(), x + ACOLCHOADO + 2, topo + 5, { width: w - 14, characterSpacing: 0.5, lineBreak: false });

      const colunas = Math.max(1, g.mapaColunas);
      const larguraDaCuba = (w - ACOLCHOADO * 2 - (colunas - 1) * VAO_DA_CUBA) / colunas;
      for (const p of posicoes.filter((x) => x.grupoId === g.id)) {
        const cx = x + ACOLCHOADO + (p.coluna - 1) * (larguraDaCuba + VAO_DA_CUBA);
        const cy = topo + CABECALHO + ACOLCHOADO + (p.linha - 1) * (cuba + VAO_DA_CUBA);
        const cw = larguraDaCuba * p.largura + VAO_DA_CUBA * (p.largura - 1);
        const ch = cuba * p.altura + VAO_DA_CUBA * (p.altura - 1);
        const item = porLugar.get(`${g.id}:${p.numero}`);
        doc.lineWidth(1.2).strokeColor(g.cor).fillColor(item?.trocado ? "#fef3c7" : "#ffffff");
        if (p.forma === "OVAL") doc.ellipse(cx + cw / 2, cy + ch / 2, cw / 2, ch / 2).fillAndStroke();
        else doc.roundedRect(cx, cy, cw, ch, p.forma === "CIRCULO" ? Math.min(cw, ch) / 2 : 3).fillAndStroke();

        const nome = dia ? paraHelvetica(item?.prato?.nome ?? "vazia") : "";
        doc.font("Helvetica-Bold").fontSize(8).fillColor(g.cor);
        const alturaDoNumero = 9;
        doc.font("Helvetica").fontSize(6.5);
        const alturaDoNome = nome ? Math.min(doc.heightOfString(nome, { width: cw - 6 }), ch - alturaDoNumero - 3) : 0;
        const inicio = cy + (ch - alturaDoNumero - alturaDoNome) / 2;
        doc.font("Helvetica-Bold").fontSize(8).fillColor(g.cor).text(String(p.numero), cx, inicio, { width: cw, align: "center", lineBreak: false });
        if (nome) {
          doc
            .font("Helvetica")
            .fontSize(6.5)
            .fillColor(item?.prato ? "#000000" : "#737373")
            .text(nome, cx + 3, inicio + alturaDoNumero, { width: cw - 6, height: Math.max(alturaDoNome, 7), align: "center", ellipsis: true });
        }
      }
    }
    topo += alturaDaLinha + VAO;
  });
  doc.fillColor("#000000").strokeColor("#000000");

  return folha.terminar();
}
