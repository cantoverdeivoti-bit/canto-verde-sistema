"use client";

import { useState, useTransition } from "react";

import { descartarCotacao, encerrarRespostas, reabrirCotacao } from "@/lib/actions/cotacao";
import type { CotacaoStatus } from "@/generated/prisma/client";

/** Por quanto tempo reabrir, a partir de agora. */
const REABRIR_POR = [24, 48, 72] as const;
const rotulo = (h: (typeof REABRIR_POR)[number]) => (h < 48 ? `${h} h` : `${h / 24} dias`);

/**
 * As saídas de uma cotação que ficou pelo caminho:
 *
 * - **Encerrar respostas**: parar de esperar quem não respondeu. Os convites
 *   em aberto viram "expirou" e a cotação passa a comparar o que chegou.
 * - **Reabrir prazo**: o contrário. Quem não respondeu a tempo volta a poder
 *   responder pelo mesmo link, por mais 1 a 3 dias. Aparece quando há quem
 *   não respondeu, e a cotação ainda não virou pedido.
 * - **Descartar**: a cotação não vai virar compra. Só antes de gerar pedidos
 *   (decisão do dono) — com pedido, cancela-se o pedido em Pedidos.
 *
 * Todos pedem confirmação na própria linha, sem janela.
 */
export function AcoesDaCotacao({
  cotacaoId,
  estatus,
  temPedido,
  convitesEmAberto,
  convitesExpirados,
  prazoTexto,
}: {
  cotacaoId: number;
  estatus: CotacaoStatus;
  temPedido: boolean;
  /** Fornecedores chamados que ainda não responderam. */
  convitesEmAberto: number;
  /** Chamados que não responderam a tempo (prazo vencido ou respostas encerradas). */
  convitesExpirados: number;
  /** "quinta, 24/09 às 18:00": o prazo de agora, se houver. */
  prazoTexto: string | null;
}) {
  const [confirmando, setConfirmando] = useState<"descartar" | "encerrar" | "reabrir" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const aberta = !temPedido && estatus !== "APROVADA" && estatus !== "DESCARTADA";
  const podeEncerrar = estatus === "RESPONDENDO" && convitesEmAberto > 0;
  const podeReabrir = aberta && (convitesExpirados > 0 || convitesEmAberto > 0);
  const podeDescartar = aberta;
  if (!podeEncerrar && !podeReabrir && !podeDescartar) return null;

  function fazer(qual: "descartar" | "encerrar") {
    setErro(null);
    startTransition(async () => {
      const r = qual === "descartar" ? await descartarCotacao(cotacaoId) : await encerrarRespostas(cotacaoId);
      if (!r.ok) return setErro(r.message);
      setConfirmando(null);
    });
  }

  function reabrir(horas: (typeof REABRIR_POR)[number]) {
    setErro(null);
    startTransition(async () => {
      const r = await reabrirCotacao(cotacaoId, horas);
      if (!r.ok) return setErro(r.message);
      setConfirmando(null);
      setRecado(
        r.data.reabertos > 0
          ? `Reaberta por ${rotulo(horas)}: ${r.data.reabertos === 1 ? "1 fornecedor pode" : `${r.data.reabertos} fornecedores podem`} responder pelo mesmo link.`
          : `Prazo estendido por ${rotulo(horas)}.`,
      );
    });
  }

  if (confirmando === "reabrir") {
    return (
      <div className="w-full space-y-2 rounded-lg border border-dashed border-[var(--border)] p-2.5 text-sm">
        <p>
          Reabrir por quanto tempo, a partir de agora?{" "}
          {convitesExpirados > 0 &&
            `${convitesExpirados === 1 ? "1 fornecedor que não respondeu volta" : `${convitesExpirados} fornecedores que não responderam voltam`} a poder responder pelo mesmo link.`}
          {prazoTexto && <span className="text-[var(--muted-foreground)]"> Prazo atual: {prazoTexto}.</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {REABRIR_POR.map((h) => (
            <button
              key={h}
              type="button"
              disabled={pendente}
              onClick={() => reabrir(h)}
              className="h-10 rounded-lg bg-[var(--botao)] px-4 font-medium text-[var(--botao-texto)] disabled:opacity-60"
            >
              {rotulo(h)}
            </button>
          ))}
          <button
            type="button"
            disabled={pendente}
            onClick={() => setConfirmando(null)}
            className="h-10 rounded-lg px-3 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            voltar
          </button>
        </div>
        {erro && (
          <p role="alert" className="text-xs" style={{ color: "var(--destructive)" }}>
            {erro}
          </p>
        )}
      </div>
    );
  }

  if (confirmando) {
    return (
      <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-dashed border-[var(--border)] p-2.5 text-sm">
        <p className="min-w-0 flex-1">
          {confirmando === "descartar"
            ? "Descartar esta cotação? Ela não vira compra, e os links dos fornecedores deixam de aceitar resposta."
            : `Parar de esperar ${convitesEmAberto === 1 ? "1 fornecedor" : `${convitesEmAberto} fornecedores`} que não respondeu? A comparação segue com o que chegou.`}
        </p>
        <button
          type="button"
          disabled={pendente}
          onClick={() => fazer(confirmando)}
          className="h-10 rounded-lg bg-[var(--botao)] px-3 font-medium text-[var(--botao-texto)] disabled:opacity-60"
        >
          {pendente ? "…" : confirmando === "descartar" ? "Descartar" : "Encerrar"}
        </button>
        <button
          type="button"
          disabled={pendente}
          onClick={() => setConfirmando(null)}
          className="h-10 rounded-lg px-3 text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        >
          voltar
        </button>
        {erro && (
          <p role="alert" className="w-full text-xs" style={{ color: "var(--destructive)" }}>
            {erro}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {podeEncerrar && (
        <button
          type="button"
          onClick={() => setConfirmando("encerrar")}
          className="h-10 rounded-lg border border-[var(--border)] px-3 hover:border-[var(--primary)]"
        >
          Encerrar respostas
        </button>
      )}
      {podeReabrir && (
        <button
          type="button"
          onClick={() => {
            setRecado(null);
            setConfirmando("reabrir");
          }}
          className="h-10 rounded-lg border border-[var(--border)] px-3 hover:border-[var(--primary)]"
        >
          {convitesExpirados > 0 ? "Reabrir prazo" : "Estender prazo"}
        </button>
      )}
      {podeDescartar && (
        <button
          type="button"
          onClick={() => setConfirmando("descartar")}
          className="h-10 rounded-lg px-3 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--destructive)]"
        >
          Descartar cotação
        </button>
      )}
      {recado && (
        <p role="status" className="w-full text-sm text-[var(--ok-strong)]">
          {recado}
        </p>
      )}
    </div>
  );
}
