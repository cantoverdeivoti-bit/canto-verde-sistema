"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { abaterCreditoDeBonificacao, resolverBonificacao } from "@/lib/actions/bonificacao";
import { autorizarOfertaNova, recusarOfertaNova } from "@/lib/actions/compras";
import {
  aceitarCorrecao,
  aceitarIdealSugerido,
  alternarCategoriaDoFornecedor,
  definirCodigo,
  definirEstoqueIdeal,
  definirPrazoDoFornecedor,
  marcarCreditoAbatido,
  recusarCorrecao,
  recusarIdealSugerido,
  resolverDivergencia,
} from "@/lib/actions/pendencias";
import { enterProximoValor } from "@/lib/enter-proximo-valor";
import { UNIT_LABEL, formatAmount, formatMoney, precoNoCampo } from "@/lib/format";
import type { BonificacaoQueNaoVeio, IdealSugerido, PendenciasDeCompras } from "@/lib/pendencias";
import type { ProductUnit } from "@/generated/prisma/client";

type Categoria = { id: number; name: string };
const UNIDADES = Object.keys(UNIT_LABEL) as ProductUnit[];

/** Os componentes que decidem e preenchem na tela de Pendências. */

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
      {texto}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Ofertas de fornecedor fora da lista
// ---------------------------------------------------------------------------

export function Ofertas({
  ofertas,
  categorias,
}: {
  ofertas: PendenciasDeCompras["ofertas"];
  categorias: Categoria[];
}) {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {ofertas.map((o) => (
        <Oferta key={o.id} o={o} categorias={categorias} />
      ))}
    </ul>
  );
}

function Oferta({ o, categorias }: { o: PendenciasDeCompras["ofertas"][number]; categorias: Categoria[] }) {
  const [nome, setNome] = useState(o.nome);
  const [unit, setUnit] = useState<ProductUnit>(o.unit);
  const [categoryId, setCategoryId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const rodar = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      setErro(null);
      const r = await fn();
      if (!r.ok) setErro(r.message ?? "Não deu certo.");
    });
  return (
    <li className="space-y-2 px-3 py-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        {o.fornecedor} ofereceu na cotação de {o.cotacaoData}
        {o.precoEmbalagem !== null && ` · ${formatMoney(o.precoEmbalagem)}${o.embalagem ? ` (${o.embalagem})` : ""}`}
        {o.marca && ` · ${o.marca}`}
      </p>
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do produto" className="h-9 px-2 font-semibold" />
        <select value={unit} onChange={(e) => setUnit(e.target.value as ProductUnit)} aria-label="Unidade" className="field h-9 py-0">
          {UNIDADES.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u]}
            </option>
          ))}
        </select>
      </div>
      <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria" className="field h-9 w-full py-0">
        <option value="">Categoria…</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pendente}
          onClick={() =>
            rodar(() => autorizarOfertaNova(o.id, { nome, unit, categoryId: categoryId === "" ? null : Number(categoryId) }))
          }
        >
          Autorizar
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={() => rodar(() => recusarOfertaNova(o.id))}>
          Recusar
        </Button>
      </div>
      <Erro texto={erro} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Correções sugeridas pelo estoquista
// ---------------------------------------------------------------------------

/** O ideal de Requisição que o estoquista sugeriu: aceitar (com o número dele ou outro) ou recusar. */
export function IdeaisSugeridos({ itens }: { itens: IdealSugerido[] }) {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {itens.map((s) => (
        <IdealSugeridoLinha key={s.id} s={s} />
      ))}
    </ul>
  );
}

