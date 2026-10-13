import { AtalhosDoModulo } from "@/components/atalhos-do-modulo";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atalhos — Departamento pessoal" };

/** As telas de Departamento pessoal em cartões: é onde o módulo abre pelo menu. */
export default async function AtalhosPessoalPage() {
  const user = await guardModule("pessoal");
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Departamento pessoal" />
      <AtalhosDoModulo slug="pessoal" user={user} />
    </Pagina>
  );
}
