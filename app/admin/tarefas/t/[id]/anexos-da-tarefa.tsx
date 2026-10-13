"use client";

import { FileText, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { removerAnexo } from "@/lib/actions/tarefas";
import { TETO_DO_ANEXO, TIPOS_DA_TAREFA } from "@/lib/anexos";
import { reduzirSeForFoto } from "@/lib/anexos-navegador";

export type AnexoDaTarefa = {
  id: number;
  nome: string;
  mime: string;
  tamanho: number;
  quem: string;
  /** Quem anexou, ou o gestor. Decidido na página. */
  podeRemover: boolean;
};

const tamanho = (b: number) =>
  b < 1_000_000
    ? `${Math.max(1, Math.round(b / 1000))} KB`
    : `${(b / 1_000_000).toFixed(1).replace(".", ",")} MB`;

/**
 * Foto e PDF da tarefa: a prova de que o serviço foi feito.
 *
 * Sobe pela rota `/admin/tarefas/anexos`, um arquivo por vez, com a foto
 * reduzida no navegador antes (foto de celular passa de 4 MB; 1600 px bastam
 * para ver uma coifa limpa). Foto aparece em miniatura, porque a pergunta de
 * quem abre é "está feito?", e a resposta é olhar.
 *
 * Tirar um anexo pede confirmação no bloco tracejado: é apagar a prova, e o
 * histórico só guarda o nome do arquivo, não o arquivo.
 */
export function AnexosDaTarefa({
  tarefaId,
  anexos,
  podeAnexar,
}: {
  tarefaId: number;
  anexos: AnexoDaTarefa[];
  podeAnexar: boolean;
}) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [tirando, setTirando] = useState<number | null>(null);

  if (anexos.length === 0 && !podeAnexar) return null;

  async function enviar(arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    setErro(null);
    setEnviando(true);
    try {
      for (const arquivo of Array.from(arquivos)) {
        const pronto = await reduzirSeForFoto(arquivo);
        if (pronto.size > TETO_DO_ANEXO) {
          setErro(`${arquivo.name} passa de 4 MB. Mande uma versão menor.`);
          continue;
        }
        const nome = pronto === arquivo ? arquivo.name : arquivo.name.replace(/\.[^.]*$/, "") + ".jpg";
        const corpo = new FormData();
        corpo.append("tarefaId", String(tarefaId));
        corpo.append("arquivo", pronto, nome);
        const resposta = await fetch("/admin/tarefas/anexos", { method: "POST", body: corpo });
        const j = (await resposta.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
        if (!resposta.ok || !j?.ok) setErro(j?.message ?? "Não foi possível anexar. Tente de novo.");
      }
    } finally {
      setEnviando(false);
      if (campo.current) campo.current.value = "";
      router.refresh();
    }
  }

  function tirar(id: number) {
    setErro(null);
    startTransition(async () => {
      const r = await removerAnexo(id);
      if (!r.ok) return setErro(r.message);
      setTirando(null);
      router.refresh();
    });
  }

  return (
    <section id="anexos">
      <h2 className="section-label">Anexos</h2>

      {anexos.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {anexos.map((a) => {
            const url = `/admin/tarefas/anexos/${a.id}`;
            const foto = a.mime.startsWith("image/");
            return (
              <li key={a.id} className="card min-w-0 overflow-hidden">
                <a href={url} target="_blank" rel="noopener" className="block">
                  {foto ? (
                    // A rota devolve o arquivo conferido; `next/image` não
                    // otimiza endereço que exige login, então vai o <img> puro.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={a.nome} loading="lazy" className="aspect-square w-full object-cover" />
                  ) : (
                    <span className="flex aspect-square w-full items-center justify-center bg-[var(--muted)]">
                      <FileText aria-hidden className="size-8 text-[var(--muted-foreground)]" />
                    </span>
                  )}
                </a>
                <div className="p-2">
                  <p className="truncate text-xs font-medium" title={a.nome}>
                    {a.nome}
                  </p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {tamanho(a.tamanho)} · {a.quem}
                  </p>
                  {a.podeRemover && tirando !== a.id && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-[var(--muted-foreground)] underline-offset-4 hover:underline print:hidden"
                      onClick={() => setTirando(a.id)}
                    >
                      tirar
                    </button>
                  )}
                  {tirando === a.id && (
                    <div className="mt-1.5 space-y-1.5 rounded border border-dashed border-[var(--border)] p-1.5 print:hidden">
                      <p className="text-xs">O arquivo sai de vez. O histórico guarda só o nome.</p>
                      <div className="flex flex-wrap gap-1">
                        <Button type="button" size="xs" disabled={pendente} onClick={() => tirar(a.id)}>
                          Tirar
                        </Button>
                        <Button type="button" size="xs" variant="ghost" disabled={pendente} onClick={() => setTirando(null)}>
                          Voltar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {podeAnexar && (
        <label className="btn-ghost mt-3 inline-flex cursor-pointer items-center gap-2 print:hidden">
          <Paperclip aria-hidden className="size-4" />
          {enviando ? "Enviando…" : "Anexar foto ou PDF"}
          <input
            id="novo-anexo"
            ref={campo}
            type="file"
            accept={TIPOS_DA_TAREFA}
            multiple
            className="sr-only"
            disabled={enviando}
            onChange={(e) => void enviar(e.target.files)}
          />
        </label>
      )}

      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}
    </section>
  );
}