function IdealSugeridoLinha({ s }: { s: IdealSugerido }) {
  const [valor, setValor] = useState(String(s.idealSugerido).replace(".", ","));
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const un = UNIT_LABEL[s.unidade];
  const rodar = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      setErro(null);
      const r = await fn();
      if (!r.ok) setErro(r.message ?? "Não deu certo.");
    });
  return (
    <li className="space-y-2 px-3 py-3">
      <div>
        <p className="font-semibold leading-snug">{s.produto}</p>
        <p className="text-sm">
          <span className="text-[var(--muted-foreground)]">Compra de rotina {s.requisicao}: </span>
          <span className="line-through opacity-60">{s.idealAtual === null ? "sem ideal" : `${formatAmount(s.idealAtual)} ${un}`}</span>{" "}
          → <strong>{formatAmount(s.idealSugerido)} {un}</strong>
        </p>
        {s.motivo && <p className="text-sm">&ldquo;{s.motivo}&rdquo;</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          aria-label={`Ideal de ${s.produto} em ${s.requisicao}`}
          className="num-display h-8 w-24 text-right"
        />
        <span className="text-sm text-[var(--muted-foreground)]">{un}</span>
        <Button type="button" size="sm" disabled={pendente} onClick={() => rodar(() => aceitarIdealSugerido(s.id, valor))}>
          Aceitar
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={() => rodar(() => recusarIdealSugerido(s.id))}>
          Recusar
        </Button>
      </div>
      <Erro texto={erro} />
    </li>
  );
}

export function Correcoes({
  correcoes,
  categorias,
}: {
  correcoes: PendenciasDeCompras["correcoes"];
  categorias: Categoria[];
}) {
  const nomeDaCategoria = new Map(categorias.map((c) => [c.id, c.name]));
  const cat = (id: number | null) => (id === null ? "sem categoria" : (nomeDaCategoria.get(id) ?? "—"));
  return (
    <ul className="divide-y divide-[var(--border)]">
      {correcoes.map((c) => (
        <Correcao key={c.id} c={c} cat={cat} />
      ))}
    </ul>
  );
}

function Correcao({
  c,
  cat,
}: {
  c: PendenciasDeCompras["correcoes"][number];
  cat: (id: number | null) => string;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const mudancas: { campo: string; de: string; para: string }[] = [];
  if (c.nome !== c.produto.name) mudancas.push({ campo: "Nome", de: c.produto.name, para: c.nome });
  if (c.unit !== c.produto.unit)
    mudancas.push({ campo: "Unidade", de: UNIT_LABEL[c.produto.unit], para: UNIT_LABEL[c.unit] });
  if (c.categoryId !== c.produto.categoryId)
    mudancas.push({ campo: "Categoria", de: cat(c.produto.categoryId), para: cat(c.categoryId) });
  const num = (n: number | null) => (n === null ? "—" : `${formatAmount(n)} ${UNIT_LABEL[c.unit]}`);
  if (c.idealStock !== null && c.idealStock !== c.produto.idealStock)
    mudancas.push({ campo: "Estoque ideal", de: num(c.produto.idealStock), para: num(c.idealStock) });
  if (c.lotSize !== null && c.lotSize !== c.produto.lotSize)
    mudancas.push({ campo: "Lote de compra", de: num(c.produto.lotSize), para: num(c.lotSize) });
  if (c.desativar)
    mudancas.push({
      campo: "Situação",
      de: `ativo (estoque ${formatAmount(c.produto.currentStock)} ${UNIT_LABEL[c.produto.unit]})`,
      para: "desativar",
    });
  const rodar = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      setErro(null);
      const r = await fn();
      if (!r.ok) setErro(r.message ?? "Não deu certo.");
    });
  return (
    <li className="space-y-2 px-3 py-3">
      <p className="font-semibold leading-snug">{c.produto.name}</p>
      {mudancas.length > 0 && (
        <ul className="space-y-0.5 text-sm">
          {mudancas.map((m) => (
            <li key={m.campo}>
              <span className="text-[var(--muted-foreground)]">{m.campo}: </span>
              <span className="line-through opacity-60">{m.de}</span> → <strong>{m.para}</strong>
            </li>
          ))}
        </ul>
      )}
      {c.observacoes && <p className="text-sm">&ldquo;{c.observacoes}&rdquo;</p>}
      {mudancas.length === 0 && !c.observacoes && (
        <p className="text-sm text-[var(--muted-foreground)]">
          O cadastro já está como ele sugeriu — pode recusar para tirar da lista.
        </p>
      )}
      {c.unit !== c.produto.unit && (
        <p className="text-xs" style={{ color: "var(--warn)" }}>
          O estoque atual ({formatAmount(c.produto.currentStock)}) continua o mesmo número, agora em{" "}
          {UNIT_LABEL[c.unit]}. Confira na próxima contagem.
        </p>
      )}
      <p className="text-xs text-[var(--muted-foreground)]">
        sugerido {c.origem}
        {c.responsavel && ` por ${c.responsavel}`}
      </p>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pendente} onClick={() => rodar(() => aceitarCorrecao(c.id))}>
          Aceitar
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={() => rodar(() => recusarCorrecao(c.id))}>
          Recusar
        </Button>
      </div>
      <Erro texto={erro} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Recebimentos com diferença
