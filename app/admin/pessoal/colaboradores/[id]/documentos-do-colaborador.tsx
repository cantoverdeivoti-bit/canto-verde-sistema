"use client";

import { Camera, CircleCheck, CircleDashed, CircleMinus, FileCheck, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { CaixaDeConfirmacao } from "@/components/confirmar-na-linha";
import { CartaoDeSecao } from "@/components/pagina";
import { marcarDocumento } from "@/lib/actions/documentos-pessoal";
import { reduzirSeForFoto } from "@/lib/anexos-navegador";
import { DOCUMENTOS_DA_ADMISSAO } from "@/lib/documentos-admissao";

export type DocumentoNaTela = { id: number; tipo: string; naoSeAplica: boolean; temArquivo: boolean; entregueEm: string };

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}`;

/**
 * O checklist dos documentos da admissão. Cada linha: falta, entregue (com ou
 * sem a foto) ou não se aplica. A foto do documento sobe reduzida e só quem
 * configura o módulo vê. Voltar para Falta apaga o arquivo: com arquivo, a
 * pergunta aparece embaixo da linha antes.
 */
export function DocumentosDoColaborador({ colaboradorId, documentos }: { colaboradorId: number; documentos: DocumentoNaTela[] }) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const [paraQual, setParaQual] = useState<string | null>(null);
  // O documento com arquivo que espera a confirmação para voltar a Falta.
  const [confirmandoFalta, setConfirmandoFalta] = useState<string | null>(null);
  const doTipo = new Map(documentos.map((d) => [d.tipo, d]));
  const resolvidos = DOCUMENTOS_DA_ADMISSAO.filter((d) => doTipo.has(d.chave)).length;

  const marcar = (tipo: string, estado: "entregue" | "nao-se-aplica" | "falta") => {
    setErro(null);
    startTransition(async () => {
      const r = await marcarDocumento(colaboradorId, tipo, estado);
      if (!r.ok) setErro(r.message ?? "Não deu certo.");
      router.refresh();
    });
  };

  async function enviar(tipo: string, f: File) {
    setErro(null);
    setEnviando(tipo);
    try {
      const corpo = new FormData();
      corpo.set("colaboradorId", String(colaboradorId));
      corpo.set("tipo", tipo);
      corpo.set("arquivo", await reduzirSeForFoto(f), f.name);
      const r = await fetch("/admin/pessoal/documentos", { method: "POST", body: corpo });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!r.ok || !j.ok) setErro(j.message ?? "Não foi possível enviar. Tente de novo.");
      router.refresh();
    } finally {
      setEnviando(null);
    }
  }

  return (
    <CartaoDeSecao icone={FileCheck} titulo="Documentos da admissão" frase={`${resolvidos} de ${DOCUMENTOS_DA_ADMISSAO.length} resolvidos.`}>
      <input
        ref={arquivo}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && paraQual) void enviar(paraQual, f);
          e.target.value = "";
        }}
      />
      <ul className="divide-y divide-[var(--border)]">
        {DOCUMENTOS_DA_ADMISSAO.map((d) => {
          const doc = doTipo.get(d.chave);
          const estado = !doc ? "falta" : doc.naoSeAplica ? "nao-se-aplica" : "entregue";
          // Só o símbolo, sem fundo: verde entregue, cinza não se aplica, tracejado o que falta.
          const Simbolo = estado === "entregue" ? CircleCheck : estado === "nao-se-aplica" ? CircleMinus : CircleDashed;
          const cor = estado === "entregue" ? "text-[var(--primary)]" : estado === "nao-se-aplica" ? "text-[var(--muted-foreground)]" : "text-[var(--warn)]";
          return (
            <li key={d.chave} className="flex flex-wrap items-center gap-2 py-2 first:pt-0 last:pb-0">
              <Simbolo aria-hidden className={`size-5 shrink-0 ${cor}`} />
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${estado === "nao-se-aplica" ? "text-[var(--muted-foreground)] line-through" : "font-medium"}`}>{d.nome}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  {estado === "entregue" ? `entregue em ${ddmm(doc!.entregueEm)}${doc!.temArquivo ? "" : " · sem arquivo"}` : estado === "nao-se-aplica" ? "não se aplica" : ("dica" in d ? d.dica : "falta")}
                </span>
              </span>
              {doc?.temArquivo && (
                <a href={`/admin/pessoal/documentos/${doc.id}`} target="_blank" rel="noopener" aria-label={`Abrir ${d.nome}`} className="flex size-9 items-center justify-center rounded-lg hover:bg-[var(--muted)]">
                  <FileText aria-hidden className="size-4" />
                </a>
              )}
              <button
                type="button"
                disabled={pendente || enviando !== null}
                onClick={() => {
                  setParaQual(d.chave);
                  arquivo.current?.click();
                }}
                aria-label={`${doc?.temArquivo ? "Trocar a foto de" : "Fotografar"} ${d.nome}`}
                className="flex size-9 items-center justify-center rounded-lg border border-[var(--border)] disabled:opacity-40"
              >
                {enviando === d.chave ? <span className="text-[10px]">…</span> : <Camera aria-hidden className="size-4" />}
              </button>
              <select
                value={estado}
                disabled={pendente}
                onChange={(e) => {
                  const novo = e.target.value as "entregue" | "nao-se-aplica" | "falta";
                  // Falta apaga o arquivo junto: com arquivo, pergunta antes.
                  if (novo === "falta" && doc?.temArquivo) return setConfirmandoFalta(d.chave);
                  setConfirmandoFalta(null);
                  marcar(d.chave, novo);
                }}
                aria-label={`Situação de ${d.nome}`}
                className="h-9 rounded-lg border border-[var(--border)] bg-[var(--card)] px-1.5 text-xs"
              >
                <option value="falta">Falta</option>
                <option value="entregue">Entregue</option>
                <option value="nao-se-aplica">Não se aplica</option>
              </select>
              {confirmandoFalta === d.chave && (
                <CaixaDeConfirmacao
                  pergunta={`Marcar ${d.nome} como falta? O arquivo é apagado.`}
                  confirmar="Marcar falta"
                  pendente={pendente}
                  aoConfirmar={() => {
                    setConfirmandoFalta(null);
                    marcar(d.chave, "falta");
                  }}
                  aoVoltar={() => setConfirmandoFalta(null)}
                />
              )}
            </li>
          );
        })}
      </ul>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <p className="hint">A câmera envia a foto ou o PDF do documento e já marca como entregue.</p>
    </CartaoDeSecao>
  );
}
