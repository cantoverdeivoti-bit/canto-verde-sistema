"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * A confirmação de apagar do painel, no lugar da janelinha cinza do celular
 * (`window.confirm`): o botão que apaga vira, ali mesmo, a pergunta com
 * "Apagar" em vermelho e "Voltar". Igual em todas as telas.
 *
 * `children` desenha o botão de sempre e recebe `abrir`, para ele continuar
 * com o ícone e o tamanho que já tinha.
 */
export function ConfirmarNaLinha({
  pergunta,
  confirmar = "Apagar",
  aoConfirmar,
  pendente = false,
  children,
}: {
  pergunta: ReactNode;
  confirmar?: string;
  aoConfirmar: () => void;
  pendente?: boolean;
  children: (abrir: () => void) => ReactNode;
}) {
  const [aberta, setAberta] = useState(false);
  if (!aberta) return <>{children(() => setAberta(true))}</>;
  return (
    <CaixaDeConfirmacao
      pergunta={pergunta}
      confirmar={confirmar}
      pendente={pendente}
      aoConfirmar={() => {
        aoConfirmar();
        setAberta(false);
      }}
      aoVoltar={() => setAberta(false)}
    />
  );
}

/**
 * A caixa da pergunta sozinha, para quando o botão e a pergunta ficam em
 * lugares diferentes (o botão sobre a foto, a pergunta embaixo dela).
 */
export function CaixaDeConfirmacao({
  pergunta,
  confirmar = "Apagar",
  aoConfirmar,
  aoVoltar,
  pendente = false,
}: {
  pergunta: ReactNode;
  confirmar?: string;
  aoConfirmar: () => void;
  aoVoltar: () => void;
  pendente?: boolean;
}) {
  return (
    <div role="alert" className="col-span-full flex w-full basis-full flex-wrap items-center gap-2 rounded-lg bg-[var(--danger-soft)] px-3 py-2">
      <p className="min-w-0 flex-1 basis-40 text-sm">{pergunta}</p>
      <div className="flex shrink-0 gap-1">
        <Button type="button" variant="destructive" size="sm" disabled={pendente} onClick={aoConfirmar}>
          {confirmar}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={aoVoltar}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
