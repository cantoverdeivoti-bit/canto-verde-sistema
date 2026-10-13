import Link from "next/link";

import { IndicadorDeLink } from "@/components/indicador-de-link";

import { IconeNav } from "@/components/icone-nav";
import type { NomeDoIcone } from "@/lib/modules";

/**
 * As funções do dia a dia de Compras, na ordem de Movimentações no menu
 * (`lib/modules.ts`): contar, requisitar, cotar, pedir, mandar, receber.
 *
 * Pelo link de atalhos aparecem só os de `DO_LINK`, as telas que
 * `CAMINHOS_DO_ATALHO` (`lib/auth.config.ts`) libera: um cartão de tela que
 * não abre levaria quem entrou pelo link de volta para esta página.
 */
export const ATALHOS: { href: string; titulo: string; detalhe: string; icone: NomeDoIcone }[] = [
  { href: "/admin/compras/contagem", titulo: "Contar estoque", detalhe: "A contagem do dia", icone: "contagem" },
  { href: "/admin/compras/listas", titulo: "Compras de rotina", detalhe: "O que se pede toda semana", icone: "listas" },
  { href: "/admin/compras/cotacao", titulo: "Fazer cotação", detalhe: "Comparar os preços", icone: "cotacao" },
  { href: "/admin/compras/pedido-manual", titulo: "Pedido manual", detalhe: "Comprar fora da contagem", icone: "manual" },
  { href: "/admin/compras/pedidos", titulo: "Pedidos", detalhe: "Mandar e acompanhar", icone: "pedidos" },
  { href: "/admin/compras/recebimentos", titulo: "Receber pedidos", detalhe: "Conferir o que chegou", icone: "recebimentos" },
];

/**
 * Os cadastros: só na página de atalhos de quem está logado. O link sem login
 * NÃO os abre (não estão em `CAMINHOS_DO_ATALHO`), de propósito — quem tivesse
 * o link poderia editar e desativar produto e fornecedor.
 */
const CADASTROS: typeof ATALHOS = [
  { href: "/admin/compras", titulo: "Produtos", detalhe: "Estoque, ideal e fornecedores de cada item", icone: "produtos" },
  { href: "/admin/compras/categorias", titulo: "Categorias", detalhe: "Como os produtos se agrupam", icone: "categorias" },
  { href: "/admin/compras/fornecedores", titulo: "Fornecedores", detalhe: "Contato, entrega e o que cada um atende", icone: "fornecedores" },
];

/**
 * O que o link de atalhos (sem login) abre: contar, Requisições e receber
 * (decisão do dono). Os outros cartões levariam de volta para os atalhos.
 */
const DO_LINK = new Set(["/admin/compras/contagem", "/admin/compras/listas", "/admin/compras/recebimentos"]);

/** Os cartões de atalho em grade, três por linha no celular. */
export function CartoesDeAtalho({ comCadastros = false, peloLink = false }: { comCadastros?: boolean; peloLink?: boolean }) {
  return (
    <div className="space-y-6">
      <GradeDeAtalhos itens={peloLink ? ATALHOS.filter((a) => DO_LINK.has(a.href)) : ATALHOS} />
      {comCadastros && (
        <section className="space-y-2.5">
          <h2 className="section-label">Cadastros</h2>
          <GradeDeAtalhos itens={CADASTROS} />
        </section>
      )}
    </div>
  );
}

/**
 * A grade de botões quadrados, ícone em cima e nome embaixo, como os apps de
 * banco: o polegar acha a função pelo desenho, sem ler uma lista. Três por
 * linha cabem no celular com o nome inteiro; `colunas` abre mais no
 * computador. O `detalhe`, quando há, vai no `title`: na grade só cabe o nome.
 */
export function GradeDeAtalhos({
  itens,
  colunas = "",
}: {
  /** `numero`: o que espera alguém (Pendências), no canto do cartão. */
  itens: { href: string; titulo: string; detalhe?: string; icone: NomeDoIcone; numero?: number }[];
  colunas?: string;
}) {
  return (
    <ul className={`grid grid-cols-3 gap-3 ${colunas}`}>
      {itens.map((a) => (
        <li key={a.href} className="min-w-0">
          <Link
            href={a.href}
            title={a.detalhe}
            className="relative flex h-full min-h-28 flex-col items-center justify-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-4 text-center hover:border-[var(--primary)] active:bg-[var(--muted)]"
          >
            <IconeNav nome={a.icone} className="size-8 text-[var(--primary)]" />
            <span className="text-[15px] leading-tight font-medium">{a.titulo}</span>
            <span className="absolute top-2 right-2 flex">
              <IndicadorDeLink />
            </span>
            {a.numero !== undefined && a.numero > 0 && (
              <span className="absolute top-1.5 left-1.5 inline-flex min-w-6 items-center justify-center rounded-full bg-[var(--botao)] px-1.5 text-xs leading-6 font-semibold text-[var(--botao-texto)]">
                {a.numero}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
