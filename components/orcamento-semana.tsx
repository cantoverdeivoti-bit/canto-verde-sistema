"use client";

import { ChevronDown, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { definirOrcamentoDaSemana } from "@/lib/actions/orcamento";
import { formatDiaCurtoString, formatMoney, lerNumeroBR, plural } from "@/lib/format";
import type { OrcamentoDaSemana } from "@/lib/orcamento";

function pctTexto(n: number) {
  return `${String(Math.round(n * 10) / 10).replace(".", ",")}%`;
}

/**
 * O orçamento de compra da semana numa linha: faturamento da semana anterior
 * × meta de CMV, o que já foi pedido na semana e, quando a tela tem uma
 * compra sendo feita, quanto ela soma e se passa.
 *
 * Sem orçamento na semana, a linha vira os dois campos e um Salvar — é a
 * primeira compra da semana que pede o faturamento; as outras só mostram.
 */
export function OrcamentoSemana({
  dados,
  estaCompra,
  semPreco = 0,
  className = "",
}: {
  dados: OrcamentoDaSemana;
  /** O estimado da compra desta tela, somado ao que já foi pedido. */
  estaCompra?: number;
  /** Itens desta compra sem preço conhecido — o estimado fica por baixo. */
  semPreco?: number;
  className?: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(dados.faturamento === null);
  const [faturamento, setFaturamento] = useState(
    dados.faturamento === null ? "" : String(dados.faturamento).replace(".", ","),
  );
  const [meta, setMeta] = useState(String(dados.metaCmv).replace(".", ","));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  // A lista dia a dia do "Já pedido", aberta com um toque nele.
  const [verDias, setVerDias] = useState(false);

  const fat = lerNumeroBR(faturamento);

  function salvar() {
    setErro(null);
    const pct = lerNumeroBR(meta);
    if (fat === null || fat <= 0) return setErro("Digite o faturamento.");
    if (pct === null || pct <= 0 || pct > 100) return setErro("Meta entre 1 e 100%.");
    startTransition(async () => {
      const r = await definirOrcamentoDaSemana(fat, pct);
      if (!r.ok) return setErro(r.message ?? "Não deu para salvar.");
      setEditando(false);
      router.refresh();
    });
  }

  if (editando || dados.orcamento === null) {
    return (
      <form
        className={`grid grid-cols-[minmax(0,1fr)_6.5rem] items-end gap-3 text-sm sm:flex sm:flex-wrap ${className}`}
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        {/* Cada campo com o nome em cima, como os outros formulários: o nome
            ao lado espremia o campo e desalinhava a fileira. No celular, os
            dois campos lado a lado e o Salvar inteiro embaixo. */}
        <label className="flex min-w-0 flex-col gap-1 sm:w-44">
          <span className="text-xs text-[var(--muted-foreground)]">Faturamento da semana anterior</span>
          <span className="relative">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-[var(--muted-foreground)]">
              R$
            </span>
            <Input
              inputMode="decimal"
              value={faturamento}
              onChange={(e) => setFaturamento(e.target.value)}
              placeholder="0,00"
              aria-label="Faturamento da semana anterior, em reais"
              className={`num-display h-11 w-full pl-10 text-right ${fat === null || fat <= 0 ? "border-[var(--primary)]" : ""}`}
            />
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[var(--muted-foreground)]">Meta CMV</span>
          <span className="relative">
            <Input
              inputMode="decimal"
              value={meta}
              onChange={(e) => setMeta(e.target.value)}
              aria-label="Meta de CMV, em porcentagem do faturamento"
              className="num-display h-11 w-full pr-8 text-right sm:w-24"
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-[var(--muted-foreground)]">
              %
            </span>
          </span>
        </label>
        <button
          type="submit"
          disabled={pendente}
          className="col-span-2 h-11 rounded-lg bg-[var(--botao)] px-5 text-[15px] font-semibold text-[var(--botao-texto)] disabled:opacity-60"
        >
          {pendente ? "Salvando…" : "Salvar"}
        </button>
        {erro && (
          <span role="alert" className="col-span-2 text-xs" style={{ color: "var(--destructive)" }}>
            {erro}
          </span>
        )}
      </form>
    );
  }

  const usado = dados.gasto + (estaCompra ?? 0);
  const diferenca = dados.orcamento - usado;
  const passou = diferenca < 0;
  // As duas partes da barra, em % do orçamento (a soma para em 100).
  const pctPedido = Math.min((dados.gasto / dados.orcamento) * 100, 100);
  const pctCompra = Math.min(((estaCompra ?? 0) / dados.orcamento) * 100, 100 - pctPedido);

  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      {/* O título e de onde vem o número, com o lápis para corrigir. */}
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-[var(--foreground)]">Orçamento da semana</span>
        <span className="truncate text-[var(--muted-foreground)]">
          {pctTexto(dados.metaCmv)} de {reais(dados.faturamento!)}
        </span>
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="-my-1 ml-auto inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
          title="Corrigir o faturamento ou a meta"
          aria-label="Corrigir o faturamento ou a meta"
        >
          <Pencil aria-hidden className="size-3.5" />
        </button>
      </div>

      {/* A barra: o que já foi pedido na semana e o que esta compra ocupa.
          Passou do orçamento, ela fica toda vermelha. */}
      <div
        aria-hidden
        className="flex h-2 overflow-hidden rounded-full bg-[var(--muted)]"
        style={passou ? { background: "var(--destructive)" } : undefined}
      >
        {!passou && (
          <>
            <span style={{ width: `${pctPedido}%`, background: "color-mix(in oklch, var(--foreground) 45%, var(--background))" }} />
            <span style={{ width: `${pctCompra}%`, background: "var(--primary)" }} />
          </>
        )}
      </div>

      {/* Os números lado a lado, cada um com o nome em cima. */}
      <dl className={`grid gap-2 ${estaCompra !== undefined ? "grid-cols-4" : "grid-cols-3"}`}>
        <Numero rotulo="Orçamento" valor={reais(dados.orcamento)} />
        {/* Um toque abre o que entrou, dia a dia desde segunda: é como se
            confere se a compra de um dia ficou de fora, ou valendo zero. */}
        <Numero
          rotulo="Já pedido"
          valor={reais(dados.gasto)}
          marca="color-mix(in oklch, var(--foreground) 45%, var(--background))"
          aberto={verDias}
          aoTocar={() => setVerDias((v) => !v)}
        />
        {estaCompra !== undefined && (
          <Numero
            rotulo={semPreco > 0 ? `Esta compra · ${semPreco} s/ preço` : "Esta compra"}
            valor={`≈ ${reais(estaCompra)}`}
            marca="var(--primary)"
          />
        )}
        <Numero
          rotulo={passou ? "Passa" : "Sobra"}
          valor={reais(Math.abs(diferenca))}
          cor={passou ? "var(--destructive)" : "var(--ok-strong)"}
        />
      </dl>

      {verDias && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs">
          <p className="font-medium">Já pedido desde {formatDiaCurtoString(dados.semana)}</p>
          <ul className="mt-1 divide-y divide-[var(--border)]">
            {dados.porDia.map((d) => (
              <li key={d.dia} className="flex items-baseline gap-2 py-1.5">
                <span className="shrink-0 font-medium whitespace-nowrap">{diaCurto(d.dia)}</span>
                <span className="min-w-0 flex-1 text-[var(--muted-foreground)]">
                  {d.pedidos === 0 ? "nenhum pedido" : plural(d.pedidos, "pedido", "pedidos")}
                  {d.semPreco > 0 && (
                    <span style={{ color: "var(--warn)" }}>
                      {" "}
                      · {plural(d.semPreco, "item", "itens")} s/ preço
                    </span>
                  )}
                </span>
                <span className="num-display shrink-0 font-semibold">{formatMoney(d.valor)}</span>
              </li>
            ))}
          </ul>
          {dados.semPreco > 0 && (
            <p className="mt-1 text-[var(--muted-foreground)]">
              Item sem preço combinado e nunca comprado antes fica fora da soma até o preço chegar.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * O orçamento visto pelo link de atalhos: só quanto da semana já foi usado,
 * em porcentagem. Sem faturamento nem valores, que dão para deduzir um do
 * outro, e sem campo para digitar (decisão do dono). O servidor manda só a
 * porcentagem: os reais nem chegam ao navegador.
 */
export function PorcentagemDoOrcamento({ pct, className = "" }: { pct: number | null; className?: string }) {
  if (pct === null) {
    return (
      <p className={`text-xs text-[var(--muted-foreground)] ${className}`}>
        O orçamento da semana ainda não foi definido.
      </p>
    );
  }
  const passou = pct > 100;
  return (
    <div className={`min-w-0 space-y-1.5 ${className}`}>
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-[var(--foreground)]">Orçamento da semana</span>
        <span className="ml-auto font-semibold" style={{ color: passou ? "var(--destructive)" : "var(--ok-strong)" }}>
          {pctTexto(pct)} usado
        </span>
      </div>
      <div
        aria-hidden
        className="flex h-2 overflow-hidden rounded-full bg-[var(--muted)]"
        style={passou ? { background: "var(--destructive)" } : undefined}
      >
        {!passou && <span style={{ width: `${pct}%`, background: "var(--primary)" }} />}
      </div>
    </div>
  );
}

/** "seg 05/10": o dia da lista do "Já pedido", numa linha só. */
function diaCurto(dia: string) {
  const [semana, data] = formatDiaCurtoString(dia).split(", ");
  return `${semana.slice(0, 3)} ${data}`;
}

/** "R$ 20.958" — sem centavos, para os quatro números caberem lado a lado. */
function reais(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

/** Um número com o nome em cima; `marca` é a bolinha da cor dele na barra. */
function Numero({
  rotulo,
  valor,
  cor,
  marca,
  aberto,
  aoTocar,
}: {
  rotulo: string;
  valor: string;
  cor?: string;
  marca?: string;
  /** Definido, o número abre uma lista: a seta diz se está aberta. */
  aberto?: boolean;
  /* O bloco inteiro vira o botão, e não um `<button>` em volta: dentro de
     `<dl>` só cabe `div` com `dt` e `dd`. */
  aoTocar?: () => void;
}) {
  const botao = aoTocar
    ? {
        role: "button",
        tabIndex: 0,
        "aria-expanded": aberto,
        onClick: aoTocar,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            aoTocar();
          }
        },
      }
    : {};
  return (
    <div
      className={`min-w-0 ${aoTocar ? "-m-1 cursor-pointer rounded-md p-1 hover:bg-[var(--muted)]" : ""}`}
      {...botao}
    >
      <dt className="flex items-center gap-1 truncate text-[11px] text-[var(--muted-foreground)]">
        {marca && <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: marca }} />}
        {rotulo}
      </dt>
      <dd
        className="num-display flex items-center gap-0.5 truncate text-sm font-semibold"
        style={cor ? { color: cor } : undefined}
      >
        {valor}
        {aberto !== undefined && (
          <ChevronDown
            aria-hidden
            className={`size-3.5 shrink-0 text-[var(--muted-foreground)] transition-transform ${aberto ? "rotate-180" : ""}`}
          />
        )}
      </dd>
    </div>
  );
}
