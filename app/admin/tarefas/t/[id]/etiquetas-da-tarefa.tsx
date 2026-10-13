"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { etiquetar, tirarEtiqueta } from "@/lib/actions/tarefas";

/**
 * As etiquetas da tarefa, e o campo de pôr outra.
 *
 * As sugestões são as etiquetas que o quadro já tem: escolher uma existente
 * é o que evita "Eletrica", "elétrica" e "ELÉTRICA" no mesmo quadro (e a ação
 * junta as três de qualquer jeito). Nome de pessoa é recusado pela ação, com
 * o motivo dito aqui embaixo do campo.
 */
export function EtiquetasDaTarefa({
  tarefaId,
  etiquetas,
  sugestoes,
  podeEditar,
}: {
  tarefaId: number;
  etiquetas: { id: number; nome: string }[];
  sugestoes: string[];
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (etiquetas.length === 0 && !podeEditar) return null;

  function rodar(acao: () => Promise<{ ok: boolean; message?: string }>, depois?: () => void) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      depois?.();
      router.refresh();
    });
  }

  return (
    <section id="etiquetas">
      <h2 className="section-label">Etiquetas</h2>

      {etiquetas.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {etiquetas.map((e) => (
            <li key={e.id} className="selo inline-flex items-center gap-1">
              {e.nome}
              {podeEditar && (
                <button
                  type="button"
                  className="-mr-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] print:hidden"
                  aria-label={`Tirar a etiqueta ${e.nome}`}
                  disabled={pendente}
                  onClick={() => rodar(() => tirarEtiqueta(tarefaId, e.id))}
                >
                  <X aria-hidden className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {podeEditar && (
        <form
          className="mt-3 print:hidden"
          onSubmit={(ev) => {
            ev.preventDefault();
            const n = nome.trim();
            if (n === "") return;
            rodar(() => etiquetar(tarefaId, { nome: n }), () => setNome(""));
          }}
        >
          <label className="sr-only" htmlFor="nova-etiqueta">
            Nova etiqueta
          </label>
          <input
            id="nova-etiqueta"
            className="field text-sm"
            value={nome}
            onChange={(ev) => setNome(ev.target.value)}
            placeholder="+ etiqueta"
            maxLength={30}
            list="etiquetas-do-quadro"
            disabled={pendente}
          />
          <datalist id="etiquetas-do-quadro">
            {sugestoes.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </form>
      )}

      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}
    </section>
  );
}
