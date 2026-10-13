import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { centrosDeCusto } from "@/lib/financeiro-dados";

import { ListaDeCentros } from "./lista-de-centros";

export const dynamic = "force-dynamic";
export const metadata = { title: "Centros de custo · Financeiro" };

/**
 * As áreas da casa com resultado próprio. É por eles que a DRE responde
 * "o delivery se paga?" sem misturar com o salão.
 */
export default async function CentrosPage() {
  await guardModule("financeiro", { configure: true });
  const [centros, usos] = await Promise.all([
    centrosDeCusto(),
    prisma.lancamento.groupBy({ by: ["centroCustoId"], _count: true }),
  ]);
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina
        titulo="Centros de custo"
        subtitulo="As áreas da casa, para a DRE por centro."
        ajuda="O que é de todos (contador, aluguel, sistemas) vai para o Administrativo. A casa não divide esse custo entre os outros: ele aparece na coluna dele na DRE por centro."
      />
      <ListaDeCentros
        centros={centros.map((c) => ({
          ...c,
          usos: usos.find((u) => u.centroCustoId === c.id)?._count ?? 0,
        }))}
      />
    </Pagina>
  );
}
