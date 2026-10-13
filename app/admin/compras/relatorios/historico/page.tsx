import { Search } from "lucide-react";
import Link from "next/link";

import { Lista, Vazio } from "@/components/pagina";
import { SelectQueEnvia } from "@/components/select-que-envia";
import { Button } from "@/components/ui/button";
import { getSettings, todayInTimezone } from "@/lib/availability";
import { guardModule } from "@/lib/auth-guard";
import { PEDIDO_LABEL } from "@/lib/cotacao-labels";
import { prisma } from "@/lib/db";
import { formatDayAndMonth, formatMoney, nomeDaCotacao, plural } from "@/lib/format";
import { periodoDaPagina } from "@/lib/periodo-da-pagina";
import { instantesDoPeriodo } from "@/lib/relatorios-compras";
import { custosPara, valorDoPedido } from "@/lib/valor-do-item";
import type { PedidoCompraStatus, Prisma } from "@/generated/prisma/client";

import { FiltroDePeriodo } from "../periodo";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedidos — Relatórios" };

const POR_PAGINA = 50;

/** Os status como o dono fala: "a enviar" junta os dois que querem dizer isso. */
const SITUACOES: { chave: string; nome: string; estatus: PedidoCompraStatus[] }[] = [
  { chave: "a-enviar", nome: "A enviar", estatus: ["AGUARDANDO_FORNECEDOR", "CRIADO"] },
  { chave: "enviado", nome: "Enviado", estatus: ["ENVIADO"] },
  { chave: "entregue", nome: "Entregue", estatus: ["ENTREGUE"] },
  { chave: "parcial", nome: "Entregue em parte", estatus: ["PARCIAL_ENTREGUE"] },
  { chave: "cancelado", nome: "Cancelado", estatus: ["CANCELADO"] },
];

