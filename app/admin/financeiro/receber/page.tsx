import { PaginaDeLancamentos } from "../_comum/pagina-de-lancamentos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas a receber · Financeiro" };

/**
 * O que a casa tem para receber: os repasses do cartão que o fechamento do
 * dia gerou, e o que mais for lançado (evento, aluguel do espaço).
 */
export default async function ReceberPage({ searchParams }: PageProps<"/admin/financeiro/receber">) {
  return <PaginaDeLancamentos tipo="RECEBER" busca={await searchParams} />;
}
