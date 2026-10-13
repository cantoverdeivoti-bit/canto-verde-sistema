import { ddmm } from "@/lib/buffet";
import type { DiaDoBuffet, GrupoDoBuffet, PesosDoDia } from "@/lib/buffet-dados";
import { DIAS_DA_SEMANA } from "@/lib/buffet-regras";

import { Folha } from "./folha";

/**
 * A folha da cozinha de um dia em PDF, como `/imprimir/buffet/[data]`
 * (`app/admin/buffet/producao/folha-do-dia.tsx`): uma tabela só, o grupo
 * numa faixa da cor dele, e por posição o número, o prato, a quantidade, a
 * sobra e as alterações (as trocas do dia). O que já foi pesado sai
 * preenchido; o resto fica em branco para anotar à mão.
 */
export async function folhaDoBuffetEmPdf(data: string, dia: DiaDoBuffet | null, grupos: GrupoDoBuffet[], pesos: PesosDoDia): Promise<Buffer> {
  const folha = new Folha({ titulo: `Produção do buffet ${ddmm(data)}`, margem: 20 });
  const doc = folha.doc;
  if (!dia) {
    folha.texto(`Nenhum cardápio vale em ${ddmm(data)}.`, { tamanho: 12 });
    return folha.terminar();
  }
  const titulo = `${DIAS_DA_SEMANA[dia.diaSemana - 1]} ${ddmm(data)}${dia.tema ? ` · ${dia.tema}` : ""}`.toUpperCase();
  folha.nome = titulo;

  // O alto: o dia numa faixa escura e a previsão de clientes ao lado.
  const altura = 22;
  const larguraDoDia = folha.largura * 0.66;
  doc.rect(folha.x, folha.y, larguraDoDia, altura).fill("#262626");
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#ffffff").text(titulo, folha.x, folha.y + 6, { width: larguraDoDia, align: "center", lineBreak: false });
  doc.rect(folha.x + larguraDoDia, folha.y, folha.largura - larguraDoDia, altura).fillAndStroke("#fffbeb", "#737373");
  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor("#000000")
    .text(`Prev. clientes: ${pesos.clientes ?? "______"}`, folha.x + larguraDoDia, folha.y + 7, { width: folha.largura - larguraDoDia, align: "center", lineBreak: false });
  folha.y += altura;

  const kg = (n: number | null | undefined) => (n === null || n === undefined ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
  const linhas: string[][] = [];
  const faixas = new Map<number, string>();
  const trocadas = new Set<number>();
  for (const g of grupos) {
    faixas.set(linhas.length, g.cor);
    linhas.push([g.nome]);
    const doGrupo = dia.itens.filter((i) => i.grupoId === g.id);
    for (let n = 1; n <= g.posicoes; n++) {
      const i = doGrupo.find((x) => x.posicao === n);
      const p = i?.prato ?? null;
      const peso = pesos.porLugar[`${g.id}:${n}`];
      if (i?.trocado) trocadas.add(linhas.length);
      const alteracao = i?.trocado ? `troca${i.noLugarDe ? ` (era ${i.noLugarDe})` : ""}${i.motivo ? `: ${i.motivo}` : ""}` : "";
      linhas.push([String(n), p?.nome ?? "", p ? kg(peso?.kgProduzido) : "", p ? kg(peso?.kgSobra) : "", alteracao]);
    }
  }

  folha.tabela(
    [
      { titulo: "Nº", peso: 7, centro: true },
      { titulo: "Prato", peso: 62 },
      { titulo: "Qtd. (kg)", peso: 22, centro: true },
      { titulo: "Sobra (kg)", peso: 18, centro: true },
      { titulo: "Alterações", peso: 55 },
    ],
    linhas,
    {
      tamanho: 8,
      alturaMinima: 10.5,
      respiro: 2,
      fundoDoCabecalho: "#404040",
      corDoCabecalho: "#ffffff",
      faixa: (i) => faixas.get(i) ?? null,
      negrito: (i) => trocadas.has(i),
    },
  );

  return folha.terminar();
}
