import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";

import { ListaDeFormas } from "./lista-de-formas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Formas de recebimento · Financeiro" };

/**
 * Como o cliente paga, com a taxa e o prazo de cada maquininha. São os campos
 * do fechamento do dia, na mesma ordem.
 */
export default async function FormasPage() {
  await guardModule("financeiro", { configure: true });
  const [formas, contas] = await Promise.all([
    prisma.formaRecebimento.findMany({ orderBy: [{ ativo: "desc" }, { ordem: "asc" }, { id: "asc" }], include: { conta: { select: { nome: true } } } }),
    prisma.contaFinanceira.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
  ]);
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo="Formas de recebimento"
        subtitulo="A taxa e o prazo de cada maquininha."
        ajuda="A taxa e o prazo estão no contrato de cada maquininha. Crédito à vista e parcelado, ou duas maquininhas com taxas diferentes, são formas separadas."
      />
      <ListaDeFormas
        contas={contas}
        formas={formas.map((f) => ({
          id: f.id,
          nome: f.nome,
          tipo: f.tipo,
          taxaPct: f.taxaPct.toNumber(),
          prazoDias: f.prazoDias,
          contaId: f.contaId,
          conta: f.conta.nome,
          ativo: f.ativo,
        }))}
      />
    </Pagina>
  );
}
