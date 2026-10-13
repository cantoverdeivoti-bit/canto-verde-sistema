import type { Viewport } from "next";

/** A barra do navegador no celular, no verde-escuro do topo do painel. */
export const viewport: Viewport = { themeColor: "#00461e" };

/**
 * Marca esta parte do site como painel: as cores dela são as do painel
 * (`.tema-painel` em app/globals.css), e não as da página de reservas que o
 * cliente vê. `contents` para a marca não mexer em nada do desenho.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="tema-painel contents">{children}</div>;
}
