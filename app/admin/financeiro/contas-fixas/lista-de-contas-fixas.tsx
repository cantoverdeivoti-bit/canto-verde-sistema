"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apagarRecorrencia, ligarRecorrencia, salvarRecorrencia } from "@/lib/actions/financeiro";
import { mesCurto, TIPO_LANCAMENTO } from "@/lib/financeiro";
import type { OpcoesDoFinanceiro } from "@/lib/financeiro-dados";
import { formatMoney, precoNoCampo } from "@/lib/format";
import type { TipoLancamento } from "@/generated/prisma/client";

import { useAcao } from "@/lib/use-acao";
import { OpcoesDeCategoria } from "../_comum/opcoes-de-categoria";

type ContaFixa = {
  id: number;
  tipo: TipoLancamento;
  descricao: string;
  categoriaId: number;
  categoria: string;
  /** A categoria foi desligada no plano de contas: a conta fixa segue gerando nela. */
  categoriaDesligada: boolean;
  contaId: number | null;
  conta: string | null;
  fornecedorId: number | null;
  fornecedor: string | null;
  centroCustoId: number | null;
  centro: string | null;
  valor: number;
  diaVencimento: number;
  inicio: string;
  fim: string | null;
  ativo: boolean;
};

type NoForm = {
  tipo: TipoLancamento;
  descricao: string;
  categoriaId: number | null;
  contaId: number | null;
  fornecedorId: number | null;
  centroCustoId: number | null;
  valor: string;
  diaVencimento: string;
  inicio: string;
  fim: string;
};

