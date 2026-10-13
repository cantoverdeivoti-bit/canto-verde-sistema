"use client";

import { Plus, Printer, Search } from "lucide-react";
import { useState, type ReactNode } from "react";

import { BotaoQuadrado, CartaoDeBotoes, FileiraDeBotoes } from "@/components/botao-quadrado";
import { Lista, Vazio } from "@/components/pagina";
import { Input } from "@/components/ui/input";
import { chave, formatMoney, plural } from "@/lib/format";
import { UNIDADES_DE_VENDA } from "@/lib/receituario-regras";
import type { ItemDeVenda, OpcoesDaVenda } from "@/lib/receituario-vendas";
import { pdfDe } from "@/lib/pdf-da-pagina";

import { EditorDeVenda } from "./editor-de-venda";

type Comum = { itens: ItemDeVenda[]; opcoes: OpcoesDaVenda; metaFoodCost: number };

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const porUnidade = (u: string) => UNIDADES_DE_VENDA.find((x) => x.chave === u)?.curto ?? "";
const CANAL: Record<string, string> = { ENCOMENDA: "Encomenda", DELIVERY: "Delivery", ALACARTE: "À la carte" };

/** As encomendas de onde um delivery pode partir: as que não partem de outra. */
function basesDe(itens: ItemDeVenda[]) {
  return itens
    .filter((i) => i.canal === "ENCOMENDA" && i.baseId === null)
    .map((i) => ({ id: i.id, nome: i.nome, fichaId: i.fichaId, quantidade: i.quantidade, custo: i.custo.total }));
}

/**
 * A lista de preços: o que se vende por encomenda e por delivery, com o
 * custo de hoje e o CMV. Tocar num item abre a gaveta de editar.
 */
export function ListaDePrecos({ itens, opcoes, metaFoodCost, total }: Comum & { total: number }) {
  const [editando, setEditando] = useState<ItemDeVenda | "novo" | null>(null);
  const [busca, setBusca] = useState("");
  const [canal, setCanal] = useState<"ENCOMENDA" | "DELIVERY" | null>(null);
  const [acimaDaMeta, setAcimaDaMeta] = useState(false);

  const k = chave(busca);
  const visiveis = itens.filter(
    (i) =>
      (!k || chave(`${i.nome} ${i.ficha.codigo} ${i.ficha.nome}`).includes(k)) &&
      (canal === null || i.canal === canal) &&
      (!acimaDaMeta || (i.cmv !== null && i.cmv > metaFoodCost)),
  );

  return (
    <>
      <CartaoDeBotoes>
        <BotaoQuadrado icone={Plus} texto="Novo item" tom="primario" ativo={editando === "novo"} onClick={() => setEditando(editando === "novo" ? null : "novo")} />
        <BotaoQuadrado icone={Printer} texto="Imprimir" href={pdfDe(`/imprimir/receituario/precos${canal ? `?canal=${canal}` : ""}`)} baixar />
      </CartaoDeBotoes>

      <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-2">
        <div className="relative min-w-0">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <Input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Item ou receita" aria-label="Buscar item" className="h-11 w-full pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["ENCOMENDA", "Encomenda"],
              ["DELIVERY", "Delivery"],
            ] as const
          ).map(([valor, texto]) => (
            <button key={valor} type="button" aria-pressed={canal === valor} onClick={() => setCanal(canal === valor ? null : valor)} className="chip px-3 py-1.5 text-sm">
              {texto}
            </button>
          ))}
          <button type="button" aria-pressed={acimaDaMeta} onClick={() => setAcimaDaMeta(!acimaDaMeta)} className="chip px-3 py-1.5 text-sm">
            CMV acima de {pct(metaFoodCost)}
          </button>
        </div>
      </div>

      <p className="text-sm text-[var(--muted-foreground)]">{visiveis.length === total ? plural(total, "item", "itens") : `${visiveis.length} de ${total} itens`}</p>

      {visiveis.length === 0 ? (
        <Vazio>{total === 0 ? "Nenhum item ainda. Comece pelo que mais sai: a maionese, o frango." : "Nenhum item com esses filtros."}</Vazio>
      ) : (
        <Lista>
          {visiveis.map((i) => (
            <li key={i.id}>
              <LinhaDeVenda item={i} metaFoodCost={metaFoodCost} mostrarReceita aoTocar={() => setEditando(i)} />
            </li>
          ))}
        </Lista>
      )}

      {editando && (
        <EditorDeVenda
          venda={editando === "novo" ? null : editando}
          opcoes={opcoes}
          bases={basesDe(itens).filter((b) => editando === "novo" || b.id !== editando.id)}
          metaFoodCost={metaFoodCost}
          fechar={() => setEditando(null)}
        />
      )}
    </>
  );
}

