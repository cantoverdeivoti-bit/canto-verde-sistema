import { notFound } from "next/navigation";

import { guardModule } from "@/lib/auth-guard";
import { can } from "@/lib/roles";

import { FolhaDeImpressao } from "../../_comum/folha";
import { FichaImpressa, fichasParaImprimir, type TipoDeFicha } from "../ficha-impressa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ficha para imprimir" };

/** Uma ficha em A4: a operacional, ou a técnica com `?tipo=tecnica`. */
export default async function ImprimirFichaPage({ params, searchParams }: PageProps<"/imprimir/receituario/[codigo]">) {
  const user = await guardModule("receituario");
  const [{ codigo }, q] = await Promise.all([params, searchParams]);
  const [item] = await fichasParaImprimir({ codigo: decodeURIComponent(codigo).toUpperCase() });
  if (!item) notFound();
  // A técnica tem os custos: só para quem configura o módulo. O resto imprime a operacional.
  const tipo: TipoDeFicha = q.tipo === "tecnica" && can(user, "receituario", { configure: true }) ? "tecnica" : "operacional";
  return (
    <FolhaDeImpressao css="@media print { .folha { min-height: 266mm; margin-bottom: 0; } } tr { break-inside: avoid; } thead { display: table-header-group; }">
      <FichaImpressa {...item} tipo={tipo} />
    </FolhaDeImpressao>
  );
}
