import { notFound } from "next/navigation";

import { MapaDoBuffet } from "@/app/admin/buffet/mapa/mapa-do-buffet";
import { guardModule } from "@/lib/auth-guard";
import { ddmm } from "@/lib/buffet";
import { cardapioDoDiaCompleto, gruposDoBuffet, posicoesDoMapa } from "@/lib/buffet-dados";
import { DIAS_DA_SEMANA, diaDaSemanaBuffet } from "@/lib/buffet-regras";
import { dateString } from "@/lib/validations";

import { FolhaDeImpressao } from "../../../_comum/folha";

export const dynamic = "force-dynamic";
// Folha deitada: a largura do papel A4 deitado (ver `app/imprimir/layout.tsx`).
export const viewport = { width: 1047, initialScale: undefined };
export const metadata = { title: "Mapa do buffet para imprimir" };

/** O mapa do buffet de um dia numa folha A4 deitada, para colar na parede da cozinha. */
export default async function ImprimirMapaDoBuffetPage({ params }: PageProps<"/imprimir/buffet/[data]/mapa">) {
  await guardModule("buffet");
  const { data } = await params;
  if (!dateString.safeParse(data).success) notFound();
  const [dia, grupos, posicoes] = await Promise.all([cardapioDoDiaCompleto(data), gruposDoBuffet(), posicoesDoMapa()]);

  return (
    <FolhaDeImpressao papel="paisagem" margem={8} className="p-4">
      <h1 className="mb-1 text-center text-base font-bold uppercase">
        Mapa do buffet · {DIAS_DA_SEMANA[diaDaSemanaBuffet(data) - 1]} {ddmm(data)}
        {dia?.tema && ` · ${dia.tema}`}
      </h1>
      <MapaDoBuffet grupos={grupos} posicoes={posicoes} dia={dia} impressao />
    </FolhaDeImpressao>
  );
}
