import { NOME_DA_AREA, diaDaSemana, quemNaCelula, somarDias, type Area } from "@/lib/escala";
import type { carregarSemana } from "@/lib/escala-do-banco";

import { Folha } from "./folha";

const DIA = ["DOMINGO", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * A escala da semana em PDF, numa A4 deitada, como `/imprimir/escala`: no
 * desenho da planilha de sempre, Cozinha e Salão com os postos nas linhas e
 * os dias nas colunas, e a folga (e as férias, quando há) embaixo.
 */
export async function escalaEmPdf(segunda: string, casa: string, { semana, postos, pessoas }: Awaited<ReturnType<typeof carregarSemana>>): Promise<Buffer> {
  const titulo = `Escala do almoço · ${casa} · ${ddmm(segunda)} a ${ddmm(somarDias(segunda, 6))}`;
  const folha = new Folha({ titulo, deitado: true, margem: 24 });
  folha.nome = titulo;
  const nome = (id: number) => pessoas.find((p) => p.id === id)?.nome ?? "";
  const colunas = [{ titulo: "Posto", peso: 1.3 }, ...semana.dias.map((d) => ({ titulo: `${DIA[diaDaSemana(d)]} ${ddmm(d)}`, peso: 1, centro: true }))];

  folha.doc.font("Helvetica-Bold").fontSize(15).text(titulo, folha.x, folha.y, { width: folha.largura, align: "center" });
  folha.y = folha.doc.y + 6;

  for (const area of ["COZINHA", "SALAO"] as Area[]) {
    const doArea = postos.filter((p) => p.area === area);
    if (doArea.length === 0) continue;
    folha.secao(NOME_DA_AREA[area]);
    folha.tabela(
      colunas,
      doArea.map((p) => [p.nome, ...semana.celulas.get(p.id)!.map((c) => (c.fechado ? "FECHADO" : (quemNaCelula(semana, pessoas, c) ?? "")))]),
      { tamanho: 8.5, negrito: () => false },
    );
  }

  folha.y += 8;
  const linhas = [["FOLGA", ...semana.folgas.map((ids) => ids.map(nome).join(", "))]];
  if (semana.deFerias.some((f) => f.length > 0)) linhas.push(["FÉRIAS", ...semana.deFerias.map((ids) => ids.map(nome).join(", "))]);
  folha.tabela(colunas, linhas, { tamanho: 8.5, cabecalho: false });

  return folha.terminar();
}
