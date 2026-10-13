"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { removerMembro, salvarMembro } from "@/lib/actions/tarefas";
import { plural } from "@/lib/format";
import { PAPEIS_PROJETO, PAPEL_PROJETO_LABEL } from "@/lib/tarefas-labels";
import type { PapelProjeto } from "@/generated/prisma/client";

export type MembroRow = {
  userId: number;
  nome: string;
  papel: PapelProjeto;
  /** Dono do quadro não sai dele (RN-017). */
  ehDono: boolean;
  /** Tarefas abertas desta pessoa NESTE quadro. */
  abertas: number;
};

/**
 * A lista de membros: uma linha por pessoa, com o papel no seletor.
 *
 * Incluir e mudar papel são a mesma ação, de propósito — separá-las criaria
 * dois caminhos para o mesmo gesto, e a tela já é uma lista com um seletor por
 * linha.
 *
 * A explicação do papel fica junto do nome dele, sempre. "Gestor" e "Editor"
 * não dizem nada a quem trabalha na cozinha, e esta é exatamente a tela onde
 * alguém escolhe errado por não entender a palavra.
 */
export function MembrosLista({
  projetoId,
  membros,
  candidatos,
}: {
  projetoId: number;
  membros: MembroRow[];
  candidatos: { id: number; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [tirando, setTirando] = useState<number | null>(null);
  const [novoId, setNovoId] = useState("");
  const [novoPapel, setNovoPapel] = useState<PapelProjeto>("EXECUTOR");

  function rodar(acao: () => Promise<{ ok: boolean; message?: string }>) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      setTirando(null);
      setNovoId("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <section>
        <h2 className="section-label">
          No quadro · {plural(membros.length, "pessoa", "pessoas")}
        </h2>
        <ul className="mt-3 space-y-2">
          {membros.map((m) => (
            <li key={m.userId} className="card p-2.5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="font-medium">{m.nome}</p>
                {m.ehDono && (
                  <span className="selo" style={{ color: "var(--muted-foreground)" }}>
                    dono do quadro
                  </span>
                )}
                {m.abertas > 0 && (
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {plural(m.abertas, "tarefa aberta", "tarefas abertas")}
                  </span>
                )}

                <div className="ml-auto flex items-center gap-2">
                  <label className="sr-only" htmlFor={`papel-${m.userId}`}>
                    Papel de {m.nome}
                  </label>
                  <select
                    id={`papel-${m.userId}`}
                    className="field w-auto py-1.5 text-sm"
                    value={m.papel}
                    disabled={pendente}
                    onChange={(e) =>
                      rodar(() =>
                        salvarMembro(projetoId, {
                          userId: m.userId,
                          papel: e.target.value as PapelProjeto,
                        }),
                      )
                    }
                  >
                    {PAPEIS_PROJETO.map((p) => (
                      <option key={p} value={p}>
                        {PAPEL_PROJETO_LABEL[p].texto}
                      </option>
                    ))}
                  </select>

                  {!m.ehDono && (
                    <button
                      type="button"
                      className="text-sm text-[var(--destructive)] underline-offset-4 hover:underline"
                      disabled={pendente}
                      onClick={() => setTirando(tirando === m.userId ? null : m.userId)}
                    >
                      Tirar
                    </button>
                  )}
                </div>
              </div>

              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {PAPEL_PROJETO_LABEL[m.papel].explicacao}
              </p>

              {/* A confirmação diz ANTES do clique o que acontece com o que a
                  pessoa já carrega. Tirar alguém com tarefa aberta é recusado
                  pela ação, e a mensagem diz quantas são. */}
              {tirando === m.userId && (
                <div className="mt-2 space-y-2 rounded border border-dashed border-[var(--border)] p-2.5">
                  <p className="text-sm font-medium">Tirar {m.nome} do quadro?</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {m.abertas > 0
                      ? `Tem ${plural(m.abertas, "tarefa aberta", "tarefas abertas")} com esta pessoa aqui. Passe para outra antes — o sistema não deixa sair assim.`
                      : "Ela deixa de ver este quadro e de receber tarefas dele. O que já fez continua no histórico."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pendente}
                      onClick={() => rodar(() => removerMembro(projetoId, m.userId))}
                    >
                      Tirar do quadro
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pendente}
                      onClick={() => setTirando(null)}
                    >
                      Voltar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="section-label">Incluir alguém</h2>
        {candidatos.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted-foreground)]">
            Todo mundo com conta ativa já está neste quadro. Conta nova se cria
            em Configurações gerais, em Usuários.
          </p>
        ) : (
          <>
            <form
              className="mt-3 flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (novoId === "") return;
                rodar(() =>
                  salvarMembro(projetoId, { userId: Number(novoId), papel: novoPapel }),
                );
              }}
            >
              <div className="min-w-48 flex-1">
                <label className="label" htmlFor="novo-membro">
                  Quem
                </label>
                <select
                  id="novo-membro"
                  className="field"
                  value={novoId}
                  onChange={(e) => setNovoId(e.target.value)}
                >
                  <option value="">escolha a pessoa</option>
                  {candidatos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-40">
                <label className="label" htmlFor="novo-papel">
                  Como
                </label>
                <select
                  id="novo-papel"
                  className="field"
                  value={novoPapel}
                  onChange={(e) => setNovoPapel(e.target.value as PapelProjeto)}
                >
                  {PAPEIS_PROJETO.map((p) => (
                    <option key={p} value={p}>
                      {PAPEL_PROJETO_LABEL[p].texto}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit" disabled={pendente || novoId === ""}>
                {pendente ? "Incluindo…" : "Incluir"}
              </Button>
            </form>
            <p className="hint">{PAPEL_PROJETO_LABEL[novoPapel].explicacao}</p>
          </>
        )}
      </section>
    </div>
  );
}
