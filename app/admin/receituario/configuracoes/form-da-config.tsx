"use client";

import { Calculator, Palette, RefreshCw, Sparkles, Tags, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CartaoDeSecao } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { atualizarCustosDoBuffet, salvarConfigDoReceituario, salvarCoresDasCategorias, salvarEtiquetas } from "@/lib/actions/receituario";
import { plural } from "@/lib/format";
import { CATEGORIAS, PALETA } from "@/lib/receituario-regras";
import { useAcao } from "@/lib/use-acao";

export function FormDaConfig({ metaFoodCost, markup }: { metaFoodCost: number; markup: number }) {
  const { erro, pendente, rodar } = useAcao();
  const [meta, setMeta] = useState(String(Math.round(metaFoodCost * 100)));
  const [mk, setMk] = useState(String(markup).replace(".", ","));
  return (
    <CartaoDeSecao icone={Calculator} titulo="Preço sugerido" frase="Muda o preço sugerido de todas as fichas.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          rodar(() => salvarConfigDoReceituario({ metaFoodCost: Number(meta.replace(",", ".")) / 100, markup: Number(mk.replace(",", ".")) }), undefined, { aviso: "Salvo" });
        }}
        className="space-y-4"
      >
        {/* Os dois caminhos lado a lado no computador, cada um com a sua conta embaixo. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Meta de food cost (%)</span>
            <Input inputMode="decimal" value={meta} onChange={(e) => setMeta(e.target.value)} className="max-w-32" />
            <span className="hint block">O preço mínimo é o custo da porção dividido por esta meta. Com 30%, um prato de R$ 6,00 sai a R$ 20,00.</span>
          </label>
          <label className="block">
            <span className="label">Markup</span>
            <Input inputMode="decimal" value={mk} onChange={(e) => setMk(e.target.value)} className="max-w-32" />
            <span className="hint block">O outro caminho: o custo da porção vezes o markup. Mais usado em eventos e delivery.</span>
          </label>
        </div>
        {erro && (
          <p role="alert" className="msg-error">
            {erro}
          </p>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" className="h-11" disabled={pendente}>
            Salvar
          </Button>
        </div>
      </form>
    </CartaoDeSecao>
  );
}

/**
 * As etiquetas que a ficha oferece (Assado, Cozido, Grelhado, Outros). Tirar uma da
 * lista tira também das fichas que a usam, e a tela avisa quantas são.
 */
export function Etiquetas({ inicial, usos }: { inicial: string[]; usos: Record<string, number> }) {
  const { erro, pendente, rodar } = useAcao();
  const [lista, setLista] = useState(inicial);
  const [nova, setNova] = useState("");
  const mudou = lista.join("|") !== inicial.join("|");
  const saem = inicial.filter((e) => !lista.includes(e) && (usos[e] ?? 0) > 0);
  const por = () => {
    const e = nova.trim().replace(/\s+/g, " ");
    if (!e) return;
    const nome = e.charAt(0).toUpperCase() + e.slice(1);
    if (!lista.some((x) => x.toLowerCase() === nome.toLowerCase())) setLista([...lista, nome]);
    setNova("");
  };
  return (
    <CartaoDeSecao icone={Tags} titulo="Etiquetas das fichas" frase="Como a receita é feita. Marcam-se na ficha e filtram a lista.">
      <Link
        href="/admin/receituario/etiquetas"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--primary)] underline-offset-4 hover:underline"
      >
        <Sparkles aria-hidden className="size-4" />
        Sugerir para as fichas sem etiqueta
      </Link>
      <ul className="flex flex-wrap gap-2">
        {lista.map((e) => (
          <li key={e} className="flex h-9 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--card)] pr-1 pl-3 text-sm font-medium">
            {e}
            <span className="text-xs font-normal text-[var(--muted-foreground)]">{usos[e] ?? 0}</span>
            <button
              type="button"
              aria-label={`Tirar ${e}`}
              onClick={() => {
                setLista(lista.filter((x) => x !== e));
              }}
              className="flex size-7 items-center justify-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Input
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            por();
          }}
          maxLength={30}
          placeholder="Frito, Refogado, Cru…"
          aria-label="Nova etiqueta"
          className="min-w-0 flex-1 sm:max-w-60"
        />
        <Button type="button" variant="outline" className="h-11" onClick={por} disabled={!nova.trim()}>
          Pôr
        </Button>
      </div>
      {saem.length > 0 && (
        <p className="msg-warn text-sm">
          Ao salvar, {saem.map((e) => `${e} sai de ${plural(usos[e], "ficha", "fichas")}`).join(" e ")}.
        </p>
      )}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="button" className="h-11" disabled={pendente || !mudou} onClick={() => rodar(() => salvarEtiquetas(lista), undefined, { aviso: "Etiquetas salvas" })}>
          Salvar etiquetas
        </Button>
      </div>
    </CartaoDeSecao>
  );
}

