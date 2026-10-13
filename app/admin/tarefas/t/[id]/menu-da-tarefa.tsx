"use client";

import {
  Copy,
  CornerLeftUp,
  History,
  Link2,
  ListPlus,
  MoreHorizontal,
  Paperclip,
  Pin,
  PinOff,
  Printer,
  Tag,
  Trash2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { duplicarTarefa, fixarTarefa } from "@/lib/actions/tarefas";

/** O que este menu pode oferecer a quem está olhando. A página decide. */
export type ItensDoMenu = {
  subtarefa: boolean;
  vincularPai: boolean;
  fixar: boolean;
  cancelar: boolean;
  etiquetas: boolean;
  anexo: boolean;
  duplicar: boolean;
  excluir: boolean;
};

/** Leva até um campo da tela e põe o cursor nele. */
function irPara(id: string, focar = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (focar && el instanceof HTMLElement) el.focus({ preventScroll: true });
}

/**
 * O "⋯" da tarefa: o que não precisa de botão próprio, num lugar só.
 *
 * Na ordem do menu do TickTick, que é o que a equipe já tem na mão: primeiro
 * o que muda a tarefa, depois o que se faz com ela, por último imprimir e
 * excluir. Três itens de lá não estão aqui de propósito: "Converter para
 * nota" (não há notas), "Export" e "Salvar como modelo", que chega junto com
 * as rotinas.
 *
 * É uma lista que abre na própria tela, presa ao botão, e não um diálogo. O
 * que pede confirmação (não vai acontecer, excluir, tarefa pai) abre o bloco
 * de sempre, logo abaixo dos botões, com a consequência escrita antes do
 * clique.
 */
export function MenuDaTarefa({
  tarefaId,
  fixada,
  itens,
  rodar,
  aoErro,
  aoCancelar,
  aoExcluir,
  aoVincular,
}: {
  tarefaId: number;
  fixada: boolean;
  itens: ItensDoMenu;
  rodar: (acao: () => Promise<{ ok: boolean; message?: string }>) => void;
  aoErro: (mensagem: string) => void;
  aoCancelar: () => void;
  aoExcluir: () => void;
  aoVincular: () => void;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [duplicando, startDuplicar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  /** Fecha o menu e então faz a coisa, para a lista não ficar por cima. */
  const e = (fazer: () => void) => () => {
    setAberto(false);
    fazer();
  };

  function avisar(texto: string) {
    setAviso(texto);
    setTimeout(() => setAviso(null), 2500);
  }

  function duplicar() {
    startDuplicar(async () => {
      const r = await duplicarTarefa(tarefaId);
      if (!r.ok) return aoErro(r.message);
      // Só o `push`: a cópia é uma tela nova, e um `refresh` junto correria
      // com a navegação (ver `novo-quadro.tsx`).
      router.push(`/admin/tarefas/t/${r.data.id}`);
    });
  }

  async function copiarLink() {
    const url = `${window.location.origin}/admin/tarefas/t/${tarefaId}`;
    try {
      await navigator.clipboard.writeText(url);
      avisar("Link copiado");
    } catch {
      // Navegador sem permissão de área de transferência: mostra o link
      // para a pessoa copiar na mão, em vez de fingir que copiou.
      avisar(url);
    }
  }

  type Item = { icone: LucideIcon; texto: string; fazer: () => void; perigo?: boolean } | "linha";
  const lista: Item[] = [
    ...(itens.subtarefa
      ? [{ icone: ListPlus, texto: "Adicionar subtarefa", fazer: e(() => irPara("nova-subtarefa")) }]
      : []),
    ...(itens.vincularPai ? [{ icone: CornerLeftUp, texto: "Vincular tarefa pai", fazer: e(aoVincular) }] : []),
    ...(itens.fixar
      ? [
          {
            icone: fixada ? PinOff : Pin,
            texto: fixada ? "Tirar do topo" : "Fixar no topo",
            fazer: e(() => rodar(() => fixarTarefa(tarefaId, !fixada))),
          },
        ]
      : []),
    ...(itens.cancelar ? [{ icone: XCircle, texto: "Não vai acontecer", fazer: e(aoCancelar) }] : []),
    ...(itens.etiquetas ? [{ icone: Tag, texto: "Etiquetas", fazer: e(() => irPara("nova-etiqueta")) }] : []),
    ...(itens.anexo
      ? [{ icone: Paperclip, texto: "Carregar anexo", fazer: e(() => document.getElementById("novo-anexo")?.click()) }]
      : []),
    "linha",
    { icone: History, texto: "Histórico", fazer: e(() => irPara("historico", false)) },
    ...(itens.duplicar ? [{ icone: Copy, texto: "Duplicar", fazer: e(duplicar) }] : []),
    { icone: Link2, texto: "Copiar link", fazer: e(copiarLink) },
    "linha",
    { icone: Printer, texto: "Imprimir", fazer: e(() => window.print()) },
    ...(itens.excluir ? [{ icone: Trash2, texto: "Excluir", fazer: e(aoExcluir), perigo: true }] : []),
  ];

  return (
    <div className="relative print:hidden">
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Mais opções da tarefa"
        disabled={duplicando}
        className="flex h-8 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-50"
      >
        <MoreHorizontal aria-hidden className="size-5" />
      </button>

      {aviso && (
        <p role="status" className="absolute top-full right-0 z-30 mt-1 max-w-72 rounded-lg bg-[var(--foreground)] px-2.5 py-1.5 text-xs break-all text-[var(--background)]">
          {aviso}
        </p>
      )}

      {aberto && (
        <>
          {/* Um toque fora fecha, como em qualquer menu. */}
          <button
            type="button"
            aria-label="Fechar o menu"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setAberto(false)}
          />
          <ul
            role="menu"
            className="absolute top-full right-0 z-30 mt-1 w-60 rounded-xl border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
          >
            {lista.map((item, i) =>
              item === "linha" ? (
                <li key={`l${i}`} role="separator" className="my-1 border-t border-[var(--border)]" />
              ) : (
                <li key={item.texto} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={item.fazer}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--muted)]"
                    style={item.perigo ? { color: "var(--destructive)" } : undefined}
                  >
                    <item.icone aria-hidden className="size-4 shrink-0" />
                    {item.texto}
                  </button>
                </li>
              ),
            )}
          </ul>
        </>
      )}
    </div>
  );
}
