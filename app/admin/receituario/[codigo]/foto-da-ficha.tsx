"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { CaixaDeConfirmacao } from "@/components/confirmar-na-linha";
import { apagarFotoDaFicha } from "@/lib/actions/receituario";
import { miniaturaDaFoto, reduzirSeForFoto } from "@/lib/anexos-navegador";

/**
 * A foto do prato pronto. Sobe reduzida (1600 px) e com a miniatura que a
 * lista usa, as duas feitas aqui no aparelho. Só quem configura troca.
 */
export function FotoDaFicha({ fichaId, codigo, nome, versao, podeTrocar }: { fichaId: number; codigo: string; nome: string; versao: string | null; podeTrocar: boolean }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  // Tirar a foto pergunta embaixo dela, no visual do painel.
  const [tirando, setTirando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  if (!versao && !podeTrocar) return null;

  async function enviar(f: File) {
    setErro(null);
    setEnviando(true);
    try {
      const foto = await reduzirSeForFoto(f);
      const mini = await miniaturaDaFoto(foto);
      const corpo = new FormData();
      corpo.set("fichaId", String(fichaId));
      corpo.set("arquivo", foto, f.name);
      if (mini) corpo.set("miniatura", mini, "miniatura.jpg");
      const r = await fetch("/admin/receituario/foto", { method: "POST", body: corpo });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!r.ok || !j.ok) setErro(j.message ?? "Não foi possível enviar a foto.");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void enviar(f);
          e.target.value = "";
        }}
      />
      {versao ? (
        <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--muted)]">
          {/* eslint-disable-next-line @next/next/no-img-element -- a foto vem da rota do módulo, com a sessão. */}
          <img src={`/admin/receituario/foto/${encodeURIComponent(codigo)}?v=${versao}`} alt={`Foto de ${nome}`} className="aspect-[4/3] w-full object-cover sm:aspect-[16/7]" />
          {podeTrocar && (
            <div className="absolute right-2 bottom-2 flex gap-1.5">
              <button type="button" onClick={() => entrada.current?.click()} disabled={enviando} className="flex h-9 items-center gap-1.5 rounded-lg bg-black/60 px-3 text-sm font-medium text-white">
                <Camera aria-hidden className="size-4" />
                {enviando ? "Enviando…" : "Trocar foto"}
              </button>
              <button
                type="button"
                aria-label="Tirar a foto"
                disabled={pendente || enviando}
                onClick={() => setTirando(true)}
                className="flex size-9 items-center justify-center rounded-lg bg-black/60 text-white"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={enviando}
          className="flex h-20 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--border)] text-sm font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        >
          <Camera aria-hidden className="size-5" />
          {enviando ? "Enviando a foto…" : "Pôr a foto do prato pronto"}
        </button>
      )}
      {tirando && versao && (
        <CaixaDeConfirmacao
          pergunta="Tirar a foto desta ficha?"
          confirmar="Tirar a foto"
          pendente={pendente}
          aoVoltar={() => setTirando(false)}
          aoConfirmar={() =>
            startTransition(async () => {
              await apagarFotoDaFicha(fichaId);
              setTirando(false);
              router.refresh();
            })
          }
        />
      )}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </div>
  );
}
