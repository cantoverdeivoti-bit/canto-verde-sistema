import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { prisma } from "@/lib/db";
import { cardapiosComCusto, configuracaoEventos } from "@/lib/eventos-dados";
import { formatPhone } from "@/lib/format";

import { NovoOrcamentoForm } from "./novo-orcamento-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo orçamento · Eventos" };

/** O começo do orçamento: quem, o quê, quando e para quantos. O preço se monta na tela seguinte. */
export default async function NovoOrcamentoPage({ searchParams }: PageProps<"/admin/eventos/orcamentos/novo">) {
  const q = await searchParams;
  const [clientes, cardapios, config] = await Promise.all([
    prisma.clienteEvento.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true, telefone: true } }),
    cardapiosComCusto({ ativo: true }),
    configuracaoEventos(),
  ]);
  const clienteId = typeof q.cliente === "string" && clientes.some((c) => String(c.id) === q.cliente) ? q.cliente : "";

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Novo orçamento" voltar={{ href: "/admin/eventos/orcamentos", texto: "Orçamentos" }} />
      <NovoOrcamentoForm
        clienteId={clienteId}
        clientes={clientes.map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone ? formatPhone(c.telefone) : null }))}
        cardapios={cardapios.map((c) => ({ id: c.id, nome: c.nome, precoPorPessoa: c.precoPorPessoa, custoPorPessoa: c.custoPorPessoa }))}
        capacidade={{ SENTADO: config.capacidadeSentados, EM_PE: config.capacidadeEmPe }}
        temLocacao={config.valorLocacao !== null}
      />
    </Pagina>
  );
}
