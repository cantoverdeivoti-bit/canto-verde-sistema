import { ScanLine } from "lucide-react";
import Link from "next/link";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { getSettings } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { FUSO_DA_CASA, formatDiaNumerico } from "@/lib/format";
import { ultimasComprasPorProduto } from "@/lib/historico";
import { orcamentoDaSemana } from "@/lib/orcamento";
import { produtosParaPedido } from "@/lib/produtos-para-pedido";

import { NovoPedido } from "./novo-pedido";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedido manual — Compras" };

/**
 * O pedido manual: fornecedor, produtos, quantidades e o preço combinado.
 *
 * Existe para a compra que não nasce da contagem — o que acabou no meio da
 * semana, a encomenda por telefone. Criado aqui, ele cai na página do pedido,
 * de onde sai pelo WhatsApp como qualquer outro.
 *
 * `?itens=72:5,85:3` já traz produtos e quantidades: é o "Comprar de outro"
 * de Pendências, quando um fornecedor avisa que está em falta.
 */
export default async function NovoPedidoPage({ searchParams }: PageProps<"/admin/compras/pedido-manual">) {
  await guardModule("compras");
  const { itens, aviso } = await searchParams;
  const avisoId = Number(Array.isArray(aviso) ? aviso[0] : aviso);
  const pedidos = (Array.isArray(itens) ? itens.join(",") : (itens ?? ""))
    .split(",")
    .map((par) => par.split(":").map(Number))
    .filter(([id, q]) => Number.isInteger(id) && id > 0 && Number.isFinite(q) && q > 0)
    .slice(0, 100);

  const [fornecedores, produtos, orcamento, categorias] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true, apelido: true },
      orderBy: { name: "asc" },
    }),
    produtosParaPedido(),
    getSettings().then((s) => orcamentoDaSemana(s.capacity.timezone)),
    prisma.category.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  // O último preço pago de cada produto (a última entrega conferida), para
  // quem monta o pedido ter a referência ao lado do campo de preço.
  const ultimas = await ultimasComprasPorProduto(
    produtos.map((p) => p.id),
    1,
  );
  const ultimoPago = Object.fromEntries(
    [...ultimas].flatMap(([id, [c]]) =>
      c ? [[id, { valor: c.valor, dia: formatDiaNumerico(new Date(c.em), FUSO_DA_CASA), fornecedor: c.fornecedor }]] : [],
    ),
  );

  // Só os que existem na lista da tela: um id que não está lá seria uma linha
  // sem nome.
  const existentes = new Set(produtos.map((p) => p.id));
  const iniciais = pedidos
    .filter(([id]) => existentes.has(id))
    .map(([produtoId, quantidade]) => ({ produtoId, quantidade }));

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo="Pedido manual"
        subtitulo={
          iniciais.length > 0
            ? `${avisoId > 0 ? "Os itens em falta já estão na lista." : "Os itens já estão na lista."} Escolha de quem comprar.`
            : undefined
        }
      />
      {/* Já comprou no mercado: a nota faz o trabalho de digitar (e já dá entrada). */}
      {iniciais.length === 0 && (
        <Link
          href="/admin/compras/recebimentos/nota"
          className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 hover:border-[var(--primary)]"
        >
          <ScanLine aria-hidden className="size-6 shrink-0 text-[var(--primary)]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Já comprou no mercado? Leia a nota</span>
            <span className="block text-xs text-[var(--muted-foreground)]">
              A câmera lê o QR do cupom, os itens vêm sozinhos e já entram no estoque.
            </span>
          </span>
        </Link>
      )}
      <NovoPedido
        iniciais={iniciais}
        avisoId={Number.isInteger(avisoId) && avisoId > 0 && iniciais.length > 0 ? avisoId : null}
        fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.apelido ?? f.name }))}
        produtos={produtos}
        orcamento={orcamento}
        categorias={categorias}
        ultimoPago={ultimoPago}
      />
    </Pagina>
  );
}
