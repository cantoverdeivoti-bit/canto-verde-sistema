"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adicionarLinha, aplicarCardapio, removerLinha, salvarLinha } from "@/lib/actions/eventos";
import { CATEGORIA_LINHA, noPlural, opcoes } from "@/lib/eventos";
import { formatAmount, formatMoney, precoNoCampo } from "@/lib/format";
import type { CategoriaLinha } from "@/generated/prisma/client";

import { useAcao } from "@/lib/use-acao";

type Linha = {
  id: number;
  categoria: CategoriaLinha;
  descricao: string;
  quantidade: number;
  unidade: string;
  custoUnitario: number;
  precoUnitario: number;
  porConvidado: boolean;
  doCardapio: boolean;
};

type Cardapio = { id: number; nome: string; precoPorPessoa: number | null; custoPorPessoa: number };

type NoForm = { categoria: CategoriaLinha; descricao: string; quantidade: string; unidade: string; custoUnitario: string; precoUnitario: string; porConvidado: boolean };

/** Sugestões de quem monta orçamento de evento: o que costuma faltar na conta. */
const MODELOS: { texto: string; linha: Partial<NoForm> }[] = [
  { texto: "Bebida por pessoa", linha: { categoria: "BEBIDA", descricao: "Bebidas não alcoólicas", unidade: "pessoa", porConvidado: true } },
  { texto: "Garçom", linha: { categoria: "EQUIPE", descricao: "Garçom", unidade: "pessoa", quantidade: "1" } },
  { texto: "Cozinha extra", linha: { categoria: "EQUIPE", descricao: "Cozinheiro extra", unidade: "pessoa", quantidade: "1" } },
  { texto: "Decoração", linha: { categoria: "DECORACAO", descricao: "Decoração", unidade: "un", quantidade: "1" } },
  { texto: "Gás, luz e limpeza", linha: { categoria: "CUSTO_INTERNO", descricao: "Gás, energia e limpeza", unidade: "un", quantidade: "1", precoUnitario: "0" } },
];

const VAZIA: NoForm = { categoria: "OUTRO", descricao: "", quantidade: "1", unidade: "un", custoUnitario: "", precoUnitario: "", porConvidado: false };

/**
 * O que compõe o preço: cada linha com o custo da casa e o preço ao cliente.
 * Linha com preço zero é custo que o cliente não vê separado (gás, equipe
 * já embutida na comida).
 */
