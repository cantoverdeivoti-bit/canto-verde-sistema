import { notFound } from "next/navigation";

import { FolhaDoDia } from "@/app/admin/buffet/producao/folha-do-dia";
import { guardModule } from "@/lib/auth-guard";
import { cardapioDoDiaCompleto, gruposDoBuffet, pesosDoDia } from "@/lib/buffet-dados";
import { dateString } from "@/lib/validations";

import { FolhaDeImpressao } from "../../_comum/folha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produção do buffet para imprimir" };

/** A folha da cozinha de um dia numa A4 em pé, fora do painel, já pedindo para imprimir. */
export default async function ImprimirProducaoDoBuffetPage({ params }: PageProps<"/imprimir/buffet/[data]">) {
  await guardModule("buffet");
  const { data } = await params;
  if (!dateString.safeParse(data).success) notFound();
  const [dia, grupos, pesos] = await Promise.all([cardapioDoDiaCompleto(data), gruposDoBuffet(), pesosDoDia(data)]);

  return (
    <FolhaDeImpressao margem={8}>
      <FolhaDoDia data={data} dia={dia} grupos={grupos} pesos={pesos} />
    </FolhaDeImpressao>
  );
}