/**
 * O cartão "Venda" da ficha: os itens da lista de preços que saem desta
 * receita, e o quadrado de pôr mais um.
 */
export function VendasDaFicha({ fichaId, itens, todos, opcoes, metaFoodCost }: Comum & { fichaId: number; todos: ItemDeVenda[] }) {
  const [editando, setEditando] = useState<ItemDeVenda | "novo" | null>(null);
  return (
    <>
      {itens.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Esta receita ainda não está na lista de preços.</p>
      ) : (
        <ul className="-mx-4 -mt-4 divide-y divide-[var(--border)] border-b border-[var(--border)]">
          {itens.map((i) => (
            <li key={i.id}>
              <LinhaDeVenda item={i} metaFoodCost={metaFoodCost} aoTocar={() => setEditando(i)} />
            </li>
          ))}
        </ul>
      )}
      <FileiraDeBotoes>
        <BotaoQuadrado icone={Plus} texto="Vender" tom="primario" ativo={editando === "novo"} onClick={() => setEditando(editando === "novo" ? null : "novo")} />
      </FileiraDeBotoes>
      {editando && (
        <EditorDeVenda
          venda={editando === "novo" ? null : editando}
          fichaFixa={fichaId}
          opcoes={opcoes}
          bases={basesDe(todos).filter((b) => editando === "novo" || b.id !== editando.id)}
          metaFoodCost={metaFoodCost}
          fechar={() => setEditando(null)}
        />
      )}
    </>
  );
}

function LinhaDeVenda({ item: i, metaFoodCost, mostrarReceita = false, aoTocar }: { item: ItemDeVenda; metaFoodCost: number; mostrarReceita?: boolean; aoTocar: () => void }) {
  const acima = i.cmv !== null && i.cmv > metaFoodCost;
  const detalhe: ReactNode[] = [CANAL[i.canal] ?? i.canal];
  if (mostrarReceita) detalhe.push(`${i.ficha.codigo} · ${i.ficha.nome}`);
  if (i.baseNome) detalhe.push(`parte de ${i.baseNome}`);
  if (!i.ativo) detalhe.push("fora da lista");
  return (
    <button type="button" onClick={aoTocar} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--muted)] ${i.ativo ? "" : "opacity-60"}`}>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block text-sm font-medium">{i.nome}</span>
        <span className="block truncate text-xs text-[var(--muted-foreground)]">{detalhe.join(" · ")}</span>
      </span>
      <span className="shrink-0 text-right tabular-nums">
        <span className="block text-sm font-semibold">
          {i.precoVenda === null ? <span className="font-normal text-[var(--muted-foreground)]">sem preço</span> : `${formatMoney(i.precoVenda)}${porUnidade(i.unidadeVenda)}`}
        </span>
        <span className="block text-xs text-[var(--muted-foreground)]">
          custo {i.custo.total === null ? "—" : formatMoney(i.custo.total)}
          {i.cmv !== null && (
            <>
              {" · "}
              <span style={acima ? { color: "var(--warn)", fontWeight: 600 } : undefined}>CMV {pct(i.cmv)}</span>
            </>
          )}
        </span>
      </span>
    </button>
  );
}
