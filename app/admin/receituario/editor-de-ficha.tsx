"use client";

import { ArrowDown, ArrowUp, Carrot, ChefHat, ClipboardList, Flame, ListOrdered, Plus, Scale, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { BotaoQuadrado, FileiraDeBotoes } from "@/components/botao-quadrado";
import { CartaoDeSecao } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { salvarFicha, type FichaInput } from "@/lib/actions/receituario";
import { chave, lerNumeroBR } from "@/lib/format";
import { ALERGENICOS_COMUNS, CATEGORIAS, OPERACOES, type Unidade } from "@/lib/receituario-regras";

export type OpcaoDeInsumo = { id: number; nome: string; unidadeUso: string };
export type OpcaoDeFicha = { id: number; codigo: string; nome: string; unidadeRendimento: string; preparo: boolean };

type Linha = {
  chave: number;
  insumoId: number | null;
  subFichaId: number | null;
  nomeLivre: string | null;
  rotulo: string;
  quantidade: string;
  unidade: Unidade | "";
  preparo: string;
  /** Da receita importada: o que se parece com o nome que a IA escreveu, para escolher num toque. */
  sugestoes?: { insumoId: number | null; subFichaId: number | null; nome: string; unidade: Unidade }[];
};

export type ValorInicial = Omit<FichaInput, "ingredientes" | "rendimentoTotal" | "custoManualPorcao" | "porcoes"> & {
  porcoes: string;
  rendimentoTotal: string;
  custoManualPorcao: string;
  ingredientes: Omit<Linha, "chave">[];
};

// "1.234,5" e "2,1" no jeito daqui; sem vírgula, o ponto é decimal ("2.1").
const num = (s: string) => lerNumeroBR(s);
// Quantidade: aceita "1,5" e "1.5" (aqui o ponto é decimal, não milhar).
const qtd = (s: string) => {
  const n = Number(s.replace(",", "."));
  return s.trim() === "" || Number.isNaN(n) ? NaN : n;
};

/**
 * A ficha inteira num formulário: identificação, rendimento, ingredientes
 * (insumo, pré-preparo ou nome livre), modo de preparo e a parte
 * operacional. Salva tudo de uma vez.
 */
export function EditorDeFicha({
  id,
  inicial,
  insumos,
  fichas,
  etiquetas,
}: {
  id: number | null;
  inicial: ValorInicial;
  insumos: OpcaoDeInsumo[];
  fichas: OpcaoDeFicha[];
  /** A lista das configurações; a etiqueta que a ficha tem e saiu da lista continua aparecendo. */
  etiquetas: string[];
}) {
  const router = useRouter();
  const [v, setV] = useState(inicial);
  const [linhas, setLinhas] = useState<Linha[]>(() => inicial.ingredientes.map((l, i) => ({ ...l, chave: i })));
  const [contador, setContador] = useState(inicial.ingredientes.length);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const campo = <K extends keyof ValorInicial>(k: K, valor: ValorInicial[K]) => setV((a) => ({ ...a, [k]: valor }));

  function novaLinha() {
    setLinhas((ls) => [...ls, { chave: contador, insumoId: null, subFichaId: null, nomeLivre: null, rotulo: "", quantidade: "", unidade: "g", preparo: "" }]);
    setContador((c) => c + 1);
  }
  const mudarLinha = (k: number, m: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === k ? { ...l, ...m } : l)));
  const mover = (i: number, d: -1 | 1) =>
    setLinhas((ls) => {
      const j = i + d;
      if (j < 0 || j >= ls.length) return ls;
      const n = [...ls];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const faltando = linhas.find((l) => !l.insumoId && !l.subFichaId && !l.nomeLivre);
    if (faltando) return setErro("Escolha o ingrediente de cada linha (ou apague a linha vazia).");
    const dados: FichaInput = {
      ...v,
      porcoes: Number(v.porcoes) || 1,
      rendimentoTotal: num(v.rendimentoTotal),
      custoManualPorcao: num(v.custoManualPorcao),
      passos: v.passos,
      ingredientes: linhas.map((l) => ({
        insumoId: l.insumoId,
        subFichaId: l.subFichaId,
        nomeLivre: l.nomeLivre ?? "",
        quantidade: qtd(l.quantidade),
        unidade: l.unidade === "" ? null : l.unidade,
        preparo: l.preparo,
      })),
    };
    startTransition(async () => {
      const r = await salvarFicha(id, dados);
      if (!r.ok) return setErro(r.message);
      router.push(`/admin/receituario/${r.codigo}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      <CartaoDeSecao icone={ChefHat} titulo="Identificação" frase="Nome, categoria e onde a receita é usada.">
        <Campo rotulo="Nome da receita">
          <Input value={v.nome} onChange={(e) => campo("nome", e.target.value)} maxLength={120} required />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Código">
            <Input value={v.codigo ?? ""} onChange={(e) => campo("codigo", e.target.value)} maxLength={20} placeholder="automático" />
          </Campo>
          <Campo rotulo="Categoria">
            <select value={v.categoria} onChange={(e) => campo("categoria", e.target.value)} className="field w-full">
              {CATEGORIAS.map((c) => (
                <option key={c.nome} value={c.nome}>
                  {c.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        {/* Duas opções: chips, como pede o padrão das telas. */}
        <fieldset>
          <legend className="label">Tipo de ficha</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["PRONTA", "Receita pronta"],
                ["PRE_PREPARO", "Pré-preparo"],
              ] as const
            ).map(([valor, nome]) => (
              <button key={valor} type="button" aria-pressed={v.tipo === valor} onClick={() => campo("tipo", valor)} className="chip px-3 py-1.5 text-sm">
                {nome}
              </button>
            ))}
          </div>
          <span className="hint">O pré-preparo entra como ingrediente em outras fichas.</span>
        </fieldset>
        <fieldset>
          <legend className="label">Onde é usada</legend>
          <div className="flex flex-wrap gap-2">
            {OPERACOES.map((o) => {
              const marcada = v.operacoes.includes(o.chave);
              return (
                <button
                  key={o.chave}
                  type="button"
                  aria-pressed={marcada}
                  onClick={() => campo("operacoes", marcada ? v.operacoes.filter((x) => x !== o.chave) : [...v.operacoes, o.chave])}
                  className="chip px-3 py-1.5 text-sm"
                >
                  {o.nome}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">Etiquetas</legend>
          <div className="flex flex-wrap gap-2">
            {[...etiquetas, ...v.etiquetas.filter((e) => !etiquetas.includes(e))].map((e) => {
              const marcada = v.etiquetas.includes(e);
              return (
                <button
                  key={e}
                  type="button"
                  aria-pressed={marcada}
                  onClick={() => campo("etiquetas", marcada ? v.etiquetas.filter((x) => x !== e) : [...v.etiquetas, e])}
                  className="chip px-3 py-1.5 text-sm"
                >
                  {e}
                </button>
              );
            })}
          </div>
        </fieldset>
      </CartaoDeSecao>

      <CartaoDeSecao icone={Scale} titulo="Rendimento" frase="Quanto rende e quanto tempo dura.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo rotulo="Porções">
            <Input inputMode="numeric" value={v.porcoes} onChange={(e) => campo("porcoes", e.target.value)} />
          </Campo>
          <Campo rotulo="Peso pronto">
            <Input inputMode="decimal" value={v.rendimentoTotal} onChange={(e) => campo("rendimentoTotal", e.target.value)} placeholder="1200" />
          </Campo>
          <Campo rotulo="Unidade">
            <select value={v.unidadeRendimento} onChange={(e) => campo("unidadeRendimento", e.target.value as Unidade)} className="field w-full">
              <option value="g">g</option>
              <option value="mL">mL</option>
              <option value="un">un</option>
            </select>
          </Campo>
          <Campo rotulo="Tempo de preparo">
            <Input value={v.tempoPreparo ?? ""} onChange={(e) => campo("tempoPreparo", e.target.value)} maxLength={40} placeholder="40 min" />
          </Campo>
        </div>
        <Campo rotulo="Validade e armazenamento">
          <Input value={v.armazenamento ?? ""} onChange={(e) => campo("armazenamento", e.target.value)} maxLength={1000} placeholder="2 dias a 4 °C; não recongelar" />
        </Campo>
      </CartaoDeSecao>

      <CartaoDeSecao icone={Carrot} titulo="Ingredientes" frase="Insumo, pré-preparo ou nome livre, na ordem de uso.">
        {linhas.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum ingrediente ainda.</p>}
        {linhas.length > 0 && (
          <ul className="space-y-2">
            {linhas.map((l, i) => (
              <li key={l.chave} className="rounded-lg border border-[var(--border)] p-2">
                <div className="flex items-start gap-1">
                  <div className="min-w-0 flex-1 space-y-2">
                    <EscolherIngrediente linha={l} insumos={insumos} fichas={fichas} escolher={(m) => mudarLinha(l.chave, m)} />
                    {/* No celular, o preparo desce para a linha de baixo, inteiro. */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-[6rem_5rem_1fr]">
                      <label className="block min-w-0">
                        <span className="mb-1 block text-xs font-medium">Quantidade</span>
                        <Input inputMode="decimal" value={l.quantidade} onChange={(e) => mudarLinha(l.chave, { quantidade: e.target.value })} className="h-10" />
                      </label>
                      <label className="block min-w-0">
                        <span className="mb-1 block text-xs font-medium">Unidade</span>
                        <select value={l.unidade} onChange={(e) => mudarLinha(l.chave, { unidade: e.target.value as Unidade | "" })} className="field h-10 w-full">
                          <option value="g">g</option>
                          <option value="mL">mL</option>
                          <option value="un">un</option>
                          <option value="">—</option>
                        </select>
                      </label>
                      <label className="col-span-2 block min-w-0 sm:col-span-1">
                        <span className="mb-1 block text-xs font-medium">Preparo</span>
                        <Input value={l.preparo} onChange={(e) => mudarLinha(l.chave, { preparo: e.target.value })} maxLength={160} placeholder="ex.: picado" className="h-10" />
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <BotaoIcone rotulo="Subir" onClick={() => mover(i, -1)} desligado={i === 0}>
                      <ArrowUp aria-hidden className="size-4" />
                    </BotaoIcone>
                    <BotaoIcone rotulo="Descer" onClick={() => mover(i, 1)} desligado={i === linhas.length - 1}>
                      <ArrowDown aria-hidden className="size-4" />
                    </BotaoIcone>
                    <BotaoIcone rotulo="Tirar" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}>
                      <X aria-hidden className="size-4" />
                    </BotaoIcone>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {linhas.length === 0 && (
          <Campo rotulo="Custo por porção (sem ingredientes lançados)">
            <Input inputMode="decimal" value={v.custoManualPorcao} onChange={(e) => campo("custoManualPorcao", e.target.value)} placeholder="R$" className="max-w-40" />
          </Campo>
        )}
        <div className="border-t border-[var(--border)] pt-1">
          <FileiraDeBotoes>
            <BotaoQuadrado icone={Plus} texto="Ingrediente" tom="primario" onClick={novaLinha} />
          </FileiraDeBotoes>
        </div>
      </CartaoDeSecao>

      <CartaoDeSecao icone={ListOrdered} titulo="Modo de preparo" frase="Um passo por campo, na ordem.">
        {v.passos.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">Nenhum passo ainda.</p>}
        {v.passos.length > 0 && (
          <ol className="space-y-2">
            {/* A caixa do passo cresce com o texto (field-sizing): o passo
                inteiro à vista, sem rolar dentro dela. */}
            {v.passos.map((p, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="num-display mt-2.5 w-5 shrink-0 text-right text-sm text-[var(--muted-foreground)]">{i + 1}</span>
                <Textarea value={p} onChange={(e) => campo("passos", v.passos.map((x, j) => (j === i ? e.target.value : x)))} rows={2} maxLength={800} aria-label={`Passo ${i + 1}`} className="field-sizing-content min-h-16 min-w-0 flex-1 leading-relaxed" />
                <div className="flex flex-col">
                  <BotaoIcone rotulo="Subir" desligado={i === 0} onClick={() => campo("passos", troca(v.passos, i, -1))}>
                    <ArrowUp aria-hidden className="size-4" />
                  </BotaoIcone>
                  <BotaoIcone rotulo="Descer" desligado={i === v.passos.length - 1} onClick={() => campo("passos", troca(v.passos, i, 1))}>
                    <ArrowDown aria-hidden className="size-4" />
                  </BotaoIcone>
                  <BotaoIcone rotulo="Tirar" onClick={() => campo("passos", v.passos.filter((_, j) => j !== i))}>
                    <X aria-hidden className="size-4" />
                  </BotaoIcone>
                </div>
              </li>
            ))}
          </ol>
        )}
        <div className="border-t border-[var(--border)] pt-1">
          <FileiraDeBotoes>
            <BotaoQuadrado icone={Plus} texto="Passo" tom="primario" onClick={() => campo("passos", [...v.passos, ""])} />
          </FileiraDeBotoes>
        </div>
      </CartaoDeSecao>

      <CartaoDeSecao icone={Flame} titulo="Forno combinado" frase="Como regular o forno para esta receita.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Campo rotulo="Viabilidade">
            <Input value={v.viabilidade ?? ""} onChange={(e) => campo("viabilidade", e.target.value)} maxLength={40} placeholder="Forno, integral" />
          </Campo>
          <Campo rotulo="Modo">
            <Input value={v.modoForno ?? ""} onChange={(e) => campo("modoForno", e.target.value)} maxLength={60} placeholder="Combinado" />
          </Campo>
          <Campo rotulo="Temperatura">
            <Input value={v.temperatura ?? ""} onChange={(e) => campo("temperatura", e.target.value)} maxLength={30} placeholder="170 °C" />
          </Campo>
          <Campo rotulo="Umidade">
            <Input value={v.umidade ?? ""} onChange={(e) => campo("umidade", e.target.value)} maxLength={30} placeholder="30%" />
          </Campo>
          <Campo rotulo="Tempo">
            <Input value={v.tempoForno ?? ""} onChange={(e) => campo("tempoForno", e.target.value)} maxLength={40} placeholder="25-30 min" />
          </Campo>
          <Campo rotulo="Sonda">
            <Input value={v.sonda ?? ""} onChange={(e) => campo("sonda", e.target.value)} maxLength={20} placeholder="72 °C" />
          </Campo>
        </div>
        <Campo rotulo="Ajuste e orientação do forno">
          <Textarea value={v.ajusteForno ?? ""} onChange={(e) => campo("ajusteForno", e.target.value)} rows={2} maxLength={1000} className="field-sizing-content min-h-16" />
        </Campo>
      </CartaoDeSecao>

      <CartaoDeSecao icone={ClipboardList} titulo="Execução" frase="Utensílios, controle, montagem e alergênicos.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Utensílios e equipamentos">
            <Textarea value={v.utensilios ?? ""} onChange={(e) => campo("utensilios", e.target.value)} rows={2} maxLength={1000} placeholder="GN 65 mm, panela de 20 L" />
          </Campo>
          <Campo rotulo="Ponto de controle">
            <Textarea value={v.pontoDeControle ?? ""} onChange={(e) => campo("pontoDeControle", e.target.value)} rows={2} maxLength={1000} placeholder="Cocção até 74 °C no centro; manter acima de 65 °C" />
          </Campo>
          <Campo rotulo="Montagem e porcionamento">
            <Textarea value={v.montagem ?? ""} onChange={(e) => campo("montagem", e.target.value)} rows={2} maxLength={1000} placeholder="Cuba GN 1/1, porção de 120 g" />
          </Campo>
          <Alergenicos valor={v.alergenicos} mudar={(a) => campo("alergenicos", a)} />
        </div>
        <Campo rotulo="Observações e dicas de execução">
          <Textarea value={v.observacoes ?? ""} onChange={(e) => campo("observacoes", e.target.value)} rows={3} maxLength={4000} />
        </Campo>
      </CartaoDeSecao>

      {/* Presa embaixo, acima da barra do celular: a ficha é longa, e o
          Salvar não pode ficar só no fim dela. */}
      <div className="sticky bottom-[calc(var(--barra-de-baixo)+0.75rem)] z-10 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-lg">
        {erro && (
          <p role="alert" className="msg-error">
            {erro}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="submit" className="h-11 px-6" disabled={pendente || v.nome.trim().length < 2}>
            {pendente ? "Salvando…" : "Salvar ficha"}
          </Button>
          <Button type="button" variant="ghost" className="h-11" onClick={() => router.back()}>
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  );
}

function troca<T>(xs: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= xs.length) return xs;
  const n = [...xs];
  [n[i], n[j]] = [n[j], n[i]];
  return n;
}

/** O rótulo em cima do campo e, se houver, a dica embaixo. */
function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="label">{rotulo}</span>
      {children}
      {dica && <span className="hint">{dica}</span>}
    </label>
  );
}

function BotaoIcone({ rotulo, onClick, desligado = false, children }: { rotulo: string; onClick: () => void; desligado?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      disabled={desligado}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Os comuns num toque; outro se digita e entra com Enter. */
function Alergenicos({ valor, mudar }: { valor: string[]; mudar: (a: string[]) => void }) {
  const [outro, setOutro] = useState("");
  const extras = valor.filter((a) => !ALERGENICOS_COMUNS.includes(a));
  const alternar = (a: string) => mudar(valor.includes(a) ? valor.filter((x) => x !== a) : [...valor, a]);
  return (
    <fieldset className="sm:col-span-2">
      <legend className="label">Alergênicos</legend>
      <div className="flex flex-wrap gap-2">
        {[...ALERGENICOS_COMUNS, ...extras].map((a) => (
          <button key={a} type="button" aria-pressed={valor.includes(a)} onClick={() => alternar(a)} className="chip px-3 py-1.5 text-sm">
            {a}
          </button>
        ))}
        <Input
          value={outro}
          onChange={(e) => setOutro(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            const a = outro.trim().toLowerCase();
            if (a && !valor.includes(a)) mudar([...valor, a]);
            setOutro("");
          }}
          placeholder="outro + Enter"
          aria-label="Outro alergênico"
          maxLength={30}
          className="h-9 w-36 py-1 text-sm"
        />
      </div>
    </fieldset>
  );
}

/**
 * Escolher o ingrediente digitando: aparecem os insumos e as fichas que
 * batem (pré-preparos primeiro); o que não achar pode entrar como nome
 * livre, sem preço (a água).
 */
function EscolherIngrediente({
  linha,
  insumos,
  fichas,
  escolher,
}: {
  linha: Linha;
  insumos: OpcaoDeInsumo[];
  fichas: OpcaoDeFicha[];
  escolher: (m: Partial<Linha>) => void;
}) {
  // Linha já escolhida mostra o nome; a importada sem par abre na busca, com o nome da IA.
  const escolhida = linha.insumoId !== null || linha.subFichaId !== null || linha.nomeLivre !== null;
  const [busca, setBusca] = useState<string | null>(escolhida ? null : linha.rotulo);
  if (busca === null) {
    return (
      <button type="button" onClick={() => setBusca("")} className="flex w-full items-center gap-2 rounded-lg px-1 text-left text-sm font-medium hover:bg-[var(--muted)]">
        <span className="min-w-0 flex-1 truncate">{linha.rotulo}</span>
        <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{linha.subFichaId ? "pré-preparo" : linha.nomeLivre ? "sem preço" : "insumo"} · trocar</span>
      </button>
    );
  }
  const k = chave(busca);
  const achados = k
    ? [
        ...fichas
          .filter((f) => chave(`${f.codigo} ${f.nome}`).includes(k))
          .sort((a, b) => Number(b.preparo) - Number(a.preparo))
          .slice(0, 6)
          .map((f) => ({ tipo: "ficha" as const, f })),
        ...insumos
          .filter((i) => chave(i.nome).includes(k))
          .slice(0, 8)
          .map((i) => ({ tipo: "insumo" as const, i })),
      ]
    : [];
  const sugestoes = !escolhida ? (linha.sugestoes ?? []) : [];
  return (
    <div className="space-y-1">
      {!escolhida && linha.rotulo && (
        <p className="text-xs" style={{ color: "var(--warn)" }}>
          A IA escreveu &quot;{linha.rotulo}&quot;: escolha o insumo da casa.
        </p>
      )}
      {sugestoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sugestoes.map((g) => (
            <button
              key={`${g.insumoId ?? "f"}-${g.subFichaId ?? "i"}`}
              type="button"
              className="chip px-2.5 py-1 text-xs"
              onClick={() => {
                escolher({ insumoId: g.insumoId, subFichaId: g.subFichaId, nomeLivre: null, rotulo: g.nome, unidade: g.unidade, sugestoes: [] });
                setBusca(null);
              }}
            >
              {g.nome}
            </button>
          ))}
        </div>
      )}
      <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar insumo ou pré-preparo" aria-label="Ingrediente" autoFocus={escolhida || !linha.rotulo} className="h-10" />
      {k && (
        <ul className="max-h-60 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm">
          {achados.map((a) =>
            a.tipo === "insumo" ? (
              <li key={`i${a.i.id}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--muted)]"
                  onClick={() => {
                    escolher({ insumoId: a.i.id, subFichaId: null, nomeLivre: null, rotulo: a.i.nome, unidade: (a.i.unidadeUso as Unidade) ?? "g" });
                    setBusca(null);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{a.i.nome}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">insumo · {a.i.unidadeUso}</span>
                </button>
              </li>
            ) : (
              <li key={`f${a.f.id}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--muted)]"
                  onClick={() => {
                    escolher({ insumoId: null, subFichaId: a.f.id, nomeLivre: null, rotulo: a.f.nome, unidade: (a.f.unidadeRendimento as Unidade) ?? "g" });
                    setBusca(null);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{a.f.nome}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {a.f.preparo ? "pré-preparo" : "ficha"} {a.f.codigo}
                  </span>
                </button>
              </li>
            ),
          )}
          <li>
            <button
              type="button"
              className="w-full px-3 py-1.5 text-left text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
              onClick={() => {
                escolher({ insumoId: null, subFichaId: null, nomeLivre: busca.trim(), rotulo: busca.trim(), unidade: "" });
                setBusca(null);
              }}
            >
              Usar &quot;{busca.trim()}&quot; sem preço (ex.: água)
            </button>
          </li>
        </ul>
      )}
      {escolhida && linha.rotulo && (
        <button type="button" className="text-xs text-[var(--muted-foreground)] underline" onClick={() => setBusca(null)}>
          Manter {linha.rotulo}
        </button>
      )}
    </div>
  );
}
