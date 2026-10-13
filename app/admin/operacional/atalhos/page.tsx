import { AtalhosDoModulo } from "@/components/atalhos-do-modulo";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atalhos — Operacional" };

/** As telas do Operacional em cartões: é onde o módulo abre pelo menu. */
export default async function AtalhosOperacionalPage() {
  const user = await guardModule("operacional");
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Operacional" />
      <AtalhosDoModulo slug="operacional" user={user} />
    </Pagina>
  );
}
