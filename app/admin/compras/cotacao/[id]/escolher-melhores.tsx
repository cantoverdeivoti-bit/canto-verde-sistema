"use client";

import { Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { escolherMelhores, type ResumoDaEscolha } from "@/lib/actions/cotacao";
import { formatMoney, plural } from "@/lib/format";

/**
 * O botão "Escolher os melhores" e o resumo que vem antes de gravar.
 *
 * Primeiro toque: a conta é feita e mostrada (quantos itens, para quem,
 * quanto), sem gravar nada. Segundo toque, "Confirmar": grava. O dono sempre
 * vê o que vai mudar antes de mudar — e o que ele já escolheu à mão não entra
 * na conta.
 */
export function EscolherMelhores({ cotacaoId }: { cotacaoId: number }) {
  const [resumo, setResumo] = useState<ResumoDaEscolha | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function calcular() {
    setErro(null);
    setFeito(null);
    startTransition(async () => {
      const r = await escolherMelhores(cotacaoId, false);
      if (!r.ok) return setErro(r.message);
      if (r.data.itens === 0) return setErro("Todos os itens com preço já têm alguém escolhido.");
      setResumo(r.data);
    });
  }

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const r = await escolherMelhores(cotacaoId, true);
      if (!r.ok) return setErro(r.message);
      setResumo(null);
      setFeito(`${plural(r.data.itens, "item escolhido", "itens escolhidos")}. Confira e confirme a compra quando quiser.`);
    });
  }

  return (
    <div className="w-full sm:w-auto">
      {resumo === null && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-full gap-1.5 sm:w-auto"
          disabled={pendente}
          onClick={calcular}
          title="Marca o melhor preço de cada item ainda sem escolha"
        >
          <Sparkles aria-hidden className="size-4" />
          {pendente ? "Calculando…" : "Escolher os melhores"}
        </Button>
      )}

      {resumo !== null && (
        <div className="card mt-2 w-full space-y-3 p-4 sm:w-96" aria-live="polite">
          <p className="text-sm">
            Vou marcar {plural(resumo.itens, "item", "itens")}, total de{" "}
            <span className="num-display font-semibold">{formatMoney(resumo.total)}</span>:
          </p>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {resumo.porFornecedor.map((f) => (
              <li key={f.fornecedorId} className="py-1.5">
                <div className="flex items-baseline gap-3">
                  <span className="min-w-0 flex-1 truncate font-medium">{f.nome}</span>
                  <span className="text-[var(--muted-foreground)]">{plural(f.itens, "item", "itens")}</span>
                  <span className="num-display w-24 text-right">{formatMoney(f.total)}</span>
                </div>
                {f.minimoNaoAlcancado !== null && (
                  <p className="text-xs font-semibold" style={{ color: "var(--warn)" }}>
                    abaixo do pedido mínimo de {formatMoney(f.minimoNaoAlcancado)}: só ele tem estes itens
                  </p>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-[var(--muted-foreground)]">
            Conta o desconto por volume, evita quem ficaria abaixo do pedido mínimo e, em empate de até 3%,
            prefere quem entrega no prazo e tem mais estrelas. O que você já escolheu fica como está.
          </p>
          <div className="flex gap-2">
            <Button type="button" className="flex-1" disabled={pendente} onClick={confirmar}>
              {pendente ? "Gravando…" : "Confirmar"}
            </Button>
            <Button type="button" variant="outline" className="h-11" disabled={pendente} onClick={() => setResumo(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="mt-2 text-sm" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
      {feito && (
        <p role="status" className="mt-2 text-sm" style={{ color: "var(--ok-strong)" }}>
          {feito}
        </p>
      )}
    </div>
  );
}
