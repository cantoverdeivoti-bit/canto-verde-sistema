import { guardModule } from "@/lib/auth-guard";
import { can } from "@/lib/roles";

import { FolhaDeImpressao } from "../_comum/folha";
import { FichaImpressa, fichasParaImprimir, type TipoDeFicha } from "./ficha-impressa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fichas para imprimir" };

/**
 * Várias fichas, uma por folha: as de uma categoria (`?categoria=Sobremesa`)
 * ou de uma operação (`?operacao=EVENTOS`), para montar a pasta da cozinha.
 * Sai a operacional; `?tipo=tecnica` imprime a técnica.
 */
export default async function ImprimirFichasPage({ searchParams }: PageProps<"/imprimir/receituario">) {
  const user = await guardModule("receituario");
  const q = await searchParams;
  const categoria = typeof q.categoria === "string" && q.categoria ? q.categoria : undefined;
  const operacao = typeof q.operacao === "string" && q.operacao ? q.operacao : undefined;
  const itens = categoria || operacao ? await fichasParaImprimir({ categoria, operacao }) : [];
  // A técnica tem os custos: só para quem configura o módulo. O resto imprime a operacional.
  const tipo: TipoDeFicha = q.tipo === "tecnica" && can(user, "receituario", { configure: true }) ? "tecnica" : "operacional";
  return (
    <FolhaDeImpressao css="@media print { .folha { min-height: 266mm; margin-bottom: 0; } } @media print { .folha { break-after: page; } .folha:last-child { break-after: auto; } } tr { break-inside: avoid; } thead { display: table-header-group; }">
      {itens.length === 0 && <p>Escolha uma categoria ou uma operação para imprimir.</p>}
      {itens.map((i) => (
        <FichaImpressa key={i.ficha.id} {...i} tipo={tipo} />
      ))}
    </FolhaDeImpressao>
  );
}
