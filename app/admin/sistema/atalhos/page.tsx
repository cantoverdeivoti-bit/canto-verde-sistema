import { redirect } from "next/navigation";

import { AtalhosDoModulo } from "@/components/atalhos-do-modulo";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { getCurrentUser } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Atalhos — Configurações gerais" };

/**
 * As telas de Configurações gerais em cartões. Basta estar logado, como a
 * Página inicial e as Minhas notificações; Usuários só aparece para quem
 * configura o sistema.
 */
export default async function AtalhosSistemaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  if (user.atalho) redirect("/atalhos");
  return (
    <Pagina largura="estreita">
      <CabecalhoDaPagina titulo="Configurações gerais" />
      <AtalhosDoModulo slug="sistema" user={user} />
    </Pagina>
  );
}
