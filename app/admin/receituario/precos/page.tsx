import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { opcoesDaVenda, vendasComCustos } from "@/lib/receituario-vendas";

import { ListaDePrecos } from "./lista-de-precos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lista de preços · Receituário" };

/**
 * O que se vende fora do buffet (encomenda e delivery), com o preço e o
 * custo de hoje. O custo sai da ficha, e a embalagem entra só aqui: o custo
 * do buffet não muda.
 */
export default async function ListaDePrecosPage() {
  await guardModule("receituario", { configure: true });
  const [{ itens, metaFoodCost }, opcoes] = await Promise.all([vendasComCustos(), opcoesDaVenda()]);
  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina
        voltar={{ href: "/admin/receituario", texto: "Fichas" }}
        titulo="Lista de preços"
        subtitulo="Encomenda e delivery, com o custo de hoje."
        ajuda="O custo sai da ficha, que sai da última compra dos insumos. A embalagem entra só aqui, nunca no custo do buffet."
      />
      <ListaDePrecos itens={itens} total={itens.length} opcoes={opcoes} metaFoodCost={metaFoodCost} />
    </Pagina>
  );
}
