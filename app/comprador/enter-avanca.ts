import type { KeyboardEvent } from "react";

/**
 * Enter num campo passa para o próximo campo, em vez de enviar a resposta.
 *
 * O link é um `<form>` só, com o botão de enviar no pé. Pela regra do
 * navegador, Enter num campo de texto envia o formulário. No celular, a tecla
 * de confirmar do teclado é Enter, e quem digitava o preço e tocava nela
 * mandava a cotação pela metade, com os itens que ainda nem tinha visto.
 *
 * O próximo campo é procurado dentro do mesmo item (`li`), e não na página
 * inteira: pular para o item de baixo abriria o teclado num produto que ele
 * não escolheu responder. No último campo do item o teclado só fecha. Enviar
 * continua sendo só pelo botão.
 */
export function enterAvanca(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
  e.preventDefault();

  const campo = e.target;
  const escopo = campo.closest("li") ?? e.currentTarget;
  const campos = [
    ...escopo.querySelectorAll<HTMLInputElement>("input:not([type=hidden]):not(:disabled)"),
  ];
  const proximo = campos[campos.indexOf(campo) + 1];
  if (proximo) proximo.focus();
  else campo.blur();
}
