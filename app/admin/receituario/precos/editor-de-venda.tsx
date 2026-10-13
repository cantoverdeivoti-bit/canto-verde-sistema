"use client";

import { ChefHat, Package, ShoppingBag, Tag, X, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Gaveta } from "@/components/gaveta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { restaurarDaLixeira } from "@/lib/actions/lixeira";
import { apagarVenda, ligarVenda, salvarVenda } from "@/lib/actions/receituario";
import { chave, formatMoney, lerNumeroBR } from "@/lib/format";
import { cmvDaVenda, UNIDADES_DE_VENDA } from "@/lib/receituario-regras";
import type { ItemDeVenda, OpcoesDaVenda } from "@/lib/receituario-vendas";
import { useAcao } from "@/lib/use-acao";

type Extra = { insumoId: number | null; subFichaId: number | null; nome: string; unidade: string; quantidade: string };
type Canal = "ENCOMENDA" | "DELIVERY";
type UnidadeVenda = "KG" | "UN" | "POTE";

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const numeroNoCampo = (n: number) => String(n).replace(".", ",");

/**
 * Um item da lista de preços numa gaveta: a receita, como é vendido, o
 * preço e os extras (embalagem, guarnição). O custo e o CMV mudam enquanto
 * se digita, com o preço de hoje de cada coisa. O delivery pode partir de
 * uma encomenda: aí a receita e a quantidade são as dela.
 */
