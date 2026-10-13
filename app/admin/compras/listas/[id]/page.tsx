import { ClipboardList } from "lucide-react";
import { notFound } from "next/navigation";

import { CabecalhoDaPagina, CartaoDeSecao, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { can } from "@/lib/roles";
import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { DIAS_DA_SEMANA, diaDaSemanaHoje, formatAmount } from "@/lib/format";
import { situacaoDasRotinas } from "@/lib/rotina-de-hoje";

import { dadosDoFormulario } from "../dados-do-formulario";
import { ContarRotina } from "../contar-rotina";
import { FormularioDoDia } from "../formulario-do-dia";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compra de rotina — Compras" };

/**
 * Um dia da compra de rotina: contar os produtos dela (o pedido direto sai ao
 * finalizar), o pedido de hoje quando já saiu, e os produtos com o estoque
 * ideal, para mudar. Dá para contar em qualquer dia; no dia dela, o cartão
 * diz que hoje é o dia.
 */
export default async function DiaDaRotinaPage({ params }: PageProps<"/admin/compras/listas/[id]">) {
  const user = await guardModule("compras", { atalho: true });
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [lista, sugeridos, { fornecedores, produtos }, { capacity }] = await Promise.all([
    prisma.listaCompra.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        fornecedorId: true,
        diaSemana: true,
        ativa: true,
        fornecedor: { select: { name: true, apelido: true } },
        itens: { select: { produtoId: true, idealStock: true, produto: { select: { name: true } } } },
      },
    }),
    prisma.sugestaoIdealRequisicao.findMany({
      where: { listaId: id, status: "PENDENTE" },
      orderBy: { createdAt: "desc" },
      select: { produtoId: true, idealSugerido: true },
    }),
    dadosDoFormulario(),
    getSettings(),
  ]);
  if (!lista) notFound();
  const tz = capacity.timezone;
  const nome = lista.fornecedor.apelido ?? lista.fornecedor.name;
  const ehHoje = lista.ativa && lista.diaSemana === diaDaSemanaHoje(tz);
  const situacao = (await situacaoDasRotinas([id], tz)).get(id)!;

  const sugeridoPor: Record<number, string> = {};
  for (const s of sugeridos) sugeridoPor[s.produtoId] ??= formatAmount(s.idealSugerido.toNumber());

  lista.itens.sort((a, b) => a.produto.name.localeCompare(b.produto.name, "pt-BR"));

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        voltar={{ href: "/admin/compras/listas", texto: "Compras de rotina" }}
        titulo={
          <>
            {nome} · <span className="capitalize">{DIAS_DA_SEMANA[lista.diaSemana]}</span>
            {!lista.ativa && <span className="text-sm font-normal text-[var(--warn)]"> · desligada</span>}
          </>
        }
      />

      {lista.ativa && (
        <CartaoDeSecao
          icone={ClipboardList}
          titulo={ehHoje ? "Hoje é o dia" : "Contar"}
          frase="Ao finalizar a contagem, o pedido sai pronto: o ideal menos o contado."
        >
          <ContarRotina
            listaId={lista.id}
            nome={lista.nome}
            situacao={situacao}
            podeComprar={can(user, "compras", { configure: true })}
            pedidoAMao={situacao.pedido ? undefined : `/admin/compras/listas/${id}/pedido`}
          />
        </CartaoDeSecao>
      )}

      <FormularioDoDia
        fornecedores={fornecedores}
        produtos={produtos}
        lista={{
          id: lista.id,
          fornecedorId: lista.fornecedorId,
          dia: lista.diaSemana,
          ativa: lista.ativa,
          itens: lista.itens.map((i) => ({ produtoId: i.produtoId, ideal: i.idealStock.toNumber() })),
        }}
        sugeridos={sugeridoPor}
        peloLink={user.atalho}
      />
    </Pagina>
  );
}
