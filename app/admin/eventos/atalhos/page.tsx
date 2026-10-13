import { AtalhosDoModulo } from "@/components/atalhos-do-modulo";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atalhos — Eventos" };

/** As telas de Eventos em cartões: é onde o módulo abre pelo menu. */
export default async function AtalhosEventosPage() {
  const user = await guardModule("eventos");
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Eventos" />
      <AtalhosDoModulo slug="eventos" user={user} />
    </Pagina>
  );
}
