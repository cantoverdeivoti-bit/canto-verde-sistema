import { AtalhosDoModulo } from "@/components/atalhos-do-modulo";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atalhos · Financeiro" };

/** As telas do Financeiro em cartões: é onde o módulo abre pelo menu. */
export default async function AtalhosFinanceiroPage() {
  const user = await guardModule("financeiro");
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Financeiro" />
      <AtalhosDoModulo slug="financeiro" user={user} />
    </Pagina>
  );
}
