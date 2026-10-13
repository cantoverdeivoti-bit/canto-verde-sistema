"use client";

import { Minus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { pedidoDaRequisicao } from "@/lib/actions/lista-compra";
import { enterProximoValor } from "@/lib/enter-proximo-valor";
import { UNIT_LABEL, formatAmount, lerNumeroBR, plural } from "@/lib/format";
import type { LinhaDaRequisicao } from "@/lib/requisicao";

type Linha = Omit<LinhaDaRequisicao, "contadoEm"> & { contadoEm: string | null };

const POR_QUE: Record<NonNullable<Linha["motivo"]>, string> = {
  "sem-ideal": "sem ideal",
  "nao-contado": "não contado hoje",
  "no-ideal": "já no ideal",
  "meio-lote": "falta menos de meio lote",
};

/**
 * A conferência do pedido: o sugerido já preenchido, editável. Vazio ou zero
 * fica fora. O produto não contado hoje vem apagado, com o campo vazio — quem
 * sabe que falta pode digitar.
 */
export function PedidoDaRequisicao({
  listaId,
  linhas,
  peloLink = false,
}: {
  listaId: number;
  linhas: Linha[];
  /** Aberto pelo link de atalhos: Pendências pede login, então o "decidir" some. */
  peloLink?: boolean;
}) {
  const router = useRouter();
  const [qtd, setQtd] = useState<Record<number, string>>(() =>
    Object.fromEntries(linhas.map((l) => [l.produtoId, l.sugerido === null ? "" : String(l.sugerido).replace(".", ",")])),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const pedir = linhas
    .map((l) => ({ produtoId: l.produtoId, nome: l.nome, q: lerNumeroBR(qtd[l.produtoId] ?? "") }))
    .filter((x) => x.q !== null && x.q > 0);
  const contados = linhas.filter((l) => l.contado !== null).length;

  /** O − e o +: de lote em lote (ou de 1 em 1), nunca abaixo de zero. */
  function passo(l: Linha, sinal: 1 | -1) {
    const atual = lerNumeroBR(qtd[l.produtoId] ?? "") ?? 0;
    const de = l.lote ?? 1;
    const novo = Math.max(0, Math.round((atual + sinal * de) * 1000) / 1000);
    setQtd((a) => ({ ...a, [l.produtoId]: novo === 0 ? "" : String(novo).replace(".", ",") }));
  }

  function criar() {
    setErro(null);
    const invalido = linhas.find((l) => {
      const t = (qtd[l.produtoId] ?? "").trim();
      return t !== "" && (lerNumeroBR(t) === null || lerNumeroBR(t)! < 0);
    });
    if (invalido) return setErro(`Quantidade inválida em ${invalido.nome}.`);
    startTransition(async () => {
      const r = await pedidoDaRequisicao(
        listaId,
        pedir.map((x) => ({ produtoId: x.produtoId, quantidade: x.q! })),
      );
      if (!r.ok) return setErro(r.message);
      router.push(`/admin/compras/pedidos/${r.data.id}`);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        {contados === 0
          ? "Nenhum produto desta compra de rotina foi contado hoje em contagem finalizada. Finalize a contagem do dia, ou digite as quantidades."
          : `${contados} de ${plural(linhas.length, "produto contado", "produtos contados")} hoje. O sugerido é o ideal menos o contado, arredondado ao lote.`}
      </p>

      {/* Um cartão por produto: o nome, o que foi contado e o ideal em
          selos, e o quanto pedir com − e + do lado, que no celular é mais
          rápido que abrir o teclado para mudar um número. */}
      <ul onKeyDown={enterProximoValor} className="space-y-2">
        {linhas.map((l) => {
          const un = UNIT_LABEL[l.unidade];
          const apagado = l.contado === null;
          const vazio = (lerNumeroBR(qtd[l.produtoId] ?? "") ?? 0) <= 0;
          return (
            <li
              key={l.produtoId}
              className={`rounded-xl border bg-[var(--card)] p-3 ${
                vazio ? "border-[var(--border)]" : "border-[var(--primary)]/40"
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className={`min-w-0 flex-1 basis-44 ${apagado ? "opacity-60" : ""}`}>
                  <p className="font-semibold leading-snug">{l.nome}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <span className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 tabular-nums">
                      {l.contado === null ? (
                        "não contado hoje"
                      ) : (
                        <>
                          contado {formatAmount(l.contado)} {un}
                          {l.contadoEm && ` · ${l.contadoEm}`}
                        </>
                      )}
                    </span>
                    {l.ideal === null ? (
                      <span className="rounded-md bg-[var(--warn-soft)] px-1.5 py-0.5 text-[var(--warn)]">sem ideal</span>
                    ) : (
                      <span className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 tabular-nums">
                        ideal {formatAmount(l.ideal)} {un}
                      </span>
                    )}
                    {l.lote !== null && (
                      <span className="rounded-md bg-[var(--muted)] px-1.5 py-0.5 tabular-nums">
                        lote {formatAmount(l.lote)}
                      </span>
                    )}
                    {/* Por que não veio sugestão, quando os selos de cima
                        ainda não dizem ("não contado" e "sem ideal" já dizem). */}
                    {l.sugerido === null && (l.motivo === "no-ideal" || l.motivo === "meio-lote") && (
                      <span className="rounded-md bg-[var(--ok-soft)] px-1.5 py-0.5 text-[var(--ok-strong)]">
                        {POR_QUE[l.motivo]}
                      </span>
                    )}
                  </p>
                  {l.idealSugeridoPendente !== null && (
                    <p className="mt-1 text-xs" style={{ color: "var(--warn)" }}>
                      Ideal sugerido pelo estoquista ({formatAmount(l.idealSugeridoPendente)} {un}) esperando decisão
                      {!peloLink && (
                        <>
                          {" · "}
                          <Link href="/admin/compras/pendencias" className="underline underline-offset-4">
                            decidir
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                </div>
                {/* "Pedir" e o − 1 + numa linha só: com o rótulo em cima, quando a
                    linha quebrava no celular ele ficava solto no meio. */}
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm text-[var(--muted-foreground)]">Pedir</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => passo(l, -1)}
                      disabled={vazio}
                      aria-label={`Menos ${l.nome}`}
                      className="flex size-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] disabled:opacity-40"
                    >
                      <Minus aria-hidden className="size-4" />
                    </button>
                    <input
                      inputMode="decimal"
                      data-valor
                      value={qtd[l.produtoId] ?? ""}
                      onChange={(e) => setQtd((a) => ({ ...a, [l.produtoId]: e.target.value }))}
                      placeholder="0"
                      aria-label={`Quanto pedir de ${l.nome}`}
                      className="field num-display h-10 w-16 bg-[var(--surface)] px-2 py-0 text-center"
                    />
                    <button
                      type="button"
                      onClick={() => passo(l, 1)}
                      aria-label={`Mais ${l.nome}`}
                      className="flex size-10 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)]"
                    >
                      <Plus aria-hidden className="size-4" />
                    </button>
                    <span className="w-9 text-xs text-[var(--muted-foreground)]">{un}</span>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <div className="sticky bottom-[calc(var(--barra-de-baixo)+0.75rem)] z-10 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-lg">
        <p className="min-w-0 flex-1 text-sm">
          {pedir.length === 0 ? (
            <span className="text-[var(--muted-foreground)]">Nada a pedir</span>
          ) : (
            <span className="font-medium">{plural(pedir.length, "produto no pedido", "produtos no pedido")}</span>
          )}
        </p>
        <Button type="button" className="h-11 px-5" disabled={pendente || pedir.length === 0} onClick={criar}>
          {pendente ? "Criando…" : "Criar pedido"}
        </Button>
      </div>
    </div>
  );
}
