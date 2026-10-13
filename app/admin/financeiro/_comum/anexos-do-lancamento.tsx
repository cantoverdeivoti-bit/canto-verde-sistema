"use client";

import { Paperclip, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ConfirmarNaLinha } from "@/components/confirmar-na-linha";
import { apagarAnexo } from "@/lib/actions/financeiro";
import { TETO_DO_ANEXO, TIPOS_ACEITOS } from "@/lib/anexos";
import { reduzirSeForFoto } from "@/lib/anexos-navegador";

import { useAcao } from "@/lib/use-acao";

type Anexo = { id: number; nome: string; tamanho: number };

const tamanho = (b: number) => (b < 1_000_000 ? `${Math.max(1, Math.round(b / 1000))} KB` : `${(b / 1_000_000).toFixed(1).replace(".", ",")} MB`);

/** A nota, o boleto, o comprovante: o que o contador pede junto com o lançamento. */
export function AnexosDoLancamento({ lancamentoId, anexos }: { lancamentoId: number; anexos: Anexo[] }) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const { erro, pendente, rodar } = useAcao();

  async function enviar(arquivos: FileList) {
    setFalha(null);
    setEnviando(true);
    try {
      for (const original of Array.from(arquivos)) {
        const pronto = await reduzirSeForFoto(original);
        if (pronto.size > TETO_DO_ANEXO) {
          setFalha(`${original.name} passa de 4 MB. Mande uma versão menor.`);
          continue;
        }
        const nome = pronto === original ? original.name : original.name.replace(/\.[^.]*$/, "") + ".jpg";
        const corpo = new FormData();
        corpo.set("lancamentoId", String(lancamentoId));
        corpo.set("arquivo", pronto, nome);
        const r = await fetch("/admin/financeiro/anexos", { method: "POST", body: corpo });
        const j = (await r.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
        if (!r.ok || !j?.ok) setFalha(j?.message ?? "Não foi possível anexar. Tente de novo.");
      }
    } finally {
      setEnviando(false);
      if (campo.current) campo.current.value = "";
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--muted-foreground)]">Anexos</p>
      {anexos.length > 0 && (
        <ul className="space-y-1">
          {anexos.map((a) => (
            // `flex-wrap`: a pergunta de tirar desce para a linha de baixo,
            // inteira, em vez de espremer o nome do arquivo.
            <li key={a.id} className="flex flex-wrap items-center gap-2">
              <Paperclip aria-hidden className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
              <a href={`/admin/financeiro/anexos/${a.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate underline">
                {a.nome}
              </a>
              <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{tamanho(a.tamanho)}</span>
              {/* Tirar um anexo não tem volta: a pergunta aparece na linha antes. */}
              <ConfirmarNaLinha
                // O nome do arquivo costuma vir sem espaço: quebra em qualquer
                // ponto para não empurrar a tela para o lado.
                pergunta={<span className="break-words">Tirar {a.nome}?</span>}
                confirmar="Tirar"
                pendente={pendente}
                aoConfirmar={() => rodar(() => apagarAnexo(a.id))}
              >
                {(abrir) => (
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={abrir}
                    aria-label={`Tirar ${a.nome}`}
                    title="Tirar"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </button>
                )}
              </ConfirmarNaLinha>
            </li>
          ))}
        </ul>
      )}
      <label className="btn-ghost cursor-pointer gap-1.5">
        <Paperclip aria-hidden className="size-4" />
        {enviando ? "Enviando…" : "Anexar nota, boleto ou comprovante"}
        <input
          ref={campo}
          type="file"
          accept={TIPOS_ACEITOS}
          multiple
          className="sr-only"
          disabled={enviando}
          onChange={(e) => e.target.files && e.target.files.length > 0 && enviar(e.target.files)}
        />
      </label>
      {(falha || erro) && (
        <p role="alert" className="msg-error">
          {falha ?? erro}
        </p>
      )}
    </div>
  );
}
