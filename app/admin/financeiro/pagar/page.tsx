import { PaginaDeLancamentos } from "../_comum/pagina-de-lancamentos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contas a pagar · Financeiro" };

/** O que a casa deve: fornecedor, conta fixa, imposto. */
export default async function PagarPage({ searchParams }: PageProps<"/admin/financeiro/pagar">) {
  return <PaginaDeLancamentos tipo="PAGAR" busca={await searchParams} />;
}
