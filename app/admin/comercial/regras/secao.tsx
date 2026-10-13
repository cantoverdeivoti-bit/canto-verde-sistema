import { ListChecks } from "lucide-react";

import { CartaoDeSecao } from "@/components/pagina";
import { getSettings } from "@/lib/availability";

import { RulesForm } from "./rules-form";

export default async function RulesPage() {
  const { rules } = await getSettings();

  return (
    <CartaoDeSecao
      id="regras"
      icone={ListChecks}
      titulo="Regras de reserva"
      frase="Quem pode reservar, com quanta antecedência e o que confirma sozinho."
    >
      <div className="max-w-2xl">
        <RulesForm
          initial={{
            isActive: rules.isActive,
            maxAdvanceValue: rules.maxAdvanceValue,
            maxAdvanceUnit: rules.maxAdvanceUnit,
            minAdvanceValue: rules.minAdvanceValue,
            minAdvanceUnit: rules.minAdvanceUnit,
            delayToleranceMinutes: rules.delayToleranceMinutes,
            minPartySize: rules.minPartySize,
            maxPartySize: rules.maxPartySize,
            autoApproveUpTo: rules.autoApproveUpTo,
            manualIfOverLimit: rules.manualIfOverLimit,
            waitlistEnabled: rules.waitlistEnabled,
            bookingNotice: rules.bookingNotice ?? "",
            endereco: rules.endereco ?? "",
            whatsapp: rules.whatsapp ?? "",
            sobreACasa: rules.sobreACasa ?? "",
            fotoUrl: rules.fotoUrl ?? "",
          }}
        />
      </div>
    </CartaoDeSecao>
  );
}
