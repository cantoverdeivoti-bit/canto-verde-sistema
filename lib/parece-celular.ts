/**
 * O palpite do servidor: celular ou computador, pelos cabeçalhos que o
 * navegador manda. Serve para a primeira pintura sair no formato certo; na
 * tela, quem manda depois é a largura de verdade (`useTelaGrande`).
 *
 * Arquivo à parte do gancho porque este roda no servidor, e o gancho só pode
 * ser importado por componente de cliente.
 */
export function pareceCelular(cabecalhos: Headers) {
  return (
    cabecalhos.get("sec-ch-ua-mobile") === "?1" ||
    /Mobi|Android|iPhone|iPad/i.test(cabecalhos.get("user-agent") ?? "")
  );
}
