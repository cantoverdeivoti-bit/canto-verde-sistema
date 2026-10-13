/**
 * O token que abre uma porta sem login.
 *
 * Três telas públicas vivem dele: o link da contagem para o estoquista, o da
 * cotação para o fornecedor e o do pedido direto para o exclusivo. Nenhuma
 * tem senha — quem tem o endereço, entra —, e por isso a medida é a mesma nas
 * três: 32 bytes de `crypto.getRandomValues`, 64 caracteres em hexadecimal.
 *
 * Em arquivo próprio, e não dentro de `lib/actions/cotacao.ts` onde nasceu:
 * um arquivo `"use server"` só pode exportar função assíncrona, então nada de
 * lá pode ser importado por quem não for ação de servidor. Uma cópia por
 * arquivo de ação seria o caminho natural, e é assim que três lugares passam
 * a gerar tokens de medidas diferentes sem ninguém perceber.
 */
export function novoToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