// ---------------------------------------------------------------------------

const DESFECHOS = [
  { chave: "COBRADO", texto: "Cobrado do fornecedor" },
  { chave: "CREDITO", texto: "Crédito na próxima" },
  { chave: "ACEITO", texto: "Aceito como veio" },
] as const;
const PROBLEMA = { FALTA: "falta", DEVOLVIDO: "devolvido", AVARIA: "avaria" } as const;

export function Divergencias({
  pedidos,
}: {
  pedidos: (Omit<PendenciasDeCompras["divergencias"][number], "recebidoEm"> & { recebidoEmTexto: string | null })[];
}) {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {pedidos.map((p) => (
        <Divergencia key={p.id} p={p} />
      ))}
    </ul>
  );
}

function Divergencia({
  p,
}: {
  p: Omit<PendenciasDeCompras["divergencias"][number], "recebidoEm"> & { recebidoEmTexto: string | null };
}) {
  const [resolvendo, setResolvendo] = useState(false);
  const [desfecho, setDesfecho] = useState<(typeof DESFECHOS)[number]["chave"] | null>(null);
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-baseline gap-2">
        <p className="min-w-0 flex-1 font-semibold leading-snug">{p.fornecedor}</p>
        {p.recebidoEmTexto && <span className="shrink-0 text-xs text-[var(--muted-foreground)]">chegou {p.recebidoEmTexto}</span>}
      </div>
      <ul className="space-y-1 text-sm">
        {p.itens.map((i) => {
          const un = UNIT_LABEL[i.unidade];
          const d = i.divergencia;
          return (
            <li key={i.id}>
              <span className="font-medium">{i.nome}</span>
              <span className="block text-xs text-[var(--muted-foreground)]">
                {(d.faltou > 0 || d.sobrou > 0) &&
                  (i.quantidadeSolicitada === 0
                    ? // Incluído na conferência: veio sem estar no pedido.
                      `fora do pedido · veio ${formatAmount(i.quantidadeRecebida)} ${un}${
                        i.precoPago !== null ? ` × ${formatMoney(i.precoPago)}` : ""
                      }`
                    : `pediu ${formatAmount(i.quantidadeSolicitada)} ${un} · veio ${formatAmount(i.quantidadeRecebida)}`)}
                {d.problema && `${d.faltou > 0 || d.sobrou > 0 ? " · " : ""}${PROBLEMA[d.problema]}`}
                {d.diferencaPreco !== 0 && i.precoUnitario !== null && i.precoPago !== null && (
                  <>
                    {d.faltou > 0 || d.sobrou > 0 || d.problema ? " · " : ""}
                    combinado {formatMoney(i.precoUnitario)} · pago{" "}
                    <span style={{ color: d.diferencaPreco > 0 ? "var(--destructive)" : "var(--ok-strong)" }}>
                      {formatMoney(i.precoPago)}
                    </span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs">
        {p.pagoAMais > 0.004 && (
          <span className="font-semibold" style={{ color: "var(--destructive)" }}>
            {formatMoney(p.pagoAMais)} pago a mais
          </span>
        )}
        {p.pagoAMais > 0.004 && p.valorQueFaltou > 0.004 && " · "}
        {p.valorQueFaltou > 0.004 && <span className="text-[var(--muted-foreground)]">{formatMoney(p.valorQueFaltou)} não veio</span>}
      </p>
      {!resolvendo ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setResolvendo(true)}>
          Resolver
        </Button>
      ) : (
        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <div className="flex flex-wrap gap-1.5">
            {DESFECHOS.map((x) => (
              <button
                key={x.chave}
                type="button"
                aria-pressed={desfecho === x.chave}
                onClick={() => setDesfecho(x.chave)}
                className={`h-8 rounded-full border px-3 text-xs font-medium ${
                  desfecho === x.chave
                    ? "border-[var(--botao)] bg-[var(--botao)] text-[var(--botao-texto)]"
                    : "border-[var(--border)] bg-[var(--background)]"
                }`}
              >
                {x.texto}
              </button>
            ))}
          </div>
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" aria-label="Nota" className="h-9 px-2" />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pendente || desfecho === null}
              onClick={() =>
                startTransition(async () => {
                  setErro(null);
                  const r = await resolverDivergencia(p.id, desfecho!, nota);
                  if (!r.ok) setErro(r.message);
                })
              }
            >
              {pendente ? "Salvando…" : "Confirmar"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setResolvendo(false)}>
              voltar
            </Button>
          </div>
        </div>
      )}
      <Erro texto={erro} />
    </li>
  );
}

// ---------------------------------------------------------------------------
// Cadastros: preencher na própria linha
// ---------------------------------------------------------------------------

const POR_VEZ = 30;

/** Uma lista longa em lotes de 30, com "mostrar mais". */
function useLote<T>(itens: T[]) {
  const [limite, setLimite] = useState(POR_VEZ);
  return {
    naTela: itens.slice(0, limite),
    resto: Math.max(itens.length - limite, 0),
    mais: () => setLimite((l) => l + POR_VEZ),
  };
}

function MostrarMais({ resto, mais }: { resto: number; mais: () => void }) {
  if (resto === 0) return null;
  return (
    <div className="px-3 py-2 text-center">
      <button type="button" onClick={mais} className="text-sm text-[var(--primary)] underline-offset-4 hover:underline">
        Mostrar mais {resto}
      </button>
    </div>
  );
}

/**
 * Uma linha com um campo que grava ao sair (ou no Enter, que pula para o
 * próximo). Gravou, a linha some — o item deixou de estar pendente.
 */
function LinhaComCampo({
  nome,
  detalhe,
  rotulo,
  placeholder,
  gravar,
  largura = "w-24",
  numero = true,
}: {
  nome: string;
  detalhe?: string | null;
  rotulo: string;
  placeholder?: string;
  gravar: (valor: string) => Promise<{ ok: boolean; message?: string }>;
  largura?: string;
  numero?: boolean;
}) {
  const [valor, setValor] = useState("");
  const [feito, setFeito] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  if (feito) return null;
  return (
    <li className="px-3 py-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 text-sm leading-snug">
          {nome}
          {detalhe && <span className="block text-xs text-[var(--muted-foreground)]">{detalhe}</span>}
        </span>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
          {rotulo}
          <Input
            data-valor
            inputMode={numero ? "decimal" : undefined}
            value={valor}
            placeholder={placeholder}
            disabled={pendente}
            onChange={(e) => setValor(e.target.value)}
            onBlur={() => {
              if (valor.trim() === "") return;
              startTransition(async () => {
                setErro(null);
                const r = await gravar(valor);
                if (r.ok) setFeito(true);
                else setErro(r.message ?? "Não deu certo.");
              });
            }}
            className={`h-8 px-2 ${numero ? "text-right tabular-nums" : ""} ${largura}`}
          />
        </label>
      </div>
      <Erro texto={erro} />
    </li>
  );
}

/**
 * Os créditos combinados e ainda não abatidos: quanto, de quem e desde
 * quando. "Abatido" é tocado quando o desconto aparece num pedido seguinte.
 */
type CreditoNaTela = {
  id: number;
  origem: "divergencia" | "bonificacao";
  pedidoId: number | null;
  fornecedor: string;
  combinadoEmTexto: string | null;
  nota: string | null;
  valor: number;
};

export function CreditosAReceber({ creditos }: { creditos: CreditoNaTela[] }) {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {creditos.map((c) => (
        <CreditoLinha key={`${c.origem}-${c.id}`} c={c} />
      ))}
    </ul>
  );
}

function CreditoLinha({ c }: { c: CreditoNaTela }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{c.fornecedor}</p>
        <p className="text-sm text-[var(--muted-foreground)]">
          {c.pedidoId !== null && `Pedido #${c.pedidoId}`}
          {c.origem === "bonificacao" && " · bonificação"}
          {c.combinadoEmTexto && ` · combinado em ${c.combinadoEmTexto}`}
          {c.nota && ` · ${c.nota}`}
        </p>
      </div>
      <p className="num-display shrink-0 font-semibold">{formatMoney(c.valor)}</p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pendente}
        onClick={() =>
          startTransition(async () => {
            const r =
              c.origem === "bonificacao" ? await abaterCreditoDeBonificacao(c.id) : await marcarCreditoAbatido(c.id);
            if (!r.ok) setErro(r.message ?? "Não deu para marcar.");
          })
        }
      >
        {pendente ? "…" : "Abatido"}
      </Button>
      {erro && (
        <p role="alert" className="w-full text-sm" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
    </li>
  );
}

/**
 * A bonificação combinada que não veio no recebimento: chegou depois (soma
 * no estoque), virou crédito para um próximo pedido, ou fica pra lá.
 */
export function BonificacoesQueNaoVieram({ itens }: { itens: BonificacaoQueNaoVeio[] }) {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {itens.map((b) => (
        <BonificacaoLinha key={b.id} b={b} />
      ))}
    </ul>
  );
}

function BonificacaoLinha({ b }: { b: BonificacaoQueNaoVeio }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const [credito, setCredito] = useState<string | null>(null);

  function resolver(acao: "CHEGOU" | "CREDITO" | "CANCELAR") {
    setErro(null);
    startTransition(async () => {
      const r = await resolverBonificacao(b.id, acao, credito ?? undefined);
      if (!r.ok) setErro(r.message ?? "Não deu para resolver.");
    });
  }

  return (
    <li className="space-y-2 px-3 py-3">
      <div>
        <p className="font-semibold">{b.fornecedor}</p>
        <p className="text-sm">{b.texto}</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Pedido #{b.pedidoId}
          {b.nota && ` · ${b.nota}`}
        </p>
      </div>
      {credito === null ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={pendente} onClick={() => resolver("CHEGOU")}>
            {b.dinheiro ? "Abateram depois" : "Chegou depois"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pendente}
            onClick={() => setCredito(b.valorSugerido === null ? "" : precoNoCampo(b.valorSugerido))}
          >
            Virou crédito
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={() => resolver("CANCELAR")}>
            Deixar pra lá
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            resolver("CREDITO");
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[var(--muted-foreground)]">Valor do crédito (R$)</span>
            <Input
              inputMode="decimal"
              autoFocus
              value={credito}
              onChange={(e) => setCredito(e.target.value)}
              placeholder="0,00"
              className="num-display h-8 w-32 text-right"
            />
          </label>
          <Button type="submit" size="sm" disabled={pendente}>
            {pendente ? "…" : "Guardar crédito"}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={() => setCredito(null)}>
            voltar
          </Button>
        </form>
      )}
      <Erro texto={erro} />
    </li>
  );
}

