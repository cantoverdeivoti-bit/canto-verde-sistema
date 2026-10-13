"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Um valor com o "mudar" ao lado, que vira campo e salvar. Serve ao
 * faturamento de cada mês e à meta do CMO.
 */
export function EditarValor({
  rotulo,
  mostrado,
  inicial,
  vazio,
  ajuda,
  placeholder,
  largura = "w-40",
  salvar,
}: {
  /** O nome do campo, para o leitor de tela e para o rótulo do formulário. */
  rotulo: string;
  /** Como o valor aparece fechado, ou nulo quando não há valor. */
  mostrado: React.ReactNode | null;
  /** O texto que o campo abre preenchido. */
  inicial: string;
  /** O botão quando não há valor: "Digitar faturamento". */
  vazio: string;
  ajuda?: string;
  placeholder?: string;
  largura?: string;
  salvar: (texto: string) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (!aberto) {
    return (
      <span className="inline-flex flex-wrap items-baseline gap-x-2">
        {mostrado}
        <button
          type="button"
          onClick={() => {
            setTexto(inicial);
            setErro(null);
            setAberto(true);
          }}
          className="text-sm text-[var(--primary)] underline underline-offset-4"
        >
          {mostrado === null ? vazio : "Mudar"}
        </button>
      </span>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        startTransition(async () => {
          const r = await salvar(texto);
          if (!r.ok) return setErro(r.message ?? "Não deu certo.");
          setAberto(false);
        });
      }}
      className="mt-1 space-y-2"
    >
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{rotulo}</span>
        <div className="flex flex-wrap gap-2">
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            inputMode="decimal"
            placeholder={placeholder}
            className={`${largura} h-10`}
            autoFocus
          />
          <Button type="submit" className="h-10" disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar"}
          </Button>
          <Button type="button" variant="ghost" className="h-10" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
        </div>
      </label>
      {ajuda && <p className="text-xs text-[var(--muted-foreground)]">{ajuda}</p>}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </form>
  );
}
