import { MapIcon, Printer } from "lucide-react";
import Link from "next/link";

import { GradeDeAtalhos } from "@/components/grade-de-atalhos";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { cardapioDoDiaCompleto, gruposDoBuffet, pesosDoDia, pratosParaEscolher, sugestoesPendentes } from "@/lib/buffet-dados";
import { can } from "@/lib/permissions";
import { pdfDe } from "@/lib/pdf-da-pagina";

import { dataDaTela } from "../data-da-tela";
import { EscolherData } from "../escolher-data";
import { SoNaImpressao } from "../so-na-impressao";
import { FolhaDoDia } from "./folha-do-dia";
import { ProducaoDoDia } from "./producao-do-dia";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produção do dia · Cardápio buffet" };

/**
 * A folha da cozinha de um dia: o cardápio-modelo daquele dia da semana com
 * as trocas da data, e para cada prato o posto, a carga do forno, a janela e
 * o ajuste. Trocar aqui vale só para a data; o modelo não muda.
 */
export default async function ProducaoDoDiaPage({ searchParams }: PageProps<"/admin/buffet/producao">) {
  const { data, hoje } = dataDaTela((await searchParams).data);
  const [user, dia, grupos, pratos, pesos, sugeridas] = await Promise.all([
    guardModule("buffet"),
    cardapioDoDiaCompleto(data),
    gruposDoBuffet(),
    pratosParaEscolher(),
    pesosDoDia(data),
    sugestoesPendentes({ data }),
  ]);

  return (
    <Pagina largura="larga">
      {/* Quem imprime pelo navegador recebe a folha do dia, e não a tela. */}
      <SoNaImpressao soNaImpressao>
        <FolhaDoDia data={data} dia={dia} grupos={grupos} pesos={pesos} />
      </SoNaImpressao>
      <CabecalhoDaPagina titulo="Produção do dia" />
      <div className="flex flex-wrap items-center gap-2">
        <EscolherData data={data} hoje={hoje} base="/admin/buffet/producao" />
      </div>
      {dia && (
        <GradeDeAtalhos
          rotulo="Imprimir"
          atalhos={[
            { href: pdfDe(`/imprimir/buffet/${data}`), nome: "Imprimir folha", icone: Printer, baixar: true },
            { href: pdfDe(`/imprimir/buffet/${data}/mapa`), nome: "Imprimir mapa", icone: MapIcon, baixar: true },
          ]}
        />
      )}
      {dia ? (
        <ProducaoDoDia
          dia={dia}
          grupos={grupos.map((g) => ({ id: g.id, nome: g.nome, cor: g.cor, posicoes: g.posicoes }))}
          pratos={pratos}
          pesos={pesos}
          podePesar={data <= hoje}
          sugeridas={sugeridas}
          trocaDireto={can(user, "buffet", { configure: true })}
        />
      ) : (
        <p className="msg-warn">
          Nenhum cardápio vale nesta data. <Link href="/admin/buffet/cardapio" className="underline">Crie um cardápio</Link> com um período
          que cubra este dia.
        </p>
      )}
    </Pagina>
  );
}
