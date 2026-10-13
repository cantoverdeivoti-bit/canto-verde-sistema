import { notFound } from "next/navigation";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { cardapiosComCusto, configuracaoEventos } from "@/lib/eventos-dados";
import { receituarioComCustos } from "@/lib/receituario-dados";
import { can } from "@/lib/roles";

import { EditorDeCardapio } from "./editor-de-cardapio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cardápio · Eventos" };

export default async function CardapioPage({ params }: PageProps<"/admin/eventos/cardapios/[id]">) {
  const { id } = await params;
  const [user, [cardapio], { fichas, custoDasFichas }, config, eventos] = await Promise.all([
    guardModule("eventos"),
    cardapiosComCusto({ id: Number(id) || 0 }),
    receituarioComCustos(),
    configuracaoEventos(),
    prisma.evento.count({ where: { cardapioId: Number(id) || 0 } }),
  ]);
  if (!cardapio) notFound();

  // As fichas que já servem em evento vêm primeiro na busca.
  const opcoes = fichas
    .filter((f) => f.ativo)
    .map((f) => ({
      id: f.id,
      codigo: f.codigo,
      nome: f.nome,
      categoria: f.categoria,
      eventos: f.operacoes.includes("EVENTOS"),
      custoPorcao: custoDasFichas.get(f.id)?.porPorcao ?? 0,
    }))
    .sort((a, b) => Number(b.eventos) - Number(a.eventos) || a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <Pagina largura="estreita">
      {/* O nome também é um campo editável, logo abaixo. */}
      <CabecalhoDaPagina voltar={{ href: "/admin/eventos/cardapios", texto: "Cardápios" }} titulo={cardapio.nome} />
      <EditorDeCardapio
        cardapio={cardapio}
        fichas={opcoes}
        verFicha={can(user, "receituario")}
        margemAlvoPct={config.margemAlvoPct}
        impostoPct={config.impostoPct}
        eventos={eventos}
      />
    </Pagina>
  );
}
