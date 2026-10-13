import { notFound } from "next/navigation";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { SEM_CATEGORIA, UNIT_LABEL, formatAmount, formatMoney } from "@/lib/format";
import { ultimoCustoPorProduto } from "@/lib/historico";

import { AcoesDaLista } from "./acoes-da-lista";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lista de compra — Compras" };

/**
 * O pedido como lista de compra: produto e quantidade, sem preço.
 *
 * É o caminho do exclusivo que a casa compra por conta — o fornecedor
 * exclusivo é o mercado ou o atacado, e o pedido direto que nasce da
 * contagem vira a lista que se leva no bolso. Copiar manda para o WhatsApp
 * de quem vai comprar; imprimir dá a folha.
 *
 * Na ordem da despensa (a `sortOrder` da categoria, depois o nome), a mesma
 * da contagem: quem anda pelo mercado com a lista acha as coisas na sequência
 * em que a casa pensa nelas.
 */
export default async function ListaDoPedidoPage({
  params,
}: PageProps<"/admin/compras/pedidos/[id]/lista">) {
  await guardModule("compras", { atalho: true });

  const { id } = await params;
  const pedidoId = Number(id);
  if (!Number.isInteger(pedidoId)) notFound();

  const pedido = await prisma.pedidoCompra.findUnique({
    where: { id: pedidoId },
    include: {
      fornecedor: { select: { name: true, compraNoAtacado: true } },
      itens: {
        include: {
          produto: {
            select: {
              name: true,
              unit: true,
              category: { select: { name: true, sortOrder: true } },
            },
          },
        },
      },
    },
  });
  if (!pedido) notFound();

  /* No atacado a lista leva o valor estimado: o congelado quando o pedido
     nasceu e, para item posto depois à mão, o último custo de agora. */
  const atacado = pedido.fornecedor.compraNoAtacado;
  const ultimo = atacado
    ? await ultimoCustoPorProduto(pedido.itens.filter((i) => i.precoEstimado === null).map((i) => i.produtoId))
    : new Map<number, { valor: number }>();

  const itens = pedido.itens
    .map((i) => ({
      estimado: atacado
        ? (() => {
            const unitario = i.precoUnitario?.toNumber() ?? i.precoEstimado?.toNumber() ?? ultimo.get(i.produtoId)?.valor;
            return unitario === undefined ? null : unitario * i.quantidadeSolicitada.toNumber();
          })()
        : null,
      nome: i.produto.name,
      quantidade: `${formatAmount(i.quantidadeSolicitada.toNumber())} ${UNIT_LABEL[i.produto.unit]}`,
      categoria: i.produto.category?.name ?? SEM_CATEGORIA,
      ordem: i.produto.category?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));

  const porCategoria = new Map<string, typeof itens>();
  for (const i of itens) {
    if (!porCategoria.has(i.categoria)) porCategoria.set(i.categoria, []);
    porCategoria.get(i.categoria)!.push(i);
  }

  const totalEstimado = itens.reduce((s, i) => s + (i.estimado ?? 0), 0);

  const texto = [
    `Lista de compra — ${pedido.fornecedor.name}`,
    "",
    ...[...porCategoria].flatMap(([categoria, lista]) => [
      `*${categoria}*`,
      ...lista.map(
        (i) => `- ${i.quantidade} ${i.nome}${i.estimado === null ? "" : ` — ≈ ${formatMoney(i.estimado)}`}`,
      ),
      "",
    ]),
    ...(atacado && totalEstimado > 0 ? [`*Total estimado: ≈ ${formatMoney(totalEstimado)}*`] : []),
  ]
    .join("\n")
    .trim();

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        voltar={{ href: `/admin/compras/pedidos/${pedido.id}`, texto: `Pedido #${pedido.id}` }}
        titulo="Lista de compra"
        subtitulo={
          <>
            {pedido.fornecedor.name}
            {atacado && " · valores estimados pela última compra"}
          </>
        }
      />

      {/* Some na impressão: a folha é só a lista. Os quadrados ficam depois
          do topo, como nas outras telas; antes dele apareciam presos acima da
          faixa verde. */}
      <AcoesDaLista texto={texto} />

      {[...porCategoria].map(([categoria, lista]) => (
        <section key={categoria} className="break-inside-avoid">
          <h2 className="border-b border-[var(--foreground)]/30 pb-1 text-sm font-semibold uppercase tracking-wide">
            {categoria}
          </h2>
          <ul className="mt-1">
            {lista.map((i) => (
              <li
                key={i.nome}
                className="flex items-baseline gap-3 border-b border-dashed border-[var(--border)] py-2 text-base"
              >
                {/* O quadradinho de riscar, que é para isso que a folha serve. */}
                <span aria-hidden className="inline-block size-4 shrink-0 border border-[var(--foreground)]/60" />
                <span className="num-display w-20 shrink-0 font-semibold">{i.quantidade}</span>
                <span className="min-w-0 flex-1">{i.nome}</span>
                {atacado && (
                  <span className="num-display shrink-0 text-sm text-[var(--muted-foreground)]">
                    {i.estimado === null ? "—" : `≈ ${formatMoney(i.estimado)}`}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {atacado && totalEstimado > 0 && (
        <p className="flex items-baseline justify-between border-t-2 border-[var(--foreground)]/30 pt-2 text-base font-semibold">
          <span>Total estimado</span>
          <span className="num-display">≈ {formatMoney(totalEstimado)}</span>
        </p>
      )}
    </Pagina>
  );
}