const PADRAO: Record<string, string> = Object.fromEntries(CATEGORIAS.map((c) => [c.nome, c.cor]));

/**
 * A cor da faixa de cada categoria (na lista, na ficha, na impressão), escolhida
 * entre as 10 da paleta. Duas categorias podem ter a mesma cor.
 */
export function CoresDasCategorias({ inicial }: { inicial: Record<string, string> }) {
  const { erro, pendente, rodar } = useAcao();
  const [cores, setCores] = useState(inicial);
  const igual = (a: Record<string, string>, b: Record<string, string>) => CATEGORIAS.every((c) => a[c.nome] === b[c.nome]);
  const mudou = !igual(cores, inicial);
  const hex = (chave: string) => PALETA.find((p) => p.chave === chave)?.hex ?? "#6b7280";
  return (
    <CartaoDeSecao icone={Palette} titulo="Cores das categorias" frase="A faixa colorida da ficha na lista, na tela e na impressão.">
      <ul className="space-y-3">
        {CATEGORIAS.map((c) => (
          <li key={c.nome} className="flex gap-2">
            <span aria-hidden className="w-1 shrink-0 rounded-r" style={{ background: hex(cores[c.nome]) }} />
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm font-medium">{c.nome}</p>
              <div role="radiogroup" aria-label={`Cor de ${c.nome}`} className="flex flex-wrap gap-1.5">
                {PALETA.map((p) => {
                  const marcada = cores[c.nome] === p.chave;
                  return (
                    <button
                      key={p.chave}
                      type="button"
                      role="radio"
                      aria-checked={marcada}
                      aria-label={p.nome}
                      title={p.nome}
                      onClick={() => {
                        setCores({ ...cores, [c.nome]: p.chave });
                      }}
                      className={`size-7 rounded-full ${marcada ? "ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--background)]" : ""}`}
                      style={{ background: p.hex }}
                    />
                  );
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="h-11" disabled={pendente || !mudou} onClick={() => rodar(() => salvarCoresDasCategorias(cores), undefined, { aviso: "Cores salvas" })}>
          Salvar cores
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={pendente || igual(cores, PADRAO)}
          onClick={() => {
            setCores(PADRAO);
          }}
        >
          Voltar ao padrão
        </Button>
      </div>
    </CartaoDeSecao>
  );
}

/**
 * O custo/kg dos pratos do buffet vem das fichas e se atualiza sozinho (ao
 * salvar ficha ou insumo, e toda manhã). O botão é para não esperar.
 */
export function AtualizarBuffet() {
  const { erro, aviso, pendente, rodar } = useAcao();
  return (
    <CartaoDeSecao icone={RefreshCw} titulo="Cardápio buffet" frase="O prato com o código de uma ficha (ex.: 264C) usa o custo por kg dela.">
      <p className="text-sm text-[var(--muted-foreground)]">
        Ele se atualiza sozinho ao salvar uma ficha ou um insumo, e toda manhã com as compras recebidas.
      </p>
      <Button type="button" variant="outline" className="h-11" disabled={pendente} onClick={() => rodar(() => atualizarCustosDoBuffet())}>
        {pendente ? "Atualizando…" : "Atualizar o custo dos pratos agora"}
      </Button>
      {aviso && <p className="text-sm">{aviso}</p>}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </CartaoDeSecao>
  );
}

