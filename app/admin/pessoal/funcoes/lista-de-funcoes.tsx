"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apagarFuncao, criarFuncao, ligarFuncao, renomearFuncao } from "@/lib/actions/pessoal";
import { plural } from "@/lib/format";

type Item = { id: number; nome: string; ativo: boolean; pessoas: number };

/**
 * A lista das funções, com criar, renomear, desligar e apagar. Apagar só
 * aparece na que ninguém usa; com gente nela, o caminho é desligar.
 */
export function ListaDeFuncoes({ itens, podeConfigurar }: { itens: Item[]; podeConfigurar: boolean }) {
  const [nova, setNova] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [apagando, setApagando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function rodar(acao: () => Promise<{ ok: boolean; message?: string }>, depois?: () => void) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      depois?.();
    });
  }

  return (
    <div className="space-y-3">
      {podeConfigurar && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            rodar(() => criarFuncao(nova), () => setNova(""));
          }}
          className="flex gap-2"
        >
          <Input
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder="Nova função, ex.: Garçom"
            maxLength={60}
            aria-label="Nome da nova função"
            className="min-w-0 flex-1"
          />
          <Button type="submit" className="h-11 shrink-0 gap-1.5" disabled={pendente || nova.trim().length < 2}>
            <Plus aria-hidden className="size-4" />
            Criar
          </Button>
        </form>
      )}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {itens.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Nenhuma função cadastrada ainda.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {itens.map((f) => (
            <li key={f.id} className={`flex min-h-14 items-center gap-2 px-3 py-2 ${f.ativo ? "" : "opacity-60"}`}>
              {editando === f.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    rodar(() => renomearFuncao(f.id, nome), () => setEditando(null));
                  }}
                  className="flex min-w-0 flex-1 items-center gap-1.5"
                >
                  <Input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    maxLength={60}
                    aria-label={`Novo nome de ${f.nome}`}
                    autoFocus
                    className="h-10 min-w-0 flex-1"
                  />
                  <button
                    type="submit"
                    disabled={pendente}
                    aria-label="Salvar o nome"
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]"
                  >
                    <Check aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(null)}
                    aria-label="Cancelar"
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{f.nome}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {f.ativo ? (f.pessoas === 0 ? "ninguém ativo" : plural(f.pessoas, "pessoa ativa", "pessoas ativas")) : "desligada: não aparece para escolher"}
                    </p>
                  </div>
                  {podeConfigurar &&
                    (apagando === f.id ? (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={pendente}
                          onClick={() => rodar(() => apagarFuncao(f.id), () => setApagando(null))}
                        >
                          Apagar
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setApagando(null)}>
                          voltar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => rodar(() => ligarFuncao(f.id, !f.ativo))}
                          disabled={pendente}
                          className="chip px-2.5 py-1 text-xs"
                        >
                          {f.ativo ? "Desligar" : "Ligar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setNome(f.nome);
                            setEditando(f.id);
                            setApagando(null);
                          }}
                          aria-label={`Renomear ${f.nome}`}
                          title="Renomear"
                          className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                        >
                          <Pencil aria-hidden className="size-4" />
                        </button>
                        {/* Sem lixeira, um vazio do mesmo tamanho: os botões ficam alinhados de linha a linha. */}
                        {f.pessoas > 0 && <span aria-hidden className="size-9" />}
                        {f.pessoas === 0 && (
                          <button
                            type="button"
                            onClick={() => setApagando(f.id)}
                            aria-label={`Apagar ${f.nome}`}
                            title="Apagar"
                            className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
                          >
                            <Trash2 aria-hidden className="size-4" />
                          </button>
                        )}
                      </div>
                    ))}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {podeConfigurar && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Renomear vale para todo mundo que tem a função. Desligar tira da lista de escolha sem mexer em quem já tem.
        </p>
      )}
    </div>
  );
}