export function ProdutosSemIdeal({ itens }: { itens: PendenciasDeCompras["semIdeal"] }) {
  const { naTela, resto, mais } = useLote(itens);
  return (
    <>
      <ul onKeyDown={enterProximoValor} className="divide-y divide-[var(--border)]">
        {naTela.map((p) => (
          <LinhaComCampo
            key={p.id}
            nome={p.nome}
            detalhe={p.categoria}
            rotulo={`Ideal (${UNIT_LABEL[p.unit]})`}
            gravar={(v) => definirEstoqueIdeal(p.id, v)}
          />
        ))}
      </ul>
      <MostrarMais resto={resto} mais={mais} />
    </>
  );
}

export function ProdutosSemCodigo({ itens }: { itens: PendenciasDeCompras["semCodigo"] }) {
  const { naTela, resto, mais } = useLote(itens);
  return (
    <>
      <ul onKeyDown={enterProximoValor} className="divide-y divide-[var(--border)]">
        {naTela.map((p) => (
          <LinhaComCampo
            key={p.id}
            nome={p.nome}
            rotulo="Código"
            numero={false}
            largura="w-28"
            gravar={(v) => definirCodigo(p.id, v)}
          />
        ))}
      </ul>
      <MostrarMais resto={resto} mais={mais} />
    </>
  );
}

