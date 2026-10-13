import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { prisma } from "@/lib/db";
import { resumirEvento, RESUMO_DO_EVENTO } from "@/lib/eventos-dados";
import { dateOnlyToString, todayInTimezone } from "@/lib/availability";
import { FUSO_DA_CASA } from "@/lib/format";

import { ListaDeClientes } from "./lista-de-clientes";

export const dynamic = "force-dynamic";
export const metadata = { title: "CRM · Eventos" };

/**
 * Quem contrata evento: o cadastro, quanto já fechou com a casa e quando
 * voltar a falar. Separado dos clientes do almoço, que são só telefone.
 */
export default async function ClientesPage() {
  const clientes = await prisma.clienteEvento.findMany({
    orderBy: { nome: "asc" },
    select: {
      id: true,
      nome: true,
      tipo: true,
      telefone: true,
      origem: true,
      proximoContato: true,
      eventos: { select: RESUMO_DO_EVENTO, orderBy: { data: "desc" } },
    },
  });

  const itens = clientes.map((c) => {
    const eventos = c.eventos.map(resumirEvento);
    const fechados = eventos.filter((e) => e.status === "CONFIRMADO" || e.status === "REALIZADO");
    return {
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      telefone: c.telefone,
      origem: c.origem,
      proximoContato: c.proximoContato ? dateOnlyToString(c.proximoContato) : null,
      eventos: eventos.length,
      fechados: fechados.length,
      emAberto: eventos.filter((e) => e.status === "RASCUNHO" || e.status === "ENVIADO").length,
      totalFechado: fechados.reduce((s, e) => s + e.totalCliente, 0),
      ultimo: eventos[0] ? { titulo: eventos[0].titulo, data: eventos[0].data } : null,
    };
  });

  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="CRM de eventos"
        subtitulo="Marque quando voltar a falar com cada cliente: quem está para retornar aparece primeiro e na Programação."
      />
      <ListaDeClientes itens={itens} hoje={todayInTimezone(FUSO_DA_CASA)} />
    </Pagina>
  );
}
