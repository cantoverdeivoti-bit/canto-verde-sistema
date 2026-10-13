"use client";

import { useState, useTransition } from "react";

import { Textarea } from "@/components/ui/textarea";
import { updateCotacaoSettings } from "@/lib/actions/compras";

import { SaveRow } from "../../save-button";

type Values = { mensagemFornecedor: string };

export function CotacaoForm({ initial }: { initial: Values }) {
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateCotacaoSettings(values);
      setError(result.ok ? null : (result.message ?? "Falhou."));
      setSaved(result.ok);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <label className="block text-sm">
        <span className="mb-0.5 block font-medium">Mensagem para o fornecedor</span>
        <Textarea
          rows={5}
          maxLength={2000}
          value={values.mensagemFornecedor}
          onChange={(e) => {
            setValues({ mensagemFornecedor: e.target.value });
            setSaved(false);
          }}
          className="resize-y"
          placeholder="ex: Entregas só de terça a sexta."
        />
        <span className="hint">
          Aparece acima da lista de itens, na página que o fornecedor abre pelo
          link. As quebras de linha são respeitadas. Em branco, o link não mostra
          mensagem nenhuma.
        </span>
      </label>

      <SaveRow pending={pending} error={error} saved={saved} />
    </form>
  );
}
