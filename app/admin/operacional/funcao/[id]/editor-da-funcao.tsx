"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { marcarObrigatorio, salvarDescricaoDaFuncao } from "@/lib/actions/operacional";

import { useAcao } from "@/lib/use-acao";

type Processo = { id: number; titulo: string };

/**
 * O que se monta numa função: as responsabilidades em texto e os processos
 * que ela precisa saber. Quem não configura o módulo só lê.
 */
export function EditorDaFuncao({
  funcao,
  processos,
  obrigatorios,
  podeMudar,
}: {
  funcao: { id: number; descricao: string };
  processos: Processo[];
  obrigatorios: number[];
  podeMudar: boolean;
}) {
  const { erro, pendente, rodar } = useAcao();
  const [descricao, setDescricao] = useState(funcao.descricao);
  // Marca na hora do toque; se a gravação falhar, volta como estava.
  const [marcados, setMarcados] = useState(obrigatorios);
  const alternarObrigatorio = (processoId: number) => {
    const marcar = !marcados.includes(processoId);
    const antes = marcados;
    setMarcados(marcar ? [...marcados, processoId] : marcados.filter((x) => x !== processoId));
    rodar(() =>
      marcarObrigatorio(funcao.id, processoId, marcar).then((r) => {
        if (!r.ok) setMarcados(antes);
        return r;
      }),
    );
  };

  return (
    <div className="space-y-6">
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <section>
        <h2 className="section-label mb-2">Responsabilidades</h2>
        {podeMudar ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rodar(() => salvarDescricaoDaFuncao(funcao.id, descricao));
            }}
            className="space-y-2"
          >
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="O que esta função cuida no dia a dia. Ex.: preparar as carnes do buffet, manter a chapa limpa, repor o balcão quente."
            />
            {descricao !== funcao.descricao && (
              <Button type="submit" className="h-10" disabled={pendente}>
                Salvar
              </Button>
            )}
          </form>
        ) : (
          <p className="text-sm whitespace-pre-line">{funcao.descricao || "Sem descrição ainda."}</p>
        )}
      </section>

      <section>
        <h2 className="section-label mb-1">Processos que a função precisa saber</h2>
        <p className="mb-2 text-xs text-[var(--muted-foreground)]">Quem tem a função e ainda não foi treinado num destes aparece como pendente em Treinamento.</p>
        {processos.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nenhum processo cadastrado.{" "}
            <Link href="/admin/operacional/processos" className="text-[var(--primary)] underline underline-offset-4">
              Criar em Processos
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {processos.map((p) => {
              const marcado = marcados.includes(p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={!podeMudar}
                    onChange={() => alternarObrigatorio(p.id)}
                    aria-label={`${p.titulo} é obrigatório`}
                    className="size-5 shrink-0 accent-[var(--primary)]"
                  />
                  <Link href={`/admin/operacional/processos/${p.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                    {p.titulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
