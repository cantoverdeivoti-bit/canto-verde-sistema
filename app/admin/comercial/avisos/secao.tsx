import { Bell } from "lucide-react";

import { CartaoDeSecao } from "@/components/pagina";
import { prisma } from "@/lib/db";

import { NotificationsForm } from "./notifications-form";

export default async function NotificationsPage() {
  const settings = await prisma.notificationSettings.findUnique({
    where: { id: 1 },
  });

  if (!settings) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Configuração ausente — rode o seed do banco.
      </p>
    );
  }

  const resendConfigured = Boolean(process.env.RESEND_API_KEY);

  return (
    <CartaoDeSecao id="avisos" icone={Bell} titulo="Avisos" frase="Quem recebe a mensagem quando entra uma reserva.">
      {!resendConfigured && (
        <div className="msg-warn max-w-2xl">
          <p className="font-semibold">Envio de e-mail não configurado</p>
          <p className="mt-1">
            A variável <code>RESEND_API_KEY</code> está vazia. As reservas
            continuam funcionando normalmente, mas nenhum e-mail é enviado até
            configurá-la.
          </p>
        </div>
      )}

      <div className="max-w-2xl">
        <NotificationsForm
          initial={{
            restaurantEmail: settings.restaurantEmail,
            notifyRestaurant: settings.notifyRestaurant,
            notifyCustomer: settings.notifyCustomer,
            channel: settings.channel,
            sendReminderHours: settings.sendReminderHours,
          }}
        />
      </div>
    </CartaoDeSecao>
  );
}
