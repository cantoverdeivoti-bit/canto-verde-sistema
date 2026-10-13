import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { SO_CODIGO } from "@/lib/financeiro";
import { centrosDeCusto } from "@/lib/financeiro-dados";

import { PlanoDeContas } from "./plano-de-contas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plano de contas · Financeiro" };

/**
 * O plano de contas em três níveis: o grupo (a linha da DRE, fixo porque é o
 * desenho do relatório), o subgrupo e a categoria (os dois da casa).
 */
export default async function CategoriasPage() {
  await guardModule("financeiro", { configure: true });
  const [subgrupos, centros] = await Promise.all([
    prisma.subgrupoFinanceiro.findMany({
      // O grupo ordena na ordem da DRE (é a ordem do enum no banco).
      orderBy: [{ grupo: "asc" }, { ordem: "asc" }, { nome: "asc" }],
      include: {
        categorias: {
          orderBy: [{ ordem: "asc" }, { nome: "asc" }],
          include: { _count: { select: { lancamentos: true, recorrencias: true } }, centroPadrao: { select: { nome: true } } },
        },
      },
    }),
    centrosDeCusto(),
  ]);
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo="Plano de contas"
        subtitulo="Grupo, subgrupo e categoria, na ordem da DRE."
        ajuda={
          <>
            O grupo é a linha da DRE e não muda; dentro dele, os subgrupos e as categorias são da casa. As marcadas com
            &quot;sistema&quot; são usadas pelo fechamento do dia e pelas baixas: dá para renomear e mudar de subgrupo, não
            para apagar. O código contábil é o da conta no plano do escritório de contabilidade.
          </>
        }
      />
      <PlanoDeContas
        centros={centros.filter((c) => c.ativo).map((c) => ({ id: c.id, nome: c.nome }))}
        subgrupos={subgrupos.map((s) => ({
          id: s.id,
          nome: s.nome,
          grupo: s.grupo,
          ativo: s.ativo,
          categorias: s.categorias.map((c) => ({
            id: c.id,
            nome: c.nome,
            tipo: c.tipo,
            grupo: c.grupo,
            subgrupoId: c.subgrupoId,
            sistema: c.chave !== null,
            soCodigo: c.chave !== null && SO_CODIGO.includes(c.chave),
            codigoContabil: c.codigoContabil ?? "",
            centroPadraoId: c.centroPadraoId,
            centroPadrao: c.centroPadrao?.nome ?? null,
            ativo: c.ativo,
            usos: c._count.lancamentos + c._count.recorrencias,
          })),
        }))}
      />
    </Pagina>
  );
}
