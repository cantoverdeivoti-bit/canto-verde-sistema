import { Armchair, Bell, CalendarX, Clock, ListChecks } from "lucide-react";

import { GradeDeAtalhos } from "@/components/grade-de-atalhos";
import { CabecalhoDaPagina, Pagina } from "@/components/pagina";

import CapacitySection from "../capacidade/secao";
import RulesSection from "../regras/secao";
import NotificationsSection from "../avisos/secao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações — Reservas" };

/**
 * Tudo que configura o módulo numa tela só, a pedido do dono: salão e
 * horários, regras de reserva e avisos deixam de ser três abas e viram três
 * seções da mesma página, cada uma num cartão, com a grade de atalhos no alto. As telas antigas viraram componentes (`secao.tsx`,
 * importados daqui) e os endereços delas redirecionam para cá, cada um para
 * a sua seção (`#capacidade`, `#regras`, `#avisos`; ver `next.config.ts`).
 */
export default function ReservationSettingsPage() {
  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina titulo="Configurações de reservas" subtitulo="Salão, horários, regras e avisos." />
      {/* Os atalhos para cada parte, no desenho das abas dos Relatórios. */}
      <GradeDeAtalhos
        rotulo="Partes das configurações"
        atalhos={[
          { href: "#capacidade", nome: "Salão", icone: Armchair },
          { href: "#horarios", nome: "Horários", icone: Clock },
          { href: "#datas", nome: "Datas especiais", icone: CalendarX },
          { href: "#regras", nome: "Regras", icone: ListChecks },
          { href: "#avisos", nome: "Avisos", icone: Bell },
        ]}
      />
      <CapacitySection />
      <RulesSection />
      <NotificationsSection />
    </Pagina>
  );
}
