/**
 * O endereço do PDF de cada folha: o da folha de `/imprimir/...` com
 * `/pdf/` no lugar. A rota `app/pdf/[...caminho]/route.ts` desenha a folha
 * com o pdfkit (`lib/pdf/`), sem navegador: no Android, imprimir pela janela
 * do aparelho encolhia a folha no meio do papel, e o PDF pronto não depende
 * do celular. O checklist tem rota própria, `/imprimir/operacional/checklist`.
 */

/** "/imprimir/receituario/425B?tipo=tecnica" → "/pdf/receituario/425B?tipo=tecnica". */
export function pdfDe(caminho: string): string {
  return caminho.replace(/^\/imprimir\//, "/pdf/");
}

/** O nome do arquivo, do caminho da folha: "receituario-425b.pdf", "receituario-salada.pdf", "escala-2026-10-12.pdf". */
export function nomeDoPdf(segmentos: string[], busca: URLSearchParams): string {
  const partes = [...segmentos];
  // O filtro entra no nome: a escala da semana pedida, as fichas da
  // categoria, a lista de preços do canal, e a técnica se diferencia da
  // operacional.
  for (const filtro of ["semana", "categoria", "operacao", "canal"]) {
    const valor = busca.get(filtro);
    if (valor) partes.push(valor);
  }
  if (busca.get("tipo") === "tecnica") partes.push("tecnica");
  const nome = partes
    .join("-")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${nome || "folha"}.pdf`;
}
