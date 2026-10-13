import Link from "next/link";

/**
 * 1 Contar estoque › 2 Conferir lista › 3 Enviar › 4 Comparar preços ›
 * 5 Receber, no alto das telas da compra.
 *
 * "Enviar" juntou o que eram dois passos — chamar fornecedores e enviar
 * pedidos — numa página só, dividida na ordem de mandar: primeiro os
 * exclusivos, depois o atacado, depois o convite da cotação. Os pedidos dos
 * vencedores da cotação voltam para a mesma página, no fim.
 *
 * São a mesma semana de compra e ninguém dizia isso. Quem montava a cotação
 * caía numa tela sem caminho de volta: a lista de itens tinha ido, a contagem
 * estava dois cliques atrás pelo menu lateral, e a única pista de que as
 * etapas se ligavam era o selo do carrinho na lista de contagens.
 *
 * Voltar para a lista de itens funciona dos dois lados, por endereços
 * diferentes. Antes de montar, `?c=20,22` calcula `ideal − contado`. Depois,
 * `?cotacao=13` RELÊ os números guardados em `CotacaoItem` — recalcular ali
 * daria os números de hoje, com o estoque ideal que possa ter mudado no meio,
 * e a tela pareceria o registro do que foi pedido sendo outra coisa.
 *
 * Comparar preços continua com página própria, separada de Enviar: chamar
 * fornecedor se faz uma vez; comparar se faz a semana inteira, e a lista de
 * fornecedores por cima do mapa de preços o empurrava para fora da tela.
 *
 * O passo fica sem link só quando não há para onde ir: na lista de contagens,
 * onde a seleção ainda não foi feita, e em Comparar preços antes de a
 * cotação existir.
 *
 * Numa rodada 100% exclusiva, "Lista de itens" também fica sem link: a
 * contagem já virou pedido, e `conferir/page.tsx` recusa contagem gasta.
 * Mandar para lá seria mandar para um recado de porta fechada.
 *
 * Componente de servidor: é só texto e links, e nenhuma das telas precisa que
 * ele reaja a nada.
 */
export function FluxoCompra({
  etapa,
  contagemIds,
  cotacaoId,
  pedidosDiretos = 0,
}: {
  etapa: "contagem" | "itens" | "enviar" | "cotacao" | "receber";
  /** As contagens da rodada. É o que faz os passos do meio terem endereço. */
  contagemIds?: number[];
  cotacaoId?: number | null;
  /** Quantos pedidos diretos esta rodada gerou. */
  pedidosDiretos?: number;
}) {
  const daCotacao = cotacaoId == null ? undefined : `/admin/compras/cotacao/${cotacaoId}`;
  const daRodada =
    contagemIds !== undefined && contagemIds.length > 0 ? contagemIds.join(",") : undefined;

  /* A rodada foi gasta só em pedido direto: virou compra sem virar cotação.
     A lista de itens não aceita contagem gasta, então o passo dela perde o
     endereço em vez de prometer uma tela que recusa. */
  const soDireta = cotacaoId == null && pedidosDiretos > 0;

  /* Enviar é uma página só para a rodada inteira: os pedidos dos exclusivos,
     o atacado, o convite da cotação e, depois de comparar, os pedidos dos
     vencedores. A cotação diz qual é a rodada; sem ela, as contagens. */
  const enviarHref =
    cotacaoId != null
      ? `/admin/compras/enviar?cotacao=${cotacaoId}`
      : daRodada !== undefined
        ? `/admin/compras/enviar?c=${daRodada}`
        : undefined;

  // Os cinco passos da semana de compra, numerados, na ordem em que se fazem.
  const passos = [
    {
      chave: "contagem",
      nome: "Contar estoque",
      href: "/admin/compras/contagem",
      titulo: "A lista de contagens",
    },
    {
      chave: "itens",
      nome: "Conferir lista",
      href:
        cotacaoId != null
          ? `/admin/compras/conferir?cotacao=${cotacaoId}`
          : soDireta || daRodada === undefined
            ? undefined
            : `/admin/compras/conferir?c=${daRodada}`,
      titulo:
        cotacaoId != null
          ? "Voltar e corrigir o que vai ser comprado"
          : soDireta
            ? "A lista já virou pedido"
            : "Ver e ajustar o que vai ser comprado",
    },
    {
      chave: "enviar",
      nome: "Enviar",
      href: enviarHref,
      titulo: "Mandar os pedidos dos exclusivos e o link da cotação",
    },
    {
      chave: "cotacao",
      nome: "Comparar preços",
      href: daCotacao,
      titulo:
        daCotacao !== undefined
          ? "Comparar os preços e escolher de quem comprar"
          : soDireta
            ? "Esta rodada não teve o que cotar"
            : "Nasce quando você terminar a conferência",
    },
    {
      chave: "receber",
      nome: "Receber",
      href: "/admin/compras/recebimentos",
      titulo: "Conferir o que chegou",
    },
  ];

  const atual = passos.findIndex((p) => p.chave === etapa);

  return (
    <nav aria-label="Etapas da compra">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-xs">
        {passos.map((p, i) => {
          const feito = i < atual;
          const aqui = i === atual;
          const bolinha = `inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
            aqui
              ? "bg-[var(--botao)] text-[var(--botao-texto)]"
              : feito
                ? "bg-[var(--ok-soft)] text-[var(--ok-strong)]"
                : "border border-[var(--border)] text-[var(--muted-foreground)]"
          }`;
          // No celular só o passo atual leva o nome; os outros ficam no
          // número, e a trilha cabe numa linha. Do sm para cima, todos.
          const nome = (
            <span className={aqui ? "font-semibold" : "hidden sm:inline"}>{p.nome}</span>
          );
          const conteudo = (
            <>
              <span className={bolinha}>{feito ? "✓" : i + 1}</span>
              {nome}
            </>
          );
          return (
            <li key={p.chave} className="flex items-center gap-x-1">
              {i > 0 && (
                <span aria-hidden className="px-0.5 text-[var(--muted-foreground)]">
                  ›
                </span>
              )}
              {aqui ? (
                <span aria-current="step" className="inline-flex items-center gap-1.5">
                  {conteudo}
                </span>
              ) : p.href ? (
                <Link
                  href={p.href}
                  title={p.titulo}
                  className={`-my-1 inline-flex items-center gap-1.5 rounded-full py-1 pr-1.5 underline-offset-4 hover:underline ${
                    feito ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {conteudo}
                </Link>
              ) : (
                <span title={p.titulo} className="inline-flex items-center gap-1.5 text-[var(--muted-foreground)] opacity-60">
                  {conteudo}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
