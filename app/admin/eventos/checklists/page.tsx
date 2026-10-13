import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { prisma } from "@/lib/db";

import { Modelos } from "./modelos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checklists · Eventos" };

/**
 * Os roteiros que se repetem em todo evento. Aplicado num evento, o modelo é
 * copiado com os prazos em data; mudar o modelo depois não mexe no evento.
 */
export default async function ChecklistsPage() {
  const modelos = await prisma.modeloChecklist.findMany({
    orderBy: { nome: "asc" },
    include: { itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] } },
  });
  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Checklists"
        subtitulo="O prazo de cada tarefa conta do dia do evento: -7 é uma semana antes, 0 é no dia, 1 é o dia seguinte."
      />
      <Modelos
        modelos={modelos.map((m) => ({
          id: m.id,
          nome: m.nome,
          itens: m.itens.map((i) => ({ id: i.id, texto: i.texto, etapa: i.etapa, dias: i.dias })),
        }))}
      />
    </Pagina>
  );
}
