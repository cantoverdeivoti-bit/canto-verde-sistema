"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { desligarLinkAtalhos, gerarLinkAtalhos } from "@/lib/actions/compras";
import { ATALHO_VALE_DIAS } from "@/lib/roles";

/**
 * O link que leva os atalhos ao estoquista e ao recebedor, sem login.
 *
 * Um só, para as duas pessoas (decisão do dono). Trocar gera outro e o
 * antigo para de valer — é o que se faz se ele vazar ou se alguém sair da
 * equipe. Desligar fecha a porta até gerar de novo. As duas pedem
 * confirmação na própria linha.
 */
export function LinkDosAtalhos({
  token,
  criadoEm,
  venceEm,
  vencido,
  origem,
}: {
  token: string | null;
  criadoEm: string | null;
  /** O link vale trinta dias depois de gerado. */
  venceEm: string | null;
  vencido: boolean;
  /** "https://canto-verde.vercel.app" — vem do servidor, para o endereço
      sair igual na primeira pintura e no navegador. */
  origem: string;
}) {
  const [confirmando, setConfirmando] = useState<"trocar" | "desligar" | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const link = token ? `${origem}/atalhos/${token}` : null;
  const recado = link
    ? `Olá! Este é o link dos atalhos de compras (contar estoque, Compras de rotina e receber pedidos). Vale ${ATALHO_VALE_DIAS} dias. Guarde e não passe adiante: ${link}`
    : "";

  function gerar() {
    setErro(null);
    startTransition(async () => {
      const r = await gerarLinkAtalhos();
      if (!r.ok) return setErro(r.message ?? "Não foi possível gerar o link.");
      setConfirmando(null);
    });
  }

  function desligar() {
    setErro(null);
    startTransition(async () => {
      const r = await desligarLinkAtalhos();
      if (!r.ok) return setErro(r.message ?? "Não foi possível desligar o link.");
      setConfirmando(null);
    });
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não consegui copiar. Selecione o endereço e copie à mão.");
    }
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="font-semibold">Link para o estoquista e o recebedor</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Abre só Contar estoque, Compras de rotina e Receber pedidos, sem login. Cotação, pedido manual e a lista de
        pedidos pedem login. O link vale {ATALHO_VALE_DIAS} dias; se vazar antes, troque.
      </p>

      {!link ? (
        <button
          type="button"
          disabled={pendente}
          onClick={gerar}
          className="mt-3 h-10 rounded-md bg-[var(--botao)] px-4 text-sm font-semibold text-[var(--botao-texto)] disabled:opacity-60"
        >
          {pendente ? "Gerando…" : "Gerar link"}
        </button>
      ) : vencido ? (
        <div className="mt-3 space-y-2">
          <p role="alert" className="text-sm font-medium" style={{ color: "var(--destructive)" }}>
            Este link venceu{venceEm ? ` (${venceEm})` : ""}. Gere um novo e mande de novo para a equipe.
          </p>
          <button
            type="button"
            disabled={pendente}
            onClick={gerar}
            className="h-10 rounded-md bg-[var(--botao)] px-4 text-sm font-semibold text-[var(--botao-texto)] disabled:opacity-60"
          >
            {pendente ? "Gerando…" : "Gerar link novo"}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs break-all select-all">
            {link}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(recado)}`}
              target="_blank"
              rel="noopener"
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[var(--botao)] px-4 text-sm font-medium text-[var(--botao-texto)] hover:opacity-90"
            >
              <MessageCircle aria-hidden className="size-4" />
              WhatsApp
            </a>
            <button
              type="button"
              onClick={copiar}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--background)] px-4 text-sm font-medium hover:border-[var(--primary)]"
            >
              {copiado ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>

          {confirmando ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--border)] p-2.5 text-sm">
              <p className="min-w-0 flex-1">
                {confirmando === "trocar"
                  ? "Trocar o link? O de agora para de valer, e quem estiver com ele precisa do novo."
                  : "Desligar o link? Ninguém mais entra por ele até você gerar outro."}
              </p>
              <button
                type="button"
                disabled={pendente}
                onClick={confirmando === "trocar" ? gerar : desligar}
                className="h-10 rounded-lg bg-[var(--botao)] px-3 font-medium text-[var(--botao-texto)] disabled:opacity-60"
              >
                {pendente ? "…" : confirmando === "trocar" ? "Trocar" : "Desligar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(null)}
                className="h-10 rounded-lg px-3 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              >
                voltar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              {criadoEm && (
                <span className="text-[var(--muted-foreground)]">
                  criado em {criadoEm}
                  {venceEm && `, vale até ${venceEm}`}
                </span>
              )}
              <button
                type="button"
                onClick={() => setConfirmando("trocar")}
                className="text-[var(--primary)] underline underline-offset-4"
              >
                Trocar link
              </button>
              <button
                type="button"
                onClick={() => setConfirmando("desligar")}
                className="text-[var(--muted-foreground)] underline underline-offset-4 hover:text-[var(--destructive)]"
              >
                Desligar
              </button>
            </div>
          )}
        </div>
      )}

      {erro && (
        <p role="alert" className="mt-2 text-sm" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
    </section>
  );
}
