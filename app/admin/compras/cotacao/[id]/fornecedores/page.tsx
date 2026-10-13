import { redirect } from "next/navigation";

/**
 * "Chamar fornecedores" virou a parte "Cotação" da página Enviar, que junta
 * na ordem de mandar tudo o que sai da casa numa rodada. O endereço antigo
 * continua valendo — está em mensagens e favoritos — e leva para lá.
 */
export default async function FornecedoresDaCotacaoPage({
  params,
}: PageProps<"/admin/compras/cotacao/[id]/fornecedores">) {
  const { id } = await params;
  redirect(`/admin/compras/enviar?cotacao=${Number(id) || ""}`);
}
