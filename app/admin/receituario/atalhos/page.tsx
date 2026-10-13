import { AtalhosDoModulo } from "@/components/atalhos-do-modulo";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atalhos — Receituário" };

/** As telas do Receituário em cartões: é onde o módulo abre pelo menu. */
export default async function AtalhosReceituarioPage() {
  const user = await guardModule("receituario");
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Receituário" />
      <AtalhosDoModulo slug="receituario" user={user} />
    </Pagina>
  );
}
