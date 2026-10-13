"use client";

import { ChevronDown, Eraser, Search, Utensils, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Gaveta } from "@/components/gaveta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COR_FORNO, custoKgTexto } from "@/lib/buffet";
import type { PratoParaEscolher } from "@/lib/buffet-dados";
import { chave } from "@/lib/format";
import type { CorForno } from "@/generated/prisma/client";

/** A bolinha da cor do forno: verde 100% no combinado, azul parcial. */
export function CorDoForno({ cor, espaco = false }: { cor: CorForno; espaco?: boolean }) {
  const c = COR_FORNO[cor].cor;
  // Com `espaco`, o prato sem cor guarda o lugar da bolinha e os nomes ficam alinhados.
  if (!c) return espaco ? <span className="size-2 shrink-0" aria-hidden /> : null;
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: c }} title={COR_FORNO[cor].nome} aria-label={COR_FORNO[cor].nome} />;
}

/**
 * A escolha do prato de uma posição: os pratos ligados do grupo por
 * categoria, cada uma abre e fecha. Começa com tudo fechado, menos a
 * categoria do prato que está na posição; buscando, abre o que achou.
 * Serve ao cardápio-modelo e à troca do dia, que pede também o motivo.
 */
export function EscolherPrato({
  titulo,
  subtitulo,
  atual,
  noDia,
  pratos,
  escolher,
  comMotivo = false,
  extra,
  pendente,
  erro,
  fechar,
}: {
  titulo: string;
  subtitulo: string;
  atual: { id: number; nome: string } | null;
  noDia: Set<number>;
  pratos: PratoParaEscolher[];
  escolher: (pratoId: number | null, motivo: string) => void;
  comMotivo?: boolean;
  /** Um botão a mais embaixo do cabeçalho, como "voltar ao modelo". */
  extra?: ReactNode;
  pendente: boolean;
  erro: string | null;
  fechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [motivo, setMotivo] = useState("");
  const visiveis = pratos.filter((p) => chave(`${p.nome} ${p.categoria ?? ""}`).includes(chave(busca)));
  const SEM = "Sem categoria";
  const categorias = [...new Set(visiveis.map((p) => p.categoria ?? SEM))].sort((a, b) =>
    a === SEM ? 1 : b === SEM ? -1 : a.localeCompare(b, "pt-BR"),
  );
  const daPosicao = pratos.find((p) => p.id === atual?.id)?.categoria ?? null;
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(daPosicao ? [daPosicao] : []));
  const alternar = (c: string) =>
    setAbertas((a) => {
      const n = new Set(a);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  return (
    <Gaveta rotulo={titulo} aoFechar={fechar}>
        <div className="flex items-start gap-3 border-b border-[var(--border)] p-4">
          <Utensils aria-hidden className="mt-0.5 size-5 shrink-0 text-[var(--primary)]" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">{titulo}</p>
            <p className="truncate text-sm text-[var(--muted-foreground)]">{subtitulo}</p>
          </div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="-m-1 p-1 text-[var(--muted-foreground)]">
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {extra && <div className="border-b border-[var(--border)] p-3">{extra}</div>}
        {comMotivo && (
          <label className="block px-3 pt-3">
            <span className="label">Motivo da troca</span>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder="Ex.: faltou abóbora" />
          </label>
        )}
        <div className="flex gap-2 p-3">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar prato ou categoria"
              aria-label="Buscar prato"
              autoFocus={!comMotivo}
              className="w-full pl-9"
            />
          </div>
          {atual && (
            <Button type="button" variant="outline" disabled={pendente} onClick={() => escolher(null, motivo)} className="h-11 shrink-0 gap-1.5">
              <Eraser aria-hidden className="size-4" />
              Deixar vazia
            </Button>
          )}
        </div>
        {erro && (
          <p role="alert" className="msg-error mx-3 mb-2">
            {erro}
          </p>
        )}
        <ul className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto border-t border-[var(--border)]">
          {visiveis.length === 0 && <li className="p-4 text-sm text-[var(--muted-foreground)]">Nenhum prato ligado com esse nome neste grupo.</li>}
          {categorias.map((c) => {
            const daCategoria = visiveis.filter((p) => (p.categoria ?? SEM) === c);
            // Buscando, tudo que achou fica à mostra.
            const aberta = busca.trim() !== "" || abertas.has(c);
            return (
              <li key={c}>
                <button
                  type="button"
                  aria-expanded={aberta}
                  onClick={() => alternar(c)}
                  className="sticky top-0 z-10 flex w-full items-center gap-2 bg-[var(--muted)] px-4 py-2 text-left text-sm font-semibold"
                >
                  <ChevronDown aria-hidden className={`size-4 shrink-0 transition-transform ${aberta ? "" : "-rotate-90"}`} />
                  <span className="min-w-0 flex-1 truncate">{c}</span>
                  <span className="text-xs font-normal text-[var(--muted-foreground)]">{daCategoria.length}</span>
                </button>
                {aberta && (
                  <ul className="divide-y divide-[var(--border)]">
                    {daCategoria.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={pendente || p.id === atual?.id}
                          onClick={() => escolher(p.id, motivo)}
                          className="flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-[var(--muted)] disabled:opacity-50"
                        >
                          <CorDoForno cor={p.corForno} espaco />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{p.nome}</span>
                            {/* O aviso numa linha só dele, embaixo do nome: ao lado, ele cortava o nome. */}
                            {(p.id === atual?.id || noDia.has(p.id)) && (
                              <span className="block text-[11px] leading-4 font-medium text-[var(--primary)]">
                                {p.id === atual?.id ? "está aqui" : "já está neste dia"}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums">{custoKgTexto(p.custoKg)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
    </Gaveta>
  );
}
