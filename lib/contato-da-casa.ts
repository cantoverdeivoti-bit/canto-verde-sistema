/**
 * Os links de contato da casa, iguais na página de reserva e na confirmação.
 * Saem do que o dono escreveu em Regras de reserva → Página de reserva.
 */

/** O mapa com o endereço (abre o app de mapas no celular). */
export function linkDoMapa(endereco: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`;
}

/** Conversa no WhatsApp da casa, já com a primeira frase escrita. */
export function linkDoWhatsApp(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