export function EditorDeVenda({
  venda,
  fichaFixa,
  opcoes,
  bases,
  metaFoodCost,
  fechar,
}: {
  venda: ItemDeVenda | null;
  /** Na ficha, a receita já está escolhida. */
  fichaFixa?: number;
  opcoes: OpcoesDaVenda;
  /** As encomendas de onde um delivery pode partir. */
  bases: { id: number; nome: string; fichaId: number; quantidade: number; custo: number | null }[];
  metaFoodCost: number;
  fechar: () => void;
}) {
  const { erro, pendente, rodar } = useAcao();
  const [canal, setCanal] = useState<Canal>((venda?.canal as Canal | undefined) ?? "ENCOMENDA");
  const [fichaId, setFichaId] = useState<number | null>(venda?.fichaId ?? fichaFixa ?? null);
  const [baseId, setBaseId] = useState<number | null>(venda?.baseId ?? null);
  const [nome, setNome] = useState(venda?.nome ?? "");
  const [unidadeVenda, setUnidadeVenda] = useState<UnidadeVenda>((venda?.unidadeVenda as UnidadeVenda | undefined) ?? "KG");
  const [quantidade, setQuantidade] = useState(venda ? numeroNoCampo(venda.quantidade) : "1000");
  const [preco, setPreco] = useState(venda?.precoVenda == null ? "" : numeroNoCampo(venda.precoVenda));
  const [extras, setExtras] = useState<Extra[]>(
    () => venda?.extras.map((e) => ({ insumoId: e.insumoId, subFichaId: e.subFichaId, nome: e.nome, unidade: e.unidade, quantidade: numeroNoCampo(e.quantidade) })) ?? [],
  );
  const [buscaFicha, setBuscaFicha] = useState("");
  const [buscaExtra, setBuscaExtra] = useState("");

  const base = canal === "DELIVERY" && baseId !== null ? bases.find((b) => b.id === baseId) : undefined;
  const fichaDaConta = base ? base.fichaId : fichaId;
  const ficha = opcoes.fichas.find((f) => f.id === fichaDaConta);
  const qtd = base ? base.quantidade : lerNumeroBR(quantidade);

  // O custo de agora, com o preço de hoje (a mesma conta de custosDasVendas).
  const custoDaReceita = ficha?.porUnidade != null && qtd !== null ? qtd * ficha.porUnidade : null;
  let custoDosExtras = 0;
  let extrasSemPreco = 0;
  for (const e of extras) {
    const q = lerNumeroBR(e.quantidade);
    const unit = e.insumoId !== null ? opcoes.insumos.find((i) => i.id === e.insumoId)?.porUnidade : opcoes.fichas.find((f) => f.id === e.subFichaId)?.porUnidade;
    if (q === null || unit == null) extrasSemPreco++;
    else custoDosExtras += q * unit;
  }
  const receita = base ? base.custo : custoDaReceita;
  const custo = receita === null ? null : receita + custoDosExtras;
  const precoNum = preco.trim() === "" ? null : lerNumeroBR(preco);
  const cmv = cmvDaVenda(custo, precoNum);

  const unidadeDaFicha = ficha?.unidade ?? "g";
  const k = chave(buscaFicha);
  const fichasAchadas = k ? opcoes.fichas.filter((f) => chave(`${f.codigo} ${f.nome}`).includes(k)).slice(0, 8) : [];
  const ke = chave(buscaExtra);
  const extrasAchados = ke
    ? [
        ...opcoes.insumos.filter((i) => chave(i.nome).includes(ke)).slice(0, 8).map((i) => ({ tipo: "insumo" as const, id: i.id, nome: i.nome, unidade: i.unidade, embalagem: i.embalagem })),
        ...opcoes.fichas
          .filter((f) => f.preparo && f.id !== fichaDaConta && chave(f.nome).includes(ke))
          .slice(0, 4)
          .map((f) => ({ tipo: "ficha" as const, id: f.id, nome: f.nome, unidade: f.unidade, embalagem: false })),
      ]
    : [];

  function escolherUnidade(u: UnidadeVenda) {
    setUnidadeVenda(u);
    // O kg é 1000 g da receita; nos outros a pessoa diz quanto vai.
    if (u === "KG" && unidadeDaFicha !== "un") setQuantidade("1000");
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    rodar(
      () =>
        salvarVenda(venda?.id ?? null, {
          fichaId: fichaDaConta ?? 0,
          canal,
          nome,
          unidadeVenda,
          quantidade: qtd ?? NaN,
          precoVenda: precoNum,
          baseId: canal === "DELIVERY" ? baseId : null,
          extras: extras.map((x) => ({ insumoId: x.insumoId, subFichaId: x.subFichaId, quantidade: lerNumeroBR(x.quantidade) ?? NaN })),
        }),
      fechar,
      { aviso: venda ? "Item salvo" : "Item na lista de preços" },
    );
  }

  return (
    <Gaveta rotulo={venda ? `Editar ${venda.nome}` : "Novo item de venda"} aoFechar={fechar} className="overflow-y-auto">
      <form onSubmit={salvar} className="space-y-3 p-4">
        <p className="font-semibold">{venda ? venda.nome : "Novo item de venda"}</p>

        <Bloco icone={ShoppingBag} titulo="Onde é vendido">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["ENCOMENDA", "Encomenda"],
                ["DELIVERY", "Delivery"],
              ] as const
            ).map(([valor, texto]) => (
              <button key={valor} type="button" aria-pressed={canal === valor} onClick={() => setCanal(valor)} className="chip px-3 py-1.5 text-sm">
                {texto}
              </button>
            ))}
          </div>
          {canal === "DELIVERY" && bases.length > 0 && (
            <label className="block">
              <span className="label">Parte de uma encomenda</span>
              <select value={baseId ?? ""} onChange={(e) => setBaseId(e.target.value ? Number(e.target.value) : null)} className="field w-full">
                <option value="">Não, é um item próprio</option>
                {bases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </select>
              <span className="hint">Partindo de uma encomenda, o delivery custa o que ela custa mais as embalagens dele.</span>
            </label>
          )}
          <label className="block">
            <span className="label">Nome na lista de preços</span>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} placeholder="Maionese 500 g" required />
          </label>
        </Bloco>

        {!base && (
          <Bloco icone={ChefHat} titulo="Receita">
            {fichaFixa === undefined && (
              <div className="space-y-1">
                {ficha && !buscaFicha ? (
                  <button type="button" onClick={() => setBuscaFicha(" ")} className="flex w-full items-center gap-2 rounded-lg px-1 text-left text-sm font-medium hover:bg-[var(--muted)]">
                    <span className="min-w-0 flex-1 truncate">
                      {ficha.codigo} · {ficha.nome}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--muted-foreground)]">trocar</span>
                  </button>
                ) : (
                  <>
                    <Input value={buscaFicha.trimStart()} onChange={(e) => setBuscaFicha(e.target.value)} placeholder="Buscar a receita" aria-label="Receita" autoFocus={!venda} className="h-10" />
                    {k && (
                      <ul className="max-h-56 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm">
                        {fichasAchadas.length === 0 && <li className="px-3 py-2 text-[var(--muted-foreground)]">Nenhuma receita com esse nome.</li>}
                        {fichasAchadas.map((f) => (
                          <li key={f.id}>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--muted)]"
                              onClick={() => {
                                setFichaId(f.id);
                                setBuscaFicha("");
                                if (!nome.trim()) setNome(f.nome);
                              }}
                            >
                              <span className="min-w-0 flex-1 truncate">{f.nome}</span>
                              <span className="text-xs text-[var(--muted-foreground)]">{f.codigo}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">Vendido por</span>
                <select value={unidadeVenda} onChange={(e) => escolherUnidade(e.target.value as UnidadeVenda)} className="field w-full">
                  {UNIDADES_DE_VENDA.map((u) => (
                    <option key={u.chave} value={u.chave}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Receita em cada um ({unidadeDaFicha})</span>
                <Input inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="500" />
              </label>
            </div>
            <p className="hint">Quanto da receita pronta vai em cada unidade vendida: 1000 g no kg, 500 g no pote.</p>
            {ficha && ficha.porUnidade === null && <p className="msg-warn text-sm">Esta receita ainda não tem peso pronto: sem ele não dá para saber o custo.</p>}
          </Bloco>
        )}

        <Bloco icone={Package} titulo="Embalagem e extras">
          {extras.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum extra. Ponha o pote, a tampa, a sacola.</p>}
          {extras.length > 0 && (
            <ul className="space-y-2">
              {extras.map((x, i) => (
                <li key={`${x.insumoId ?? "f"}-${x.subFichaId ?? "i"}-${i}`} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{x.nome}</span>
                  <Input
                    inputMode="decimal"
                    value={x.quantidade}
                    onChange={(e) => setExtras(extras.map((y, j) => (j === i ? { ...y, quantidade: e.target.value } : y)))}
                    aria-label={`Quantidade de ${x.nome}`}
                    className="h-10 w-20 text-right"
                  />
                  <span className="w-6 text-xs text-[var(--muted-foreground)]">{x.unidade}</span>
                  <button
                    type="button"
                    aria-label={`Tirar ${x.nome}`}
                    onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                    className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                  >
                    <X aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Input value={buscaExtra} onChange={(e) => setBuscaExtra(e.target.value)} placeholder="Buscar embalagem ou guarnição" aria-label="Novo extra" className="h-10" />
          {ke && (
            <ul className="max-h-56 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm">
              {extrasAchados.length === 0 && <li className="px-3 py-2 text-[var(--muted-foreground)]">Nada com esse nome.</li>}
              {extrasAchados.map((a) => (
                <li key={`${a.tipo}${a.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--muted)]"
                    onClick={() => {
                      setExtras([
                        ...extras,
                        { insumoId: a.tipo === "insumo" ? a.id : null, subFichaId: a.tipo === "ficha" ? a.id : null, nome: a.nome, unidade: a.unidade, quantidade: a.unidade === "un" ? "1" : "" },
                      ]);
                      setBuscaExtra("");
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                    <span className="text-xs text-[var(--muted-foreground)]">{a.tipo === "ficha" ? "pré-preparo" : a.embalagem ? "embalagem" : "insumo"}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco icone={Tag} titulo="Preço">
          <label className="block">
            <span className="label">Preço de venda (R$)</span>
            <Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="35,00" className="max-w-40" />
          </label>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-[var(--muted-foreground)]">Custo</dt>
              <dd className="font-semibold tabular-nums">{custo === null ? "—" : formatMoney(custo)}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted-foreground)]">CMV</dt>
              <dd className="font-semibold tabular-nums" style={cmv !== null && cmv > metaFoodCost ? { color: "var(--warn)" } : undefined}>
                {cmv === null ? "—" : pct(cmv)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted-foreground)]">Preço mínimo</dt>
              <dd className="font-semibold tabular-nums">{custo === null || metaFoodCost <= 0 ? "—" : formatMoney(custo / metaFoodCost)}</dd>
            </div>
          </dl>
          <p className="hint">Preço mínimo pela meta de food cost de {pct(metaFoodCost)}.</p>
          {extrasSemPreco > 0 && <p className="msg-warn text-sm">Um extra está sem preço: o custo real é maior.</p>}
        </Bloco>

        {erro && (
          <p role="alert" className="msg-error">
            {erro}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="h-10" disabled={pendente || nome.trim().length < 2 || fichaDaConta === null}>
            Salvar
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={fechar}>
            Cancelar
          </Button>
          {venda && (
            <>
              <Button type="button" variant="ghost" className="h-10" disabled={pendente} onClick={() => rodar(() => ligarVenda(venda.id, !venda.ativo), fechar, { aviso: venda.ativo ? "Item fora da lista" : "Item de volta na lista" })}>
                {venda.ativo ? "Tirar da lista" : "Voltar à lista"}
              </Button>
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
                    () => apagarVenda(venda.id),
                    (r) => {
                      lixeiraId = r.lixeiraId ?? 0;
                      fechar();
                    },
                    { aviso: `${venda.nome} na lixeira`, desfazer: () => restaurarDaLixeira(lixeiraId) },
                  );
                }}
              >
                Apagar
              </Button>
            </>
          )}
        </div>
      </form>
    </Gaveta>
  );
}

/** Um assunto da gaveta: símbolo verde e título, com uma linha em cima. */
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
