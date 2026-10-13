"use client";

import { useState } from "react";

import { formatMoney } from "@/lib/format";

import { escalaDaFaixa } from "../escala";

/**
 * As cores dos fornecedores nos pontos; do quarto em diante, cinza. Verde,
 * marrom e azul: as duas outras cores de gráfico do tema são verdes também, e
 * ponto verde ao lado de ponto verde não diz de quem é.
 */
const CORES = ["var(--chart-1)", "var(--chart-3)", "#2f6fb0"];
const COR_OUTROS = "var(--chart-4)";

/** "R$ 0,015" — preço por unidade pode ter até 4 casas. */
function precoDoEixo(v: number) {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

/**
 * O preço de um produto ao longo do tempo: uma linha, e um ponto por compra
 * na cor do fornecedor.
 *
 * O desenho da linha é um SVG que estica com a largura; eixo, datas e pontos
 * são HTML por cima dele. Assim a letra fica do mesmo tamanho no celular e no
 * computador (num SVG inteiro, ela encolhia junto e virava 6px no celular) e
 * o ponto continua redondo.
 *
 * Tocar num ponto (ou passar o mouse) mostra a compra embaixo: data, preço e
 * fornecedor. Começa na mais recente. Com menos de duas compras não há linha:
 * aparece `vazio`.
 */
export function LinhaDePreco({
  pontos,
  timezone,
  vazio,
}: {
  pontos: { data: Date; preco: number; fornecedor: string | null }[];
  timezone: string;
  vazio?: React.ReactNode;
}) {
  const [escolhido, setEscolhido] = useState(pontos.length - 1);

  if (pontos.length < 2) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
        {vazio ?? "Menos de duas compras: não há linha para desenhar."}
      </p>
    );
  }

  const t0 = pontos[0].data.getTime();
  const t1 = pontos[pontos.length - 1].data.getTime();
  const { base, topo, marcas } = escalaDaFaixa(
    Math.min(...pontos.map((p) => p.preco)),
    Math.max(...pontos.map((p) => p.preco)),
  );
  // Em % da área do desenho; o SVG usa a mesma conta com viewBox 0..100.
  const x = (t: number) => (t1 > t0 ? ((t - t0) / (t1 - t0)) * 100 : 50);
  const y = (v: number) => (1 - (v - base) / (topo - base)) * 100;
  const dia = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "2-digit", timeZone: timezone });

  // Os fornecedores que mais aparecem ganham cor; o resto, cinza.
  const contagem = new Map<string, number>();
  for (const p of pontos) contagem.set(p.fornecedor ?? "compra antiga", (contagem.get(p.fornecedor ?? "compra antiga") ?? 0) + 1);
  const ordem = [...contagem].sort((a, b) => b[1] - a[1]).map(([nome]) => nome);
  const corDe = (nome: string) => CORES[ordem.indexOf(nome)] ?? COR_OUTROS;
  const legenda = ordem.slice(0, CORES.length);
  const temOutros = ordem.length > CORES.length;

  const p = pontos[Math.min(escolhido, pontos.length - 1)];
  const meio = pontos[Math.floor((pontos.length - 1) / 2)];

  return (
    <div>
      <div className="flex gap-2">
        <div aria-hidden className="relative h-48 w-16 shrink-0 text-right text-[11px] text-[var(--muted-foreground)]">
          {marcas.map((m) => (
            <span key={m} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: `${y(m)}%` }}>
              {precoDoEixo(m)}
            </span>
          ))}
        </div>
        {/* Folga dos lados, para o primeiro e o último ponto não saírem da área. */}
        <div className="relative h-48 min-w-0 flex-1 px-2">
          <div className="relative h-full">
            {marcas.map((m) => (
              <div
                key={m}
                aria-hidden
                className="absolute inset-x-0 border-t border-dashed border-[var(--border)]"
                style={{ top: `${y(m)}%` }}
              />
            ))}
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
            >
              <polyline
                points={pontos.map((q) => `${x(q.data.getTime())},${y(q.preco)}`).join(" ")}
                fill="none"
                // Linha neutra: quem tem cor são os pontos, um por fornecedor.
                stroke="color-mix(in oklch, var(--foreground) 45%, var(--background))"
                strokeWidth="2"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {pontos.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setEscolhido(i)}
                onPointerEnter={(e) => e.pointerType === "mouse" && setEscolhido(i)}
                aria-label={`${dia(q.data)}, ${formatMoney(q.preco)}, ${q.fornecedor ?? "compra antiga"}`}
                aria-pressed={i === escolhido}
                // Alvo de 28px para o dedo; o ponto visível tem 10px.
                className="absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                style={{ left: `${x(q.data.getTime())}%`, top: `${y(q.preco)}%` }}
              >
                <span
                  className="block rounded-full border-2 border-[var(--background)]"
                  style={{
                    width: i === escolhido ? 14 : 10,
                    height: i === escolhido ? 14 : 10,
                    background: corDe(q.fornecedor ?? "compra antiga"),
                    boxShadow: i === escolhido ? "0 0 0 2px var(--foreground)" : undefined,
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div aria-hidden className="mt-1 flex gap-2 text-[11px] text-[var(--muted-foreground)] sm:text-xs">
        <div className="w-16 shrink-0" />
        <div className="flex min-w-0 flex-1 justify-between px-2">
          <span>{dia(pontos[0].data)}</span>
          {pontos.length > 2 && <span className="hidden sm:inline">{dia(meio.data)}</span>}
          <span>{dia(pontos[pontos.length - 1].data)}</span>
        </div>
      </div>

      <p aria-live="polite" className="mt-2 rounded-lg bg-[var(--surface)] px-3 py-2 text-sm">
        <span className="font-semibold">{dia(p.data)}</span>
        {" · "}
        <span className="num-display">{formatMoney(p.preco)}</span>
        {" · "}
        {p.fornecedor ?? <span className="text-[var(--muted-foreground)]">compra antiga</span>}
      </p>

      {(legenda.length > 1 || temOutros) && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
          {legenda.map((nome) => (
            <li key={nome} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: corDe(nome) }} />
              {nome}
            </li>
          ))}
          {temOutros && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: COR_OUTROS }} />
              outros
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
