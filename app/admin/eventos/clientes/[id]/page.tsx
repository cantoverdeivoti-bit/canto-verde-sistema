import { notFound } from "next/navigation";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { dateOnlyToString } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { resumirEvento, RESUMO_DO_EVENTO } from "@/lib/eventos-dados";
import { formatPhone, formatTaxId } from "@/lib/format";
import { whatsappNumberLink } from "@/lib/whatsapp";

import { ClienteForm } from "../cliente-form";
import { FichaDoCliente } from "./ficha-do-cliente";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cliente · Eventos" };

export default async function ClientePage({ params }: PageProps<"/admin/eventos/clientes/[id]">) {
  const { id } = await params;
  const c = await prisma.clienteEvento.findUnique({
    where: { id: Number(id) || 0 },
    include: {
      eventos: { select: RESUMO_DO_EVENTO, orderBy: { data: "desc" } },
      interacoes: { orderBy: { em: "desc" }, include: { evento: { select: { id: true, titulo: true } } } },
    },
  });
  if (!c) notFound();
  const autores = await prisma.adminUser.findMany({
    where: { id: { in: c.interacoes.map((i) => i.autorId).filter((a) => a !== null) } },
    select: { id: true, name: true, username: true },
  });
  const nomeDe = (autorId: number | null) => {
    const a = autores.find((x) => x.id === autorId);
    return a ? (a.name ?? a.username) : null;
  };

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo={c.nome} voltar={{ href: "/admin/eventos/clientes", texto: "CRM" }} />
      <FichaDoCliente
        cliente={{
          id: c.id,
          nome: c.nome,
          whatsapp: whatsappNumberLink(c.telefone),
          proximoContato: c.proximoContato ? dateOnlyToString(c.proximoContato) : null,
        }}
        eventos={c.eventos.map(resumirEvento)}
        interacoes={c.interacoes.map((i) => ({
          id: i.id,
          tipo: i.tipo,
          texto: i.texto,
          em: i.em.toISOString(),
          autor: nomeDe(i.autorId),
          evento: i.evento,
        }))}
      />
      <details>
        <summary className="cursor-pointer text-sm font-semibold">Cadastro</summary>
        <div className="mt-3">
          <ClienteForm
            id={c.id}
            inicial={{
              nome: c.nome,
              tipo: c.tipo,
              documento: c.documento ? (c.documento.length === 14 ? formatTaxId(c.documento) : c.documento) : "",
              telefone: c.telefone ? formatPhone(c.telefone) : "",
              email: c.email ?? "",
              origem: c.origem ?? "",
              observacoes: c.observacoes ?? "",
              proximoContato: c.proximoContato ? dateOnlyToString(c.proximoContato) : "",
            }}
          />
        </div>
      </details>
    </Pagina>
  );
}
