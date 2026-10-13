import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { sugestoesDoBuffet } from "@/lib/buffet-dados";
import { can } from "@/lib/permissions";

import { ListaDeSugestoes } from "./lista-de-sugestoes";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sugestões · Cardápio buffet" };

/**
 * As mudanças no buffet de quem não configura o módulo: o cardápio da
 * semana, a troca do dia e o cadastro de pratos só valem depois de
 * aprovadas. Quem configura aprova ou recusa; quem sugeriu vê as suas e em
 * que pé estão.
 */
export default async function SugestoesDoBuffetPage() {
  const user = await guardModule("buffet");
  const aprova = can(user, "buffet", { configure: true });
  const { pendentes, decididas } = await sugestoesDoBuffet(aprova ? undefined : user.id);
  return (
    <Pagina largura="media">
      <CabecalhoDaPagina
        titulo="Sugestões"
        subtitulo={aprova ? "Mudanças que esperam a sua aprovação." : "O que você mudou e espera aprovação. Enquanto ninguém decide, dá para retirar."}
        ajuda={
          aprova
            ? "O que foi mudado no cardápio, nas trocas do dia e nos pratos por quem precisa de aprovação. Só vale depois que você aprovar."
            : undefined
        }
      />
      <ListaDeSugestoes pendentes={pendentes} decididas={decididas} aprova={aprova} />
    </Pagina>
  );
}
