"use client";

import { ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { resolverAtualizacao } from "@/lib/actions/pessoal";

export type AtualizacaoPendente = {
  /** O id do link (convite), que guarda os dados novos. */
  id: number;
  colaboradorId: number;
  nome: string;
  enviado: string;
  /** Só os campos que mudaram. */
  mudancas: { campo: string; antes: string | null; depois: string | null }[];
};

/**
 * Uma atualização de cadastro que chegou pelo link: o que mudou, do jeito
 * que estava para o que a pessoa mandou. Aprovar grava no cadastro; recusar
 * descarta, e o cadastro fica como estava.
 */
export function AprovarAtualizacao({ atualizacao: a, podeAprovar }: { atualizacao: AtualizacaoPendente; podeAprovar: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function resolver(aprovar: boolean) {
    setErro(null);
    startTransition(async () => {
      const r = await resolverAtualizacao(a.id, aprovar);
      if (!r.ok) setErro(r.message ?? "Não deu certo.");
    });
  }

  return (
    <article className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-semibold">
          <Link href={`/admin/pessoal/colaboradores/${a.colaboradorId}`} className="underline-offset-4 hover:underline">
            {a.nome}
          </Link>
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">atualização · {a.enviado}</p>
      </div>

      {a.mudancas.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">Mandou os mesmos dados que já estavam no cadastro.</p>
      ) : (
        <dl className="mt-2 divide-y divide-[var(--border)] text-sm">
          {a.mudancas.map((m) => (
            <div key={m.campo} className="py-1.5">
              <dt className="text-xs text-[var(--muted-foreground)]">{m.campo}</dt>
              <dd className="flex flex-wrap items-center gap-x-1.5">
                <span className="text-[var(--muted-foreground)] line-through decoration-1">{m.antes ?? "vazio"}</span>
                <ArrowRight aria-label="passa para" className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
                <span className="font-medium">{m.depois ?? "vazio"}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}

      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}

      {podeAprovar ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" className="h-10 gap-1.5" disabled={pendente} onClick={() => resolver(true)}>
            <Check aria-hidden className="size-4" />
            Aprovar
          </Button>
          <Button type="button" variant="outline" className="h-10 gap-1.5" disabled={pendente} onClick={() => resolver(false)}>
            <X aria-hidden className="size-4" />
            Recusar
          </Button>
        </div>
      ) : (
        <p className="hint mt-2">Quem configura o Departamento pessoal aprova.</p>
      )}
    </article>
  );
}