function texto(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

/**
 * Todos os pedidos já feitos, do mais novo para o mais antigo, com filtros.
 * O período aqui é pela data em que o pedido foi FEITO — é "o que eu pedi em
 * agosto", e não "o que chegou em agosto", que é o Painel.
 */
export default async function HistoricoPage({
  searchParams,
}: PageProps<"/admin/compras/relatorios/historico">) {
  await guardModule("compras");
  const { capacity } = await getSettings();
  const tz = capacity.timezone;
  const hoje = todayInTimezone(tz);
  const q = await searchParams;
  const { de, ate } = periodoDaPagina("/admin/compras/relatorios/historico", q, hoje);
  const { inicio, fim } = instantesDoPeriodo(de, ate, tz);

  const fornecedorId = Number(texto(q.fornecedor)) || null;
  const produto = texto(q.produto).trim();
  const situacao = SITUACOES.find((s) => s.chave === texto(q.situacao)) ?? null;
  const pagina = Math.max(1, Number(texto(q.pagina)) || 1);

  const where: Prisma.PedidoCompraWhereInput = {
    createdAt: { gte: inicio, lt: fim },
    ...(fornecedorId !== null ? { fornecedorId } : {}),
    ...(situacao ? { estatus: { in: situacao.estatus } } : {}),
    ...(produto.length >= 2
      ? { itens: { some: { produto: { name: { contains: produto, mode: "insensitive" } } } } }
      : {}),
  };

  const [pedidos, total, fornecedores] = await Promise.all([
    prisma.pedidoCompra.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: POR_PAGINA * pagina,
      select: {
        id: true,
        createdAt: true,
        estatus: true,
        cotacaoId: true,
        cotacao: { select: { dataInicio: true } },
        contagemId: true,
        entregaConfirmada: true,
        fornecedor: { select: { name: true, apelido: true } },
        contagem: { select: { listaCompra: { select: { nome: true } } } },
        itens: {
          select: {
            produtoId: true,
            quantidadeSolicitada: true,
            quantidadeRecebida: true,
            precoUnitario: true,
            precoPago: true,
            precoEstimado: true,
          },
        },
      },
    }),
    prisma.pedidoCompra.count({ where }),
    prisma.supplier.findMany({
      where: { pedidosCompra: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, apelido: true },
    }),
  ]);

  // O último custo só entra nos pedidos ainda não conferidos.
  const custos = await custosPara(pedidos.filter((p) => !p.entregaConfirmada).flatMap((p) => p.itens));

  const extras: Record<string, string> = {};
  if (fornecedorId !== null) extras.fornecedor = String(fornecedorId);
  if (produto) extras.produto = produto;
  if (situacao) extras.situacao = situacao.chave;
  const maisUma = `/admin/compras/relatorios/historico?${new URLSearchParams({
    ...extras,
    de,
    ate,
    pagina: String(pagina + 1),
  }).toString()}`;

  return (
    <div className="space-y-5">
      {/* O cartão de busca: o produto com a lupa em cima, o fornecedor e a
          situação embaixo, e o período. São dois formulários GET no mesmo
          cartão, cada um levando os campos do outro escondidos: o endereço
          guarda a busca. */}
      <FiltroDePeriodo
        caminho="/admin/compras/relatorios/historico"
        de={de}
        ate={ate}
        hoje={hoje}
        extras={extras}
        busca={
          // Sem botão de Filtrar: os seletores enviam ao trocar, e o produto
          // com o Enter (o "Buscar" do teclado do celular).
          <form method="get" className="space-y-2">
            <input type="hidden" name="de" value={de} />
            <input type="hidden" name="ate" value={ate} />
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]"
              />
              <input
                type="search"
                name="produto"
                defaultValue={produto}
                placeholder="Nome do produto"
                aria-label="Buscar pelo produto"
                enterKeyHint="search"
                className="field h-11 pl-9"
              />
            </div>
            {/* Um embaixo do outro no celular: lado a lado, o nome do
                fornecedor saía cortado. */}
            <div className="grid gap-2 sm:grid-cols-2">
              <SelectQueEnvia
                name="fornecedor"
                rotulo="Fornecedor"
                atual={fornecedorId === null ? "" : String(fornecedorId)}
                opcoes={[
                  { valor: "", texto: "Todos os fornecedores" },
                  ...fornecedores.map((f) => ({ valor: String(f.id), texto: f.apelido ?? f.name })),
                ]}
              />
              <SelectQueEnvia
                name="situacao"
                rotulo="Situação"
                atual={situacao?.chave ?? ""}
                opcoes={[
                  { valor: "", texto: "Todas as situações" },
                  ...SITUACOES.map((s) => ({ valor: s.chave, texto: s.nome })),
                ]}
              />
            </div>
          </form>
        }
      />

      {/* A contagem fica fora do cartão, com o "limpar" ao lado. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm text-[var(--muted-foreground)]">
          {plural(total, "pedido", "pedidos")} no período
          {pedidos.length < total && ` · mostrando ${pedidos.length}`}
        </p>
        {Object.keys(extras).length > 0 && (
          <Link
            href={`/admin/compras/relatorios/historico?de=${de}&ate=${ate}`}
            className="text-sm text-[var(--primary)] underline-offset-4 hover:underline"
          >
            limpar filtros
          </Link>
        )}
      </div>

      {pedidos.length === 0 && (
        <Vazio>
          {Object.keys(extras).length > 0
            ? "Nenhum pedido com estes filtros no período."
            : "Nenhum pedido feito no período."}
        </Vazio>
      )}

      {pedidos.length > 0 && (
        <Lista aria-label="Pedidos">
          {pedidos.map((p) => {
            // Recebido, vale o que chegou; antes disso, o que foi pedido.
            const valor = valorDoPedido(p, custos);
            const origem =
              p.cotacao
                ? nomeDaCotacao(p.cotacao.dataInicio, tz)
                : p.contagem?.listaCompra
                  ? `Compra de rotina ${p.contagem.listaCompra.nome}`
                  : p.contagemId !== null
                    ? "Pedido direto"
                    : "Pedido manual";
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="font-medium">
                    {p.fornecedor.apelido ?? p.fornecedor.name}{" "}
                    <span className="selo ml-1 text-[var(--muted-foreground)]">{PEDIDO_LABEL[p.estatus].texto}</span>
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    #{p.id} · {formatDayAndMonth(p.createdAt, tz)} · {origem}
                  </p>
                </div>
                <span className="num-display text-sm">{formatMoney(valor)}</span>
                <Button asChild size="sm" className="gap-1.5">
                  <Link href={`/admin/compras/pedidos/${p.id}`}>Abrir</Link>
                </Button>
              </li>
            );
          })}
        </Lista>
      )}

      {pedidos.length < total && (
        <Link href={maisUma} className="btn-ghost inline-flex">
          Ver mais
        </Link>
      )}
    </div>
  );
}
