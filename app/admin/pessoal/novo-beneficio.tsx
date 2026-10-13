"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criarBeneficioRapido } from "@/lib/actions/pessoal";

export type BeneficioCriado = { id: number; nome: string; forma: "POR_MES" | "POR_DIA"; valor: number };

/**
 * "+ Outro benefício": cria na hora um benefício que ainda não existe no
 * cadastro (ajuda de custo, pagamento extra), por mês ou por dia, valendo só
 * para quem for marcado. Quem chama decide o que fazer com ele (marcar para
 * a pessoa).
 */
export function NovoBeneficio({ aoCriar }: { aoCriar: (b: BeneficioCriado) => void | Promise<void> }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [forma, setForma] = useState<"POR_MES" | "POR_DIA">("POR_MES");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex items-center gap-1 text-sm text-[var(--primary)] underline underline-offset-4"
      >
        <Plus aria-hidden className="size-3.5" />
        Outro benefício
      </button>
    );
  }

  function criar() {
    setErro(null);
    startTransition(async () => {
      const r = await criarBeneficioRapido(nome, forma, valor);
      if (!r.ok) return setErro(r.message);
      await aoCriar({ id: r.data.id, nome: r.data.nome, forma, valor: r.data.valor });
      setNome("");
      setValor("");
      setAberto(false);
    });
  }

  const escolha = (ativo: boolean) =>
    `h-9 rounded-lg border px-2 text-sm font-semibold ${
      ativo ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-[var(--border)] bg-[var(--card)]"
    }`;

  // Não é <form>: ele mora dentro do formulário de aprovação, e formulário dentro de formulário não existe.
  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2.5">
      <Input
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        placeholder="Nome, ex.: Ajuda de custo"
        maxLength={60}
        aria-label="Nome do benefício"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={forma === "POR_MES"} onClick={() => setForma("POR_MES")} className={escolha(forma === "POR_MES")}>
          por mês
        </button>
        <button type="button" aria-pressed={forma === "POR_DIA"} onClick={() => setForma("POR_DIA")} className={escolha(forma === "POR_DIA")}>
          por dia
        </button>
        <Input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          placeholder="R$ 0,00"
          aria-label="Valor do benefício"
          className="h-9 w-28"
        />
      </div>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pendente || nome.trim().length < 2 || !valor.trim()} onClick={criar}>
          {pendente ? "Criando…" : "Adicionar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
