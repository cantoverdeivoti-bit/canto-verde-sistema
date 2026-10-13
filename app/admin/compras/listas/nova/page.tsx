import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

import { dadosDoFormulario } from "../dados-do-formulario";
import { FormularioDoDia } from "../formulario-do-dia";

export const dynamic = "force-dynamic";
export const metadata = { title: "Nova compra de rotina — Compras" };

/** Cadastrar um dia: fornecedor, dia da semana, produtos e o ideal de cada um. */
export default async function NovaCompraDeRotinaPage({ searchParams }: PageProps<"/admin/compras/listas/nova">) {
  const user = await guardModule("compras", { atalho: true });
  const { fornecedor } = await searchParams;
  const { fornecedores, produtos } = await dadosDoFormulario();
  const inicial = Number(fornecedor);
  const fornecedorInicial = fornecedores.some((f) => f.id === inicial) ? inicial : null;

  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Nova compra de rotina" voltar={{ href: "/admin/compras/listas", texto: "Compras de rotina" }} />
      <FormularioDoDia
        fornecedores={fornecedores}
        produtos={produtos}
        fornecedorInicial={fornecedorInicial}
        peloLink={user.atalho}
      />
    </Pagina>
  );
}