export function FornecedoresSemPrazo({ itens }: { itens: PendenciasDeCompras["fornSemPrazo"] }) {
  const { naTela, resto, mais } = useLote(itens);
  return (
    <>
      <ul onKeyDown={enterProximoValor} className="divide-y divide-[var(--border)]">
        {naTela.map((f) => (
          <LinhaComCampo
            key={f.id}
            nome={f.nome}
            rotulo="Entrega em"
            placeholder="dias"
            largura="w-16"
            gravar={(v) => definirPrazoDoFornecedor(f.id, v)}
          />
        ))}
      </ul>
      <MostrarMais resto={resto} mais={mais} />
    </>
  );
}

/**
 * Fornecedor sem categoria: as categorias em botões; tocar liga ou desliga e
 * grava na hora. Ligou a primeira, ele passa a ser chamado para cotação — mas
 * fica na lista até a página recarregar, para dar para marcar mais de uma.
 */
export function FornecedoresSemCategoria({
  itens,
  categorias,
}: {
  itens: PendenciasDeCompras["fornSemCategoria"];
  categorias: Categoria[];
}) {
  // A lista de quando a tela abriu: o servidor tira o fornecedor assim que
  // ganha a primeira categoria, e a linha sumiria antes da segunda.
  const [fixos] = useState(itens);
  const { naTela, resto, mais } = useLote(fixos);
  return (
    <>
      <ul className="divide-y divide-[var(--border)]">
        {naTela.map((f) => (
          <FornecedorCategorias key={f.id} f={f} categorias={categorias} />
        ))}
      </ul>
      <MostrarMais resto={resto} mais={mais} />
    </>
  );
}

function FornecedorCategorias({
  f,
  categorias,
}: {
  f: PendenciasDeCompras["fornSemCategoria"][number];
  categorias: Categoria[];
}) {
  const [ligadas, setLigadas] = useState<Set<number>>(() => new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <p className="text-sm font-medium">{f.nome}</p>
      <div className="flex flex-wrap gap-1.5">
        {categorias.map((c) => {
          const ativa = ligadas.has(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={ativa}
              disabled={pendente}
              onClick={() =>
                startTransition(async () => {
                  setErro(null);
                  const r = await alternarCategoriaDoFornecedor(f.id, c.id);
                  if (!r.ok) return setErro(r.message);
                  setLigadas((a) => {
                    const n = new Set(a);
                    if (n.has(c.id)) n.delete(c.id);
                    else n.add(c.id);
                    return n;
                  });
                })
              }
              className={`h-7 rounded-full border px-2.5 text-xs ${
                ativa
                  ? "border-[var(--botao)] bg-[var(--botao)] text-[var(--botao-texto)]"
                  : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]"
              }`}
            >
              {c.name}
            </button>
          );
        })}
      </div>
      <Erro texto={erro} />
    </li>
  );
}
