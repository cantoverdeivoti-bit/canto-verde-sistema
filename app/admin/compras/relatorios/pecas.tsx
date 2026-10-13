/**
 * As peças que os relatórios repetem: o número grande e a barra.
 *
 * Uma cor só — a da casa. Nenhum gráfico daqui compara séries entre si: cada
 * um mostra UMA medida (gasto) repartida, e cor extra só faria o olho procurar
 * uma legenda que não existe. O valor vai sempre escrito ao lado da barra: a
 * barra dá a proporção de relance, o número dá a resposta.
 */

export function NumeroGrande({
  valor,
  rotulo,
  detalhe,
}: {
  valor: string;
  rotulo: string;
  detalhe?: React.ReactNode;
}) {
  return (
    <div
      className="flex min-w-0 flex-col gap-1 rounded-lg px-4 py-3"
      style={{ background: "color-mix(in srgb, var(--primary) 8%, transparent)" }}
    >
      <span className="text-xs font-medium text-[var(--muted-foreground)]">{rotulo}</span>
      <span className="num-display text-3xl leading-none text-[var(--primary)]">{valor}</span>
      {detalhe && <span className="text-xs text-[var(--muted-foreground)]">{detalhe}</span>}
    </div>
  );
}

// A barra virou componente de cliente (toque abre a dica); segue saindo daqui.
export { Barras } from "./barras";

/**
 * A tabela dentro de um CartaoDeSecao vai de ponta a ponta (`-mx-4` em volta):
 * os fios das linhas encostam nas bordas do cartão, como na `Lista`, em vez de
 * virar uma caixa com borda dentro da outra. A primeira e a última coluna
 * ganham de volta o recuo do cartão, para o texto alinhar com o resto dele.
 */
export const COLUNAS_NA_BORDA =
  "[&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4";

/** "12,5%" — uma casa, vírgula. */
export function pctTexto(n: number) {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}