export function LinhasDoEvento({
  eventoId,
  convidados,
  linhas,
  cardapios,
  cardapioAtual,
}: {
  eventoId: number;
  convidados: number;
  linhas: Linha[];
  cardapios: Cardapio[];
  cardapioAtual: { id: number; nome: string } | null;
}) {
  const [nova, setNova] = useState<NoForm | null>(null);
  const [editando, setEditando] = useState<number | null>(null);
  const [cardapioId, setCardapioId] = useState("");
  const { erro, pendente, rodar } = useAcao();

  return (
    <section>
      <h2 className="section-label mb-2">O que está no orçamento</h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Nada ainda. Aplique um cardápio ou ponha os itens abaixo.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <li className="hidden gap-2 px-3 py-1.5 text-[11px] font-semibold text-[var(--muted-foreground)] uppercase sm:flex">
            <span className="flex-1">Item</span>
            <span className="w-28 text-right">Custo</span>
            <span className="w-28 text-right">Preço</span>
            <span className="w-[4.75rem]" />
          </li>
          {linhas.map((l) =>
            editando === l.id ? (
              <li key={l.id} className="p-3">
                <LinhaForm
                  inicial={{
                    categoria: l.categoria,
                    descricao: l.descricao,
                    quantidade: formatAmount(l.quantidade),
                    unidade: l.unidade,
                    custoUnitario: precoNoCampo(l.custoUnitario),
                    precoUnitario: precoNoCampo(l.precoUnitario),
                    porConvidado: l.porConvidado,
                  }}
                  convidados={convidados}
                  rotulo="Salvar"
                  salvar={(v) => salvarLinha(l.id, v, v.porConvidado)}
                  fechar={() => setEditando(null)}
                />
              </li>
            ) : (
              <li key={l.id} className="flex min-h-14 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 sm:flex-nowrap">
                <div className="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                  <p className="truncate font-semibold">{l.descricao}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {CATEGORIA_LINHA[l.categoria]} · {formatAmount(l.quantidade)} {noPlural(l.unidade, l.quantidade)}
                    {l.porConvidado && " (acompanha os convidados)"}
                    {l.precoUnitario > 0 && ` × ${formatMoney(l.precoUnitario)}`}
                    {l.precoUnitario === 0 && " · não cobrado à parte"}
                  </p>
                </div>
                <p className="num-display flex-1 text-sm text-[var(--muted-foreground)] sm:w-28 sm:flex-none sm:text-right">
                  <span className="sm:hidden">custo </span>
                  {formatMoney(l.quantidade * l.custoUnitario)}
                </p>
                <p className="num-display w-28 shrink-0 text-right text-sm">{l.precoUnitario === 0 ? "—" : formatMoney(l.quantidade * l.precoUnitario)}</p>
                <button type="button" onClick={() => setEditando(l.id)} aria-label={`Editar ${l.descricao}`} title="Editar" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]">
                  <Pencil aria-hidden className="size-4" />
                </button>
                <button type="button" disabled={pendente} onClick={() => rodar(() => removerLinha(l.id))} aria-label={`Tirar ${l.descricao}`} title="Tirar" className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]">
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </li>
            ),
          )}
        </ul>
      )}

      {nova ? (
        <div className="card mt-3 p-3">
          <LinhaForm inicial={nova} convidados={convidados} rotulo="Pôr no orçamento" salvar={(v) => adicionarLinha(eventoId, v, v.porConvidado)} fechar={() => setNova(null)} />
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button type="button" className="btn-ghost gap-1.5" onClick={() => setNova(VAZIA)}>
            <Plus aria-hidden className="size-4" />
            Item
          </button>
          {MODELOS.map((m) => (
            <button key={m.texto} type="button" className="chip px-2.5 py-1 text-xs" onClick={() => setNova({ ...VAZIA, ...m.linha })}>
              + {m.texto}
            </button>
          ))}
        </div>
      )}

      {cardapios.length > 0 && (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            rodar(() => aplicarCardapio(eventoId, Number(cardapioId)), () => setCardapioId(""));
          }}
          className="mt-4 flex flex-wrap items-end gap-2"
        >
          <label className="min-w-0 flex-1">
            <span className="label">{cardapioAtual ? `Trocar o cardápio (hoje: ${cardapioAtual.nome})` : "Aplicar cardápio"}</span>
            <select value={cardapioId} onChange={(ev) => setCardapioId(ev.target.value)} className="field">
              <option value="">Escolha…</option>
              {cardapios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · custo {formatMoney(c.custoPorPessoa)} · {c.precoPorPessoa === null ? "sem preço" : `preço ${formatMoney(c.precoPorPessoa)}`} por pessoa
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" className="h-11" disabled={pendente || cardapioId === ""}>
            {cardapioAtual ? "Trocar" : "Aplicar"}
          </Button>
        </form>
      )}
      <p className="hint">
        O cardápio entra com os números de hoje. Mudar uma ficha depois não muda este orçamento; aplique de novo para atualizar.
      </p>

      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}
    </section>
  );
}

function LinhaForm({
  inicial,
  convidados,
  rotulo,
  salvar,
  fechar,
}: {
  inicial: NoForm;
  convidados: number;
  rotulo: string;
  salvar: (v: NoForm) => Promise<{ ok: boolean; message?: string }>;
  fechar: () => void;
}) {
  const [v, setV] = useState<NoForm>(inicial);
  const { erro, pendente, rodar } = useAcao();
  const muda = <K extends keyof NoForm>(k: K, valor: NoForm[K]) => setV((a) => ({ ...a, [k]: valor }));

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        rodar(() => salvar(v), fechar);
      }}
      className="space-y-3"
    >
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <select value={v.categoria} onChange={(ev) => muda("categoria", ev.target.value as CategoriaLinha)} aria-label="Categoria" className="field">
          {opcoes(CATEGORIA_LINHA).map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.texto}
            </option>
          ))}
        </select>
        <Input value={v.descricao} onChange={(ev) => muda("descricao", ev.target.value)} placeholder="Descrição" aria-label="Descrição" maxLength={160} autoFocus />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label>
          <span className="label">Quantidade</span>
          <Input
            inputMode="decimal"
            value={v.porConvidado ? String(convidados) : v.quantidade}
            disabled={v.porConvidado}
            onChange={(ev) => muda("quantidade", ev.target.value)}
            className="w-24"
          />
        </label>
        <label>
          <span className="label">Unidade</span>
          <Input value={v.unidade} onChange={(ev) => muda("unidade", ev.target.value)} maxLength={20} className="w-24" />
        </label>
        <label>
          <span className="label">Custo un. (R$)</span>
          <Input inputMode="decimal" value={v.custoUnitario} onChange={(ev) => muda("custoUnitario", ev.target.value)} placeholder="0,00" className="w-28" />
        </label>
        <label>
          <span className="label">Preço un. (R$)</span>
          <Input inputMode="decimal" value={v.precoUnitario} onChange={(ev) => muda("precoUnitario", ev.target.value)} placeholder="0,00" className="w-28" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.porConvidado} onChange={(ev) => muda("porConvidado", ev.target.checked)} className="size-4" />
        Por convidado: a quantidade é o número de convidados e muda junto com ele
      </label>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {rotulo}
        </Button>
        <Button type="button" variant="ghost" onClick={fechar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
