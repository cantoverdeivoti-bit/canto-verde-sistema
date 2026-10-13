import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { DIAS_DA_SEMANA } from "@/lib/format";
import { pedidoDeHojeDaRequisicao, sugestaoDaRequisicao } from "@/lib/requisicao";

import { PedidoDaRequisicao } from "./pedido-da-requisicao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pedido da compra de rotina — Compras" };

/**
 * O pedido da Requisição feito com a contagem de hoje: a contagem geral (ou
 * qualquer outra já finalizada hoje) dá o estoque, a Requisição dá o ideal do
 * dia, e ele confere as quantidades antes de criar.
 */
export default async function PedidoDaRequisicaoPage({ params }: PageProps<"/admin/compras/listas/[id]/pedido">) {
  const user = await guardModule("compras", { atalho: true });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [lista, { capacity }] = await Promise.all([
    prisma.listaCompra.findUnique({
      where: { id },
      select: { id: true, diaSemana: true, fornecedorId: true, fornecedor: { select: { name: true, apelido: true } } },
    }),
    getSettings(),
  ]);
  if (!lista) notFound();
  const tz = capacity.timezone;
  const [linhas, pedidoHoje] = await Promise.all([sugestaoDaRequisicao(id, tz), pedidoDeHojeDaRequisicao(id, tz)]);

  return (
    <Pagina>
      <CabecalhoDaPagina
        voltar={{
          href: `/admin/compras/listas/${id}`,
          texto: `Compra de rotina · ${lista.fornecedor.apelido ?? lista.fornecedor.name}`,
        }}
        titulo={`Pedido de ${DIAS_DA_SEMANA[lista.diaSemana]} · ${lista.fornecedor.apelido ?? lista.fornecedor.name}`}
        subtitulo={`Com a contagem de hoje e o ideal de ${DIAS_DA_SEMANA[lista.diaSemana]}.`}
      />
      {pedidoHoje !== null ? (
        <p className="text-sm">
          A compra de rotina de hoje já tem o{" "}
          <Link href={`/admin/compras/pedidos/${pedidoHoje}`} className="text-[var(--primary)] underline underline-offset-4">
            pedido #{pedidoHoje}
          </Link>
          .
        </p>
      ) : (
        <PedidoDaRequisicao
          peloLink={user.atalho}
          listaId={id}
          linhas={linhas.map((l) => ({
            ...l,
            contadoEm: l.contadoEm === null ? null : formatInTimeZone(l.contadoEm, tz, "HH:mm"),
          }))}
        />
      )}
    </Pagina>
  );
}
