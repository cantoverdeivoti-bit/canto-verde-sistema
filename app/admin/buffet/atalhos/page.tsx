import { AtalhosDoModulo } from "@/components/atalhos-do-modulo";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atalhos — Cardápio buffet" };

/** As telas do Cardápio buffet em cartões: é onde o módulo abre pelo menu. */
export default async function AtalhosBuffetPage() {
  const user = await guardModule("buffet");
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Cardápio buffet" />
      <AtalhosDoModulo slug="buffet" user={user} />
    </Pagina>
  );
}
