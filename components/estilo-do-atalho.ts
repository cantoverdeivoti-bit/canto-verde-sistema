/**
 * O desenho do botão de símbolo do painel, o mesmo das abas dos Relatórios:
 * símbolo verde em cima, nome pequeno embaixo, sem caixa em volta (pedido do
 * dono). Num arquivo à parte para servir à grade de atalhos (servidor) e ao
 * botão quadrado (cliente).
 */
export const TILE =
  "flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-center text-[11px] leading-tight font-medium transition sm:text-sm";

/** O símbolo do botão. */
export const ICONE_DO_TILE = "size-5 shrink-0 sm:size-6";

/** O botão em destaque (a ação principal, ou o painel aberto): fundo verde-claro, como a aba aberta. */
export const TILE_EM_DESTAQUE = "bg-[var(--primary-soft)] font-semibold text-[var(--primary)] ring-1 ring-[var(--primary)]/30";
