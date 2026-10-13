"use client";

import { ArrowDown, ArrowUp, FileText, ListOrdered, Plus, StickyNote, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CartaoDeSecao } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { salvarProcesso, type ProcessoInput } from "@/lib/actions/operacional";

/**
 * O processo em texto: título, objetivo, os passos numerados (subir,
 * descer, apagar) e observações. Salvar conta como revisado hoje.
 */
export function FormDoProcesso({ id, inicial }: { id: number | null; inicial: ProcessoInput }) {
  const router = useRouter();
  const [v, setV] = useState({ ...inicial, passos: inicial.passos.length > 0 ? inicial.passos : [""] });
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const mudaPasso = (i: number, texto: string) => setV((a) => ({ ...a, passos: a.passos.map((p, n) => (n === i ? texto : p)) }));
  const mover = (i: number, sentido: -1 | 1) =>
    setV((a) => {
      const passos = [...a.passos];
      [passos[i], passos[i + sentido]] = [passos[i + sentido], passos[i]];
      return { ...a, passos };
    });
  const rotulo = "mb-1 block text-sm font-medium";
  const botao = "flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--muted)] disabled:opacity-40";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        startTransition(async () => {
          const r = await salvarProcesso(id, v);
          if (!r.ok) return setErro(r.message);
          router.push(`/admin/operacional/processos/${r.id}`);
          router.refresh();
        });
      }}
      className="space-y-4"
    >
      {/* Três cartões, como as outras telas: o que é, os passos e os cuidados. */}
      <CartaoDeSecao icone={FileText} titulo="O processo" frase="O nome e para que serve.">
      <label className="block">
        <span className={rotulo}>Título</span>
        <Input value={v.titulo} onChange={(e) => setV({ ...v, titulo: e.target.value })} maxLength={120} placeholder="Ex.: Abertura da cozinha" required />
      </label>
      <label className="block">
        <span className={rotulo}>
          Objetivo <span className="font-normal text-[var(--muted-foreground)]">(para que serve)</span>
        </span>
        <Textarea value={v.objetivo ?? ""} onChange={(e) => setV({ ...v, objetivo: e.target.value })} rows={2} maxLength={500} />
      </label>
      </CartaoDeSecao>
      <CartaoDeSecao icone={ListOrdered} titulo="Passos" frase="Um por linha, na ordem em que se faz.">
        <ol className="space-y-2">
          {v.passos.map((p, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2.5 w-6 shrink-0 text-right text-sm font-semibold tabular-nums">{i + 1}.</span>
              <Textarea value={p} onChange={(e) => mudaPasso(i, e.target.value)} rows={2} maxLength={500} aria-label={`Passo ${i + 1}`} className="min-w-0 flex-1" />
              <span className="flex shrink-0 flex-col">
                <button type="button" className={botao} disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir o passo ${i + 1}`}>
                  <ArrowUp aria-hidden className="size-4" />
                </button>
                <button type="button" className={botao} disabled={i === v.passos.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer o passo ${i + 1}`}>
                  <ArrowDown aria-hidden className="size-4" />
                </button>
              </span>
              <button
                type="button"
                className={botao}
                disabled={v.passos.length === 1}
                onClick={() => setV((a) => ({ ...a, passos: a.passos.filter((_, n) => n !== i) }))}
                aria-label={`Apagar o passo ${i + 1}`}
                style={{ color: "var(--destructive)" }}
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setV((a) => ({ ...a, passos: [...a.passos, ""] }))} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[var(--primary)]">
          <Plus aria-hidden className="size-4" />
          Novo passo
        </button>
      </CartaoDeSecao>
      <CartaoDeSecao icone={StickyNote} titulo="Observações" frase="Cuidados, o que não fazer, a quem chamar.">
        <Textarea
          value={v.observacoes ?? ""}
          onChange={(e) => setV({ ...v, observacoes: e.target.value })}
          rows={3}
          maxLength={2000}
          aria-label="Observações"
          placeholder="Ex.: desligar o gás antes de limpar a chapa."
        />
      </CartaoDeSecao>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="h-11 px-6" disabled={pendente}>
          {pendente ? "Salvando…" : id === null ? "Criar processo" : "Salvar"}
        </Button>
        <Button type="button" variant="outline" className="h-11" onClick={() => router.back()}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
