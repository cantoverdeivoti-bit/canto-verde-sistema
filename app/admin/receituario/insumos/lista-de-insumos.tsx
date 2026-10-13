"use client";

import { Package, Plus, ShoppingCart, StickyNote, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { Gaveta } from "@/components/gaveta";
import { MaisAoRolar, useEmLotes } from "@/components/mais-ao-rolar";
import { Lista, Vazio } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apagarInsumo, salvarInsumo } from "@/lib/actions/receituario";
import { chave, formatMoney, plural } from "@/lib/format";
import { restaurarDaLixeira } from "@/lib/actions/lixeira";
import { useAcao } from "@/lib/use-acao";

export type InsumoNaTela = {
  id: number;
  codigo: string;
  nome: string;
  categoria: string;
  unidadeUso: string;
  produtoId: number | null;
  produto: string | null;
  unidadeCompra: string;
  precoCompra: number | null;
  qtdPorUnidade: number;
  rendimento: number;
  estimado: boolean;
  embalagem: boolean;
  observacao: string;
  usos: number;
  liquido: number | null;
  origem: "compra" | "digitado" | null;
  em: string | null;
};
type Produto = { id: number; nome: string; unidade: string };

/** O preço que a cozinha entende: R$ por kg, por litro ou por unidade. */
function precoNaUnidade(i: { liquido: number | null; unidadeUso: string }) {
  if (i.liquido === null) return "sem preço";
  if (i.unidadeUso === "un") return `${formatMoney(i.liquido)}/un`;
  return `${formatMoney(i.liquido * 1000)}/${i.unidadeUso === "mL" ? "L" : "kg"}`;
}
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function ListaDeInsumos({
  insumos,
  total,
  produtos,
  busca,
}: {
  insumos: InsumoNaTela[];
  total: number;
  produtos: Produto[];
  /** O formulário de busca, que vem do servidor: fica entre o "Novo insumo" e a lista. */
  busca: ReactNode;
}) {
  const [editando, setEditando] = useState<InsumoNaTela | "novo" | null>(null);
  // Um lote de cada vez (417 insumos de uma vez travavam o celular). A página
  // troca a `key` deste componente quando o filtro muda, e a lista recomeça
  // do topo; salvar um insumo não recolhe o que já estava aberto.
  const { naTela, restam, mais } = useEmLotes(insumos);
  return (
    <>
      {/* Ações, depois a busca, depois a contagem e a lista, como em Produtos. */}
      <CartaoDeBotoes>
        <BotaoQuadrado
          icone={Plus}
          texto="Novo insumo"
          tom="primario"
          ativo={editando === "novo"}
          onClick={() => setEditando(editando === "novo" ? null : "novo")}
        />
      </CartaoDeBotoes>
      {busca}
      <p className="text-sm text-[var(--muted-foreground)]">
        {insumos.length === total ? plural(total, "insumo", "insumos") : `${insumos.length} de ${total} insumos`}
      </p>
      {insumos.length === 0 ? (
        <Vazio>Nenhum insumo com esses filtros.</Vazio>
      ) : (
        <Lista>
          {naTela.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => setEditando(i)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-[var(--muted)]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{i.nome}</span>
                  <span className="block truncate text-xs text-[var(--muted-foreground)]">
                    {i.codigo}
                    {i.categoria && ` · ${i.categoria}`}
                    {` · ${plural(i.usos, "ficha", "fichas")}`}
                    {i.produto ? ` · Compras: ${i.produto}` : " · sem produto de Compras"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm tabular-nums" style={i.origem === null ? { color: "var(--warn)" } : undefined}>
                    {precoNaUnidade(i)}
                  </span>
                  <span className="block text-[10px] text-[var(--muted-foreground)]">
                    {i.origem === "compra" ? `compra de ${ddmm(i.em!)}` : i.origem === "digitado" ? (i.estimado ? "digitado · estimado" : "digitado") : ""}
                    {i.rendimento < 1 && ` · rende ${Math.round(i.rendimento * 100)}%`}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </Lista>
      )}
      {restam > 0 && <MaisAoRolar restam={restam} aoChegar={mais} />}
      {editando && <EditarInsumo insumo={editando === "novo" ? null : editando} produtos={produtos} fechar={() => setEditando(null)} />}
    </>
  );
}

function EditarInsumo({ insumo, produtos, fechar }: { insumo: InsumoNaTela | null; produtos: Produto[]; fechar: () => void }) {
  const { erro, pendente, rodar } = useAcao();
  const [v, setV] = useState({
    codigo: insumo?.codigo ?? "",
    nome: insumo?.nome ?? "",
    categoria: insumo?.categoria ?? "",
    unidadeUso: (insumo?.unidadeUso ?? "g") as "g" | "mL" | "un",
    produtoId: insumo?.produtoId ?? null,
    unidadeCompra: insumo?.unidadeCompra ?? "kg",
    precoCompra: insumo?.precoCompra === null || insumo?.precoCompra === undefined ? "" : String(insumo.precoCompra).replace(".", ","),
    qtdPorUnidade: String(insumo?.qtdPorUnidade ?? 1000).replace(".", ","),
    rendimento: String(Math.round((insumo?.rendimento ?? 1) * 100)),
    estimado: insumo?.estimado ?? false,
    embalagem: insumo?.embalagem ?? false,
    observacao: insumo?.observacao ?? "",
  });
  const [buscaProduto, setBuscaProduto] = useState("");
  const produtoAtual = produtos.find((p) => p.id === v.produtoId) ?? null;
  const achados = buscaProduto ? produtos.filter((p) => chave(p.nome).includes(chave(buscaProduto))).slice(0, 8) : [];
  const n = (s: string) => Number(s.replace(",", "."));

  return (
    <Gaveta rotulo={insumo ? `Editar ${insumo.nome}` : "Novo insumo"} aoFechar={fechar} className="overflow-y-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          rodar(
            () =>
              salvarInsumo(insumo?.id ?? null, {
                ...v,
                precoCompra: v.precoCompra.trim() === "" ? null : n(v.precoCompra),
                qtdPorUnidade: n(v.qtdPorUnidade),
                rendimento: n(v.rendimento) / 100,
              }),
            fechar,
          );
        }}
        className="space-y-3 p-4"
      >
        <p className="font-semibold">{insumo ? insumo.nome : "Novo insumo"}</p>
        <Bloco icone={Package} titulo="O insumo">
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <label className="block">
              <span className="label">Nome</span>
              <Input value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} maxLength={120} required />
            </label>
            <label className="block">
              <span className="label">Código</span>
              <Input value={v.codigo} onChange={(e) => setV({ ...v, codigo: e.target.value })} maxLength={20} placeholder="automático" />
            </label>
          </div>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <label className="block">
              <span className="label">Categoria</span>
              <Input value={v.categoria} onChange={(e) => setV({ ...v, categoria: e.target.value })} maxLength={60} placeholder="Vegetais" />
            </label>
            <label className="block">
              <span className="label">Usa em</span>
              <select value={v.unidadeUso} onChange={(e) => setV({ ...v, unidadeUso: e.target.value as "g" | "mL" | "un" })} className="field w-full">
                <option value="g">g</option>
                <option value="mL">mL</option>
                <option value="un">un</option>
              </select>
            </label>
          </div>
        </Bloco>

        <Bloco icone={ShoppingCart} titulo="Preço">
          <fieldset className="space-y-1">
            <legend className="label">Produto em Compras</legend>
            {produtoAtual ? (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {produtoAtual.nome} <span className="text-xs text-[var(--muted-foreground)]">({produtoAtual.unidade})</span>
                </span>
                <button type="button" className="text-xs text-[var(--muted-foreground)] underline" onClick={() => setV({ ...v, produtoId: null })}>
                  desligar
                </button>
              </div>
            ) : (
              <>
                <Input value={buscaProduto} onChange={(e) => setBuscaProduto(e.target.value)} placeholder="Buscar produto de Compras" aria-label="Buscar produto de Compras" />
                {achados.length > 0 && (
                  <ul className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] text-sm">
                    {achados.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-1.5 text-left hover:bg-[var(--muted)]"
                          onClick={() => {
                            setV({ ...v, produtoId: p.id });
                            setBuscaProduto("");
                          }}
                        >
                          {p.nome} <span className="text-xs text-[var(--muted-foreground)]">({p.unidade})</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <p className="hint mt-1">
              O preço vem da última compra dele. Produto em caixa ou pacote não dá o preço por grama: aí vale o preço
              digitado abaixo.
            </p>
          </fieldset>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="label">Preço (R$)</span>
              <Input inputMode="decimal" value={v.precoCompra} onChange={(e) => setV({ ...v, precoCompra: e.target.value })} placeholder="4,67" />
            </label>
            <label className="block">
              <span className="label">Por</span>
              <Input value={v.unidadeCompra} onChange={(e) => setV({ ...v, unidadeCompra: e.target.value })} maxLength={20} placeholder="kg" />
            </label>
            <label className="block">
              <span className="label">Que tem ({v.unidadeUso})</span>
              <Input inputMode="decimal" value={v.qtdPorUnidade} onChange={(e) => setV({ ...v, qtdPorUnidade: e.target.value })} placeholder="1000" />
            </label>
          </div>
          <div className="grid grid-cols-2 items-end gap-2">
            <label className="block">
              <span className="label">Rendimento (%)</span>
              <Input inputMode="numeric" value={v.rendimento} onChange={(e) => setV({ ...v, rendimento: e.target.value })} placeholder="100" />
            </label>
            <label className="flex h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={v.estimado} onChange={(e) => setV({ ...v, estimado: e.target.checked })} className="size-5 accent-[var(--primary)]" />
              Preço estimado
            </label>
          </div>
          <p className="hint -mt-1">Rendimento: quanto sobra útil depois de limpar. Abacaxi com casca rende 50%.</p>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={v.embalagem} onChange={(e) => setV({ ...v, embalagem: e.target.checked })} className="size-5 accent-[var(--primary)]" />
            É embalagem (pote, tampa, caixa, sacola)
          </label>
          <p className="hint -mt-1">A embalagem entra só no custo da encomenda e do delivery.</p>
        </Bloco>

        <Bloco icone={StickyNote} titulo="Observação">
          <Textarea
            aria-label="Observação"
            value={v.observacao}
            onChange={(e) => setV({ ...v, observacao: e.target.value })}
            rows={3}
            maxLength={2000}
          />
        </Bloco>

        {erro && (
          <p role="alert" className="msg-error">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-10" disabled={pendente || v.nome.trim().length < 2}>
            Salvar
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={fechar}>
            Cancelar
          </Button>
          {insumo && insumo.usos === 0 && (
            <Button
              type="button"
              variant="ghost"
              className="ml-auto h-10"
              style={{ color: "var(--destructive)" }}
              disabled={pendente}
              onClick={() => {
                // Vai para a lixeira, sem pergunta: o Desfazer da faixa traz de volta.
                let lixeiraId = 0;
                rodar(
                  () => apagarInsumo(insumo.id),
                  (r) => {
                    lixeiraId = r.lixeiraId ?? 0;
                    fechar();
                  },
                  { aviso: `${insumo.nome} na lixeira`, desfazer: () => restaurarDaLixeira(lixeiraId) },
                );
              }}
            >
              Apagar
            </Button>
          )}
        </div>
      </form>
    </Gaveta>
  );
}

/**
 * Um assunto da gaveta: símbolo verde e título, com uma linha em cima. Sem
 * cartão em volta, porque a gaveta já é branca.
 */
function Bloco({ icone: Icone, titulo, children }: { icone: LucideIcon; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-[var(--border)] pt-3">
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <Icone aria-hidden className="size-4 text-[var(--primary)]" />
        {titulo}
      </h3>
      {children}
    </section>
  );
}
