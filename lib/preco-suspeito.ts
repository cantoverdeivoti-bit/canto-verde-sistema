/**
 * A oferta que parece o preço do kg digitado no campo da caixa.
 *
 * O engano era sempre o mesmo: o fornecedor punha R$ 36,50 (o kg) e marcava
 * "pacote de 20 kg", e a conta dividia de novo, R$ 1,83 o kg. A oferta
 * ganhava a coroa de menor e a escolha automática sem merecer. O link agora
 * pede o preço da unidade, mas as ofertas já gravadas continuam assim, e
 * engano novo sempre pode aparecer.
 *
 * Suspeita é a oferta em embalagem (com mais de uma unidade dentro) cujo
 * preço da unidade fica abaixo da metade da referência: a mediana das outras
 * ofertas do item ou, sem outras, a última compra. Mediana e não média: uma
 * segunda oferta errada não puxa a régua para baixo.
 *
 * Uma regra só para a tela (o selo e a coroa) e para o servidor ("Escolher
 * os melhores"), para os dois nunca discordarem.
 */

/** Abaixo desta fração da referência, a oferta pede conferência. */
export const FRACAO_SUSPEITA = 0.5;

export type OfertaParaConferir = {
  id: number;
  precoUnitario: number;
  /** Quanto da unidade da casa vem na embalagem. Nulo nas ofertas antigas. */
  conteudo: number | null;
};

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/** Os ids das ofertas suspeitas de um item. `ofertas`: só as que ofereceram. */
export function ofertasSuspeitas(ofertas: OfertaParaConferir[], ultimaCompra: number | null): Set<number> {
  const validas = ofertas.filter((o) => o.precoUnitario > 0);
  const suspeitas = new Set<number>();
  for (const o of validas) {
    // Sem embalagem (ou com uma unidade só dentro) não há o que dividir errado.
    if (o.conteudo === null || o.conteudo <= 1) continue;
    const outros = validas.filter((x) => x.id !== o.id).map((x) => x.precoUnitario);
    const referencia = outros.length > 0 ? mediana(outros) : ultimaCompra;
    if (referencia !== null && referencia > 0 && o.precoUnitario < referencia * FRACAO_SUSPEITA) {
      suspeitas.add(o.id);
    }
  }
  return suspeitas;
}
