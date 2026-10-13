import { Printer } from "lucide-react";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { cardapioDoDiaCompleto, gruposDoBuffet, posicoesDoMapa } from "@/lib/buffet-dados";
import { pdfDe } from "@/lib/pdf-da-pagina";

import { dataDaTela } from "../data-da-tela";
import { EscolherData } from "../escolher-data";
import { MapaDoBuffet } from "./mapa-do-buffet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mapa do buffet · Cardápio buffet" };

/** Onde vai cada prato do dia no buffet, com as trocas do dia já no lugar. */
export default async function MapaDoBuffetPage({ searchParams }: PageProps<"/admin/buffet/mapa">) {
  const { data, hoje } = dataDaTela((await searchParams).data);
  const [dia, grupos, posicoes] = await Promise.all([cardapioDoDiaCompleto(data), gruposDoBuffet(), posicoesDoMapa()]);

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina titulo="Mapa do buffet" />
      <div className="flex flex-wrap items-center gap-2">
        <EscolherData data={data} hoje={hoje} base="/admin/buffet/mapa" />
        <a href={pdfDe(`/imprimir/buffet/${data}/mapa`)} download className="chip inline-flex items-center gap-1.5 px-3 py-1.5 text-sm sm:ml-auto">
          <Printer aria-hidden className="size-4" />
          Imprimir
        </a>
      </div>
      {dia ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {dia.tema && `Tema do dia: ${dia.tema}. `}Fundo amarelo: troca do dia.
        </p>
      ) : (
        <p className="msg-warn">Nenhum cardápio vale nesta data: o mapa mostra só os números.</p>
      )}
      <MapaDoBuffet grupos={grupos} posicoes={posicoes} dia={dia} />
    </Pagina>
  );
}
