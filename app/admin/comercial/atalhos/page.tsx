import { AtalhosDoModulo } from "@/components/atalhos-do-modulo";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atalhos — Reservas" };

/** As telas de Reservas em cartões: é onde o módulo abre pelo menu. */
export default async function AtalhosReservasPage() {
  const user = await guardModule("comercial");
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Reservas" />
      <AtalhosDoModulo slug="comercial" user={user} />
    </Pagina>
  );
}
