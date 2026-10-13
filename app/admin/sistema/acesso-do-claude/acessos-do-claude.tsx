"use client";

import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criarTokenDeAcesso, revogarTokenDeAcesso } from "@/lib/actions/acesso-do-claude";

type Token = { id: number; nome: string; criadoEm: string; usadoEm: string | null };

/** Copiar para a área de transferência, com o visto por um instante. */
function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(texto).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1500);
        })
      }
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold hover:border-[var(--primary)]"
    >
      {copiado ? <Check aria-hidden className="size-4 text-[var(--ok-strong)]" /> : <Copy aria-hidden className="size-4" />}
      {copiado ? "Copiado" : rotulo}
    </button>
  );
}

/**
 * Criar um acesso (o endereço com o token aparece uma vez só), a lista dos
 * que existem com o último uso, e o passo a passo para pôr no Claude.
 */
export function AcessosDoClaude({ endereco, tokens }: { endereco: string; tokens: Token[] }) {
  const [nome, setNome] = useState("");
  const [novo, setNovo] = useState<string | null>(null);
  const [revogando, setRevogando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function criar() {
    setErro(null);
    startTransition(async () => {
      const r = await criarTokenDeAcesso(nome);
      if (!r.ok) return setErro(r.message);
      setNovo(r.token);
      setNome("");
    });
  }

  return (
    <div className="space-y-6 text-sm">
      {novo ? (
        <section className="space-y-2 rounded-xl border-2 border-[var(--primary)] bg-[var(--card)] p-3">
          <p className="font-semibold">Acesso criado. Copie o endereço agora: ele não aparece de novo.</p>
          <p className="rounded-lg bg-[var(--surface)] p-2 font-mono text-xs break-all">{`${endereco}/${novo}`}</p>
          <div className="flex flex-wrap gap-2">
            <Copiar texto={`${endereco}/${novo}`} rotulo="Copiar endereço" />
            <Button type="button" variant="ghost" size="sm" onClick={() => setNovo(null)}>
              Já copiei
            </Button>
          </div>
          <p className="hint">
            Quem tiver este endereço consulta o app como você. Não mande para ninguém; se vazar, revogue abaixo.
          </p>
        </section>
      ) : (
        <section className="space-y-2">
          <h2 className="section-label">Novo acesso</h2>
          <div className="flex flex-wrap gap-2">
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome, ex.: Claude do celular"
              maxLength={60}
              aria-label="Nome do acesso"
              className="h-10 min-w-0 flex-1 basis-56"
            />
            <Button type="button" className="h-10 gap-1.5" disabled={pendente || nome.trim().length < 2} onClick={criar}>
              <KeyRound aria-hidden className="size-4" />
              Criar acesso
            </Button>
          </div>
        </section>
      )}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="section-label">Seus acessos</h2>
        {tokens.length === 0 ? (
          <p className="text-[var(--muted-foreground)]">Nenhum acesso ainda.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.nome}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Criado em {t.criadoEm} · {t.usadoEm ? `último uso ${t.usadoEm}` : "nunca usado"}
                  </p>
                </div>
                {revogando === t.id ? (
                  <span className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={pendente}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await revogarTokenDeAcesso(t.id);
                          if (!r.ok) setErro(r.message ?? "Não deu certo.");
                          setRevogando(null);
                        })
                      }
                    >
                      Revogar
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRevogando(null)}>
                      voltar
                    </Button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRevogando(t.id)}
                    aria-label={`Revogar ${t.nome}`}
                    className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="section-label">Como pôr no Claude</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Crie um acesso acima e copie o endereço.</li>
          <li>No claude.ai, abra Configurações → Conectores e toque em Adicionar conector personalizado.</li>
          <li>Dê o nome Canto Verde e cole o endereço. Não precisa preencher mais nada.</li>
          <li>Numa conversa, ligue o conector e pergunte, por exemplo: &quot;quais as reservas de sábado?&quot;.</li>
        </ol>
        <p className="hint">
          Conector personalizado depende do plano do Claude. Outros assistentes que aceitam MCP usam o mesmo endereço.
        </p>
      </section>
    </div>
  );
}
