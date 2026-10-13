import { Suspense } from "react";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";

import { AbasDosRelatorios } from "./abas";

/**
 * A casca dos relatórios: o título e as oito abas. Cada aba é uma página
 * própria, com endereço próprio — dá para guardar "consumo de setembro" nos
 * favoritos e voltar nele.
 */
export default function RelatoriosLayout({ children }: LayoutProps<"/admin/compras/relatorios">) {
  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina titulo="Relatórios" />
      {/* As abas leem o endereço (para levar o período junto), e isso pede
          uma fronteira de Suspense acima delas. */}
      <Suspense fallback={<div className="h-10" />}>
        <AbasDosRelatorios />
      </Suspense>
      {/* Sem cartão em volta: cada aba desenha os seus sobre o fundo cinza (o
          filtro e um cartão por assunto). Um cartão branco gigante com tudo
          dentro deixava o filtro, os números e as tabelas sem separação. */}
      {children}
    </Pagina>
  );
}
