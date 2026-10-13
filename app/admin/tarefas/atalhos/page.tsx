import { AtalhosDoModulo } from "@/components/atalhos-do-modulo";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atalhos — Tarefas" };

/** As telas de Tarefas em cartões: é onde o módulo abre pelo menu. */
export default async function AtalhosTarefasPage() {
  const user = await guardModule("tarefas");
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Tarefas" />
      <AtalhosDoModulo slug="tarefas" user={user} />
    </Pagina>
  );
}
