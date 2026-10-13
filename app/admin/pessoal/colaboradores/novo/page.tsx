import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { opcoesDeFuncao } from "@/lib/funcoes";
import { can } from "@/lib/roles";

import { COLABORADOR_VAZIO, ColaboradorForm } from "../colaborador-form";

export const metadata = { title: "Novo colaborador · Departamento pessoal" };

export default async function NovoColaboradorPage() {
  const user = await guardModule("pessoal");
  const funcoes = await opcoesDeFuncao();
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Novo colaborador" voltar={{ href: "/admin/pessoal/colaboradores", texto: "Colaboradores" }} />
      <ColaboradorForm
        id={null}
        inicial={COLABORADOR_VAZIO}
        podeValores={can(user, "pessoal", { configure: true })}
        funcoes={funcoes}
      />
    </Pagina>
  );
}
