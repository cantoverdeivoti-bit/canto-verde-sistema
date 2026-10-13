import type { KeyboardEvent } from "react";

/**
 * Enter numa caixa de valor pula para a próxima caixa de valor — a de baixo,
 * mesmo que seja de outro item —, em vez de enviar ou de parar.
 *
 * As caixas de valor são as marcadas com `data-valor`; as outras (observação,
 * por exemplo) ficam fora do caminho do Enter. Na última, o teclado fecha:
 * enviar continua sendo só pelo botão.
 *
 * Vai no `onKeyDown` do contêiner (o `form` ou a lista), e vale para qualquer
 * campo dentro dele.
 */
export function enterProximoValor(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter" || !(e.target instanceof HTMLInputElement)) return;
  e.preventDefault();

  const campo = e.target;
  const caixas = [
    ...e.currentTarget.querySelectorAll<HTMLInputElement>("input[data-valor]:not(:disabled)"),
  ];
  // A primeira caixa depois deste campo na ordem da página.
  const proxima = caixas.find(
    (c) => c !== campo && campo.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  if (proxima) {
    proxima.focus();
    proxima.select();
  } else campo.blur();
}
