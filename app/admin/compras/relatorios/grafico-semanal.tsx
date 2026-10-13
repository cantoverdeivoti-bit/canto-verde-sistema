"use client";

import { useState } from "react";

import { formatMoney } from "@/lib/format";
import type { SemanaDoGrafico } from "@/lib/painel-compras";

import { dinheiroCurto, escalaDoZero } from "./escala";

/** "21/09" */
function diaMes(dia: string) {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/**
 * O pedido semana a semana, contra o orçamento de cada semana.
 *
 * Colunas em CSS, e não SVG: o texto fica do tamanho de texto no celular e
 * no computador, em vez de encolher junto com o desenho. O eixo tem três
 * valores redondos e linhas-guia leves.
 *
 * As colunas em cinza, e a semana que passou do orçamento em vermelho: é a
 * única que pede ação. A semana em andamento fica mais clara, porque ainda
 * vai crescer. O traço tracejado é o orçamento; sem traço, a semana não teve
 * orçamento.
 *
 * Tocar numa coluna (ou passar o mouse) mostra os números dela embaixo —
 * pedido, recebido e orçamento. Começa mostrando a última semana. Para leitor
 * de tela, a mesma coisa vai numa tabela escondida.
 */
export function GraficoSemanal({ semanas }: { semanas: SemanaDoGrafico[] }) {
  const [escolhida, setEscolhida] = useState(semanas.length - 1);

  // Sem nenhum pedido, o gráfico seria só o traço do orçamento solto no ar.
  if (semanas.every((s) => s.pedido <= 0)) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
        Nenhum pedido nestas {semanas.length} semanas.
      </p>
    );
  }

  const maior = Math.max(...semanas.map((s) => Math.max(s.pedido, s.orcamento ?? 0)));
  const { topo, marcas } = escalaDoZero(maior);
  const altura = (v: number) => `${(v / topo) * 100}%`;
  const s = semanas[Math.min(escolhida, semanas.length - 1)];
  const estourou = (x: SemanaDoGrafico) => x.orcamento !== null && x.pedido > x.orcamento;

  return (
    <div>
      <div className="flex gap-2">
        {/* Eixo: os valores redondos, na altura das linhas-guia. */}
        <div aria-hidden className="relative h-44 w-14 shrink-0 text-right text-[11px] text-[var(--muted-foreground)]">
          {marcas.map((m) => (
            <span key={m} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: altura(m) }}>
              {dinheiroCurto(m)}
            </span>
          ))}
        </div>

        <div className="relative h-44 min-w-0 flex-1">
          {marcas.map((m) => (
            <div
              key={m}
              aria-hidden
              className={`absolute inset-x-0 border-t ${m === 0 ? "border-[var(--border)]" : "border-dashed border-[var(--border)] opacity-70"}`}
              style={{ bottom: altura(m) }}
            />
          ))}
          <div aria-hidden className="relative flex h-full items-end gap-1 sm:gap-2">
            {semanas.map((x, i) => (
              <button
                key={x.semana}
                type="button"
                tabIndex={-1}
                onClick={() => setEscolhida(i)}
                // Só o mouse de verdade: no toque, o "passar por cima" dispara
                // também quando a página rola, e trocava a semana sem querer.
                onPointerEnter={(e) => e.pointerType === "mouse" && setEscolhida(i)}
                className={`relative flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-end rounded-t-sm ${
                  i === escolhida ? "bg-[color-mix(in_oklch,var(--foreground)_8%,transparent)]" : ""
                }`}
              >
                <span
                  className="block w-full rounded-t-sm"
                  style={{
                    height: altura(x.pedido),
                    minHeight: x.pedido > 0 ? 2 : 0,
                    background: estourou(x)
                      ? "var(--destructive)"
                      : "color-mix(in oklch, var(--foreground) 28%, var(--background))",
                    opacity: x.emAndamento ? 0.5 : 1,
                  }}
                />
                {x.orcamento !== null && (
                  <span
                    className="absolute inset-x-0 border-t-2 border-dashed border-[var(--foreground)] opacity-60"
                    style={{ bottom: altura(x.orcamento) }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* As datas: no celular, uma semana sim e outra não — doze não cabem. */}
      <div aria-hidden className="mt-1 flex gap-2">
        <div className="w-14 shrink-0" />
        <div className="flex min-w-0 flex-1 gap-1 sm:gap-2">
          {semanas.map((x, i) => (
            <span
              key={x.semana}
              className={`min-w-0 flex-1 text-center text-[10px] sm:text-xs ${
                i === escolhida ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)]"
              } ${(semanas.length - 1 - i) % 2 === 1 ? "invisible sm:visible" : ""}`}
            >
              {diaMes(x.semana)}
            </span>
          ))}
        </div>
      </div>

      {/* Os números da semana escolhida. */}
      <p aria-live="polite" className="mt-2 rounded-lg bg-[var(--surface)] px-3 py-2 text-sm">
        <span className="font-semibold">
          Semana de {diaMes(s.semana)}
          {s.emAndamento && " (em andamento)"}
        </span>
        {" · "}pedido <span className="num-display">{formatMoney(s.pedido)}</span>
        {" · "}recebido <span className="num-display">{formatMoney(s.recebido)}</span>
        {" · "}
        {s.orcamento === null ? (
          "sem orçamento"
        ) : (
          <>
            orçamento <span className="num-display">{formatMoney(s.orcamento)}</span>
            {estourou(s) && (
              <span className="font-semibold" style={{ color: "var(--destructive)" }}>
                {" "}
                (passou {formatMoney(s.pedido - s.orcamento)})
              </span>
            )}
          </>
        )}
      </p>

      {/* No div, e não na tabela: tabela ignora o recorte do sr-only e
          alargava a página no celular. */}
      <div className="sr-only">
      <table>
        <caption>Pedido por semana contra o orçamento</caption>
        <thead>
          <tr>
            <th>Semana</th>
            <th>Pedido</th>
            <th>Recebido</th>
            <th>Orçamento</th>
          </tr>
        </thead>
        <tbody>
          {semanas.map((x) => (
            <tr key={x.semana}>
              <td>
                {diaMes(x.semana)}
                {x.emAndamento && " (em andamento)"}
              </td>
              <td>{formatMoney(x.pedido)}</td>
              <td>{formatMoney(x.recebido)}</td>
              <td>{x.orcamento === null ? "sem orçamento" : formatMoney(x.orcamento)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
