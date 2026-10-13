"use client";

import { useEffect } from "react";

/**
 * Segue para o painel assim que a rodinha aparece. `replace`, e não um link:
 * o voltar do celular não deve cair de novo na tela de abertura. Enquanto o
 * painel não chega, o navegador mantém esta tela, com a rodinha girando.
 */
export function IrParaOPainel() {
  useEffect(() => {
    window.location.replace("/admin");
  }, []);
  return (
    <noscript>
      <a href="/admin" className="text-sm underline">
        Entrar no painel
      </a>
    </noscript>
  );
}