export function ListaDeContasFixas({ itens, opcoes, hoje }: { itens: ContaFixa[]; opcoes: OpcoesDoFinanceiro; hoje: string }) {
  const [abrindo, setAbrindo] = useState<number | "nova" | null>(null);
  const [apagando, setApagando] = useState<number | null>(null);
  const { erro, pendente, rodar } = useAcao();
  const vazia: NoForm = { tipo: "PAGAR", descricao: "", categoriaId: null, contaId: null, fornecedorId: null, centroCustoId: null, valor: "", diaVencimento: "10", inicio: hoje.slice(0, 7), fim: "" };

  return (
    <div className="space-y-4">
      <Button type="button" className="h-11 gap-1.5" onClick={() => setAbrindo(abrindo === "nova" ? null : "nova")}>
        <Plus aria-hidden className="size-4" />
        Nova conta fixa
      </Button>
      {abrindo === "nova" && <ContaFixaForm id={null} inicial={vazia} opcoes={opcoes} fechar={() => setAbrindo(null)} />}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      {itens.length === 0 && abrindo !== "nova" && (
        <p className="text-sm text-[var(--muted-foreground)]">Nenhuma conta fixa. Comece pelo aluguel, a luz e o contador.</p>
      )}
      {itens.length > 0 && (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {itens.map((r) =>
            abrindo === r.id ? (
              <li key={r.id} className="p-3">
                <ContaFixaForm
                  id={r.id}
                  opcoes={opcoes}
                  inicial={{ ...r, valor: precoNoCampo(r.valor), diaVencimento: String(r.diaVencimento), fim: r.fim ?? "" }}
                  categoriaAtual={{ id: r.categoriaId, nome: r.categoria }}
                  fechar={() => setAbrindo(null)}
                />
              </li>
            ) : (
              <li key={r.id} className={`flex min-h-14 items-center gap-2 px-3 py-2 ${r.ativo ? "" : "opacity-60"}`}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.descricao}</p>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">
                    {[
                      r.tipo === "RECEBER" ? TIPO_LANCAMENTO.RECEBER.toLowerCase() : null,
                      `todo dia ${r.diaVencimento}`,
                      r.categoria,
                      r.centro,
                      r.fornecedor,
                      r.fim ? `até ${mesCurto(r.fim)}` : null,
                      r.ativo ? null : "desligada",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {r.categoriaDesligada && r.ativo && (
                    <p className="text-xs" style={{ color: "var(--warn)" }}>
                      A categoria {r.categoria} foi desligada no plano de contas. Edite e escolha outra.
                    </p>
                  )}
                </div>
                <p className="num-display shrink-0 text-sm">{formatMoney(r.valor)}</p>
                {apagando === r.id ? (
                  <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="destructive" size="sm" disabled={pendente} onClick={() => rodar(() => apagarRecorrencia(r.id), () => setApagando(null))}>
                      Apagar
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setApagando(null)}>
                      voltar
                    </Button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => rodar(() => ligarRecorrencia(r.id, !r.ativo))} disabled={pendente} className="chip px-2.5 py-1 text-xs">
                      {r.ativo ? "Desligar" : "Ligar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAbrindo(r.id)}
                      aria-label={`Editar ${r.descricao}`}
                      title="Editar"
                      className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                    >
                      <Pencil aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setApagando(r.id)}
                      aria-label={`Apagar ${r.descricao}`}
                      title="Apagar (os lançamentos já gerados ficam)"
                      className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function ContaFixaForm({
  id,
  inicial,
  opcoes,
  fechar,
  categoriaAtual = null,
}: {
  id: number | null;
  inicial: NoForm;
  opcoes: OpcoesDoFinanceiro;
  fechar: () => void;
  categoriaAtual?: { id: number; nome: string } | null;
}) {
  const [v, setV] = useState(inicial);
  const { erro, pendente, rodar } = useAcao();
  const muda = <K extends keyof NoForm>(k: K, valor: NoForm[K]) => setV((a) => ({ ...a, [k]: valor }));
  const categorias = opcoes.categorias.filter((c) => c.tipo === v.tipo);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.categoriaId === null) return;
        rodar(() => salvarRecorrencia(id, { ...v, categoriaId: v.categoriaId! }), fechar);
      }}
      className="card space-y-3 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Descrição</span>
          <Input value={v.descricao} onChange={(e) => muda("descricao", e.target.value)} required maxLength={120} autoFocus placeholder="Aluguel do salão" />
        </label>
        <label>
          <span className="label">É</span>
          <select value={v.tipo} onChange={(e) => setV((a) => ({ ...a, tipo: e.target.value as TipoLancamento, categoriaId: null }))} className="field">
            <option value="PAGAR">Conta a pagar</option>
            <option value="RECEBER">Conta a receber</option>
          </select>
        </label>
        <label>
          <span className="label">Categoria</span>
          <select
            value={v.categoriaId ?? ""}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              const sugerido = categorias.find((c) => c.id === id)?.centroPadraoId ?? null;
              // Sugere o centro da categoria só se ninguém escolheu um ainda.
              setV((a) => ({ ...a, categoriaId: id, centroCustoId: a.centroCustoId ?? sugerido }));
            }}
            className="field"
            required
          >
            <OpcoesDeCategoria categorias={categorias} atual={categoriaAtual} />
          </select>
        </label>
        <label>
          <span className="label">Valor (R$)</span>
          <Input inputMode="decimal" value={v.valor} onChange={(e) => muda("valor", e.target.value)} placeholder="0,00" required />
        </label>
        <label>
          <span className="label">Vence todo dia</span>
          <Input inputMode="numeric" value={v.diaVencimento} onChange={(e) => muda("diaVencimento", e.target.value)} className="w-24" required />
          <span className="hint block">Em mês mais curto, cai no último dia.</span>
        </label>
        <label>
          <span className="label">A partir de</span>
          <Input type="month" value={v.inicio} onChange={(e) => muda("inicio", e.target.value)} required />
        </label>
        <label>
          <span className="label">Até (opcional)</span>
          <Input type="month" value={v.fim} onChange={(e) => muda("fim", e.target.value)} />
        </label>
        {v.tipo === "PAGAR" && (
          <label>
            <span className="label">Fornecedor</span>
            <select value={v.fornecedorId ?? ""} onChange={(e) => muda("fornecedorId", e.target.value ? Number(e.target.value) : null)} className="field">
              <option value="">Nenhum</option>
              {opcoes.fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="label">Centro de custo</span>
          <select value={v.centroCustoId ?? ""} onChange={(e) => muda("centroCustoId", e.target.value ? Number(e.target.value) : null)} className="field">
            <option value="">Sem centro</option>
            {opcoes.centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Conta</span>
          <select value={v.contaId ?? ""} onChange={(e) => muda("contaId", e.target.value ? Number(e.target.value) : null)} className="field">
            <option value="">Decido na baixa</option>
            {opcoes.contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      </div>
      {id !== null && <p className="hint">Mudar aqui vale para os próximos lançamentos. O do mês que já foi gerado se edita em Contas a pagar.</p>}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente || v.categoriaId === null}>
          {pendente ? "Salvando…" : id === null ? "Criar conta fixa" : "Salvar"}
        </Button>
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
