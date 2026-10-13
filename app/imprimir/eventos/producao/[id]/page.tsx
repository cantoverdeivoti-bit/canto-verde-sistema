import { notFound } from "next/navigation";

import { ListasDaProducao } from "@/app/admin/eventos/orcamentos/[id]/producao-do-evento";
import { guardModule } from "@/lib/auth-guard";
import { dateOnlyToString } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { producaoDoCardapio } from "@/lib/eventos-dados";
import { plural } from "@/lib/format";

import { FolhaDeImpressao } from "../../../_comum/folha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ordem de produção" };

/** A ordem de produção do evento, para a cozinha: pratos, pré-preparos e o que comprar. */
export default async function ImprimirProducaoPage({ params }: PageProps<"/imprimir/eventos/producao/[id]">) {
  await guardModule("eventos");
  const { id } = await params;
  const e = await prisma.evento.findUnique({
    where: { id: Number(id) || 0 },
    select: { titulo: true, data: true, horaInicio: true, convidados: true, cardapioId: true, cardapio: { select: { nome: true } } },
  });
  if (!e) notFound();
  const producao = e.cardapioId ? await producaoDoCardapio(e.cardapioId, e.convidados) : null;
  return (
    <FolhaDeImpressao>
      <header className="mb-2 border-b-2 border-black pb-2">
        <h1 className="text-xl font-bold">Ordem de produção · {e.titulo}</h1>
        <p className="text-sm">
          {dateOnlyToString(e.data).split("-").reverse().join("/")}
          {e.horaInicio ? `, às ${e.horaInicio}` : ""} · {plural(e.convidados, "convidado")}
          {e.cardapio ? ` · ${e.cardapio.nome}` : ""}
        </p>
      </header>
      {producao && producao.pratos.length > 0 ? <ListasDaProducao producao={producao} impressa /> : <p>O evento não tem cardápio escolhido.</p>}
    </FolhaDeImpressao>
  );
}
