import type { Viewport } from "next";

/**
 * As folhas de imprimir têm a largura do papel, e não a da tela.
 *
 * No celular, o Chrome do Android monta a impressão (e o "Salvar como PDF")
 * na largura da tela do aparelho, uns 400 px, e a folha A4 pede 718 px
 * (190 mm de área útil). A ficha saía encolhida no meio do papel, com
 * sobra dos dois lados. Com a largura fixa aqui, a folha preenche o papel,
 * e na tela do celular ela aparece inteira, como uma prévia.
 *
 * As folhas deitadas (escala, mapa do buffet) pedem a largura delas na
 * própria página: 277 mm, 1047 px.
 */
// `initialScale` vazio de propósito: o Next põe 1 sozinho, e com ele o
// celular abriria a folha ampliada, cortada dos lados, em vez de inteira.
export const viewport: Viewport = { width: 718, initialScale: undefined };

export default function ImprimirLayout({ children }: LayoutProps<"/imprimir">) {
  return children;
}
