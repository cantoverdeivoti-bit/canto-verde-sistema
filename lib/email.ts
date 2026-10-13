import { Resend } from "resend";

/**
 * O envio de e-mail do sistema, num lugar só: o aviso de reserva e o
 * relatório de compras saem pelo mesmo cliente do Resend e do mesmo
 * remetente.
 *
 * Sem `RESEND_API_KEY` o cliente é nulo, e quem chama decide o que fazer —
 * nada aqui derruba quem pediu o envio. Sem domínio verificado no Resend, o
 * remetente padrão (onboarding@resend.dev) só entrega para o e-mail dono da
 * conta do Resend.
 */
export const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export const REMETENTE = process.env.RESEND_FROM ?? "Reservas <onboarding@resend.dev>";

export function emailConfigurado(): boolean {
  return resend !== null;
}

/** O endereço do site, sem barra no fim, para os links dos e-mails. Nulo sem `APP_URL`. */
export function enderecoDoSite(): string | null {
  return process.env.APP_URL?.replace(/\/$/, "") || null;
}
