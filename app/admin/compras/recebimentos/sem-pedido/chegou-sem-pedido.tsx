"use client";

import { Gift, PackagePlus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registrarChegadaSemPedido } from "@/lib/actions/pedido";
import { MOTIVO_SEM_PEDIDO } from "@/lib/cotacao-labels";
import { enterProximoValor } from "@/lib/enter-proximo-valor";
import { UNIT_LABEL, chave, formatMoney, lerNumeroBR, precoNoCampo } from "@/lib/format";
import type { ProdutoComFornecedores } from "@/lib/produtos-para-pedido";
import type { MotivoSemPedido } from "@/generated/prisma/client";

import { CadastroRapidoFornecedor, CadastroRapidoProduto } from "../../pedido-manual/cadastro-rapido";
import { SeletorDeProduto } from "../../pedidos/seletor-de-produto";

type Linha = { produtoId: number; quantidade: string; preco: string };

/** Uma bonificação de mercadoria combinada que ainda não chegou. */
export type BonificacaoPorVir = {
  id: number;
  fornecedorId: number;
  pedidoId: number;
  produtoId: number;
  quantidade: number;
  texto: string;
};

const MOTIVOS = Object.keys(MOTIVO_SEM_PEDIDO) as MotivoSemPedido[];
const emTexto = (n: number) => String(n).replace(".", ",");
const emReais = precoNoCampo;

/**
 * O formulário de quem recebeu mercadoria sem pedido: por quê, de quem e o
 * quê. Nada vai ao banco antes de "Confirmar entrada" — e aí vai tudo de uma
 * vez, já recebido.
 *
 * O motivo vem primeiro porque decide o resto: só a compra de balcão pede
 * preço. Brinde e troca não custam nada agora, e um campo de preço ali só
 * convidaria a digitar o valor de tabela.
 */
export function ChegouSemPedido({
  fornecedores,
  produtos: produtosDaPagina,
  categorias,
  bonificacoes = [],
}: {
  fornecedores: { id: number; nome: string }[];
  produtos: ProdutoComFornecedores[];
  /** Para o cadastro rápido de produto. */
  categorias: { id: number; name: string }[];
  /** As bonificações por vir: a entrada de bonificação pode dizer qual é. */
  bonificacoes?: BonificacaoPorVir[];
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState<MotivoSemPedido | null>(null);
  const [fornecedorId, setFornecedorId] = useState<number | null>(null);
  const [buscaFornecedor, setBuscaFornecedor] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const [cadastrando, setCadastrando] = useState<"fornecedor" | "produto" | null>(null);
  const [bonificacaoId, setBonificacaoId] = useState<number | null>(null);
  const [fornecedoresNovos, setFornecedoresNovos] = useState<{ id: number; nome: string }[]>([]);
  const [produtosNovos, setProdutosNovos] = useState<ProdutoComFornecedores[]>([]);
  const produtos = [
    ...produtosDaPagina,
    ...produtosNovos.filter((n) => !produtosDaPagina.some((p) => p.id === n.id)),
  ];

  const comPreco = motivo === "BALCAO";
  const bonificacoesDoFornecedor =
    motivo === "BONIFICACAO" ? bonificacoes.filter((b) => b.fornecedorId === fornecedorId) : [];
  const ligada = bonificacoesDoFornecedor.find((b) => b.id === bonificacaoId) ?? null;
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const fornecedor =
    [...fornecedores, ...fornecedoresNovos].find((f) => f.id === fornecedorId) ?? null;
  const termoFornecedor = chave(buscaFornecedor);
  const fornecedoresAchados =
    termoFornecedor === ""
      ? []
      : fornecedores.filter((f) => chave(f.nome).includes(termoFornecedor)).slice(0, 8);

  const total = comPreco
    ? linhas.reduce((acc, l) => {
        const q = lerNumeroBR(l.quantidade);
        const p = lerNumeroBR(l.preco);
        return q !== null && p !== null ? acc + q * p : acc;
      }, 0)
    : 0;

  function mudar(produtoId: number, campo: "quantidade" | "preco", valor: string) {
    setLinhas((a) => a.map((l) => (l.produtoId === produtoId ? { ...l, [campo]: valor } : l)));
  }

  function confirmar() {
    if (motivo === null) return setErro("Escolha o motivo.");
    if (fornecedorId === null) return setErro("Escolha o fornecedor.");
    if (linhas.length === 0) return setErro("Acrescente ao menos um produto.");
    if (ligada && !linhas.some((l) => l.produtoId === ligada.produtoId)) {
      return setErro(`A bonificação escolhida é de ${porId.get(ligada.produtoId)?.nome ?? "outro produto"}: acrescente ele.`);
    }
    const itens: { produtoId: number; quantidade: number; precoUnitario: number | null }[] = [];
    for (const l of linhas) {
      const nome = porId.get(l.produtoId)?.nome ?? "produto";
      const q = lerNumeroBR(l.quantidade);
      if (q === null || q <= 0) return setErro(`Falta a quantidade de ${nome}.`);
      const p = comPreco ? lerNumeroBR(l.preco) : null;
      if (comPreco && (p === null || p <= 0)) return setErro(`Falta o preço da nota de ${nome}.`);
      itens.push({ produtoId: l.produtoId, quantidade: q, precoUnitario: p });
    }
    setErro(null);
    startTransition(async () => {
      const r = await registrarChegadaSemPedido(fornecedorId, motivo, itens, ligada?.id ?? null);
      if (!r.ok) return setErro(r.message);
      // De volta à lista, com a entrada aberta entre os recebidos.
      router.push(`/admin/compras/recebimentos?entrada=${r.data.id}`);
    });
  }

  /** Escolher a bonificação combinada já põe o produto dela na lista. */
  function ligar(b: BonificacaoPorVir | null) {
    setBonificacaoId(b?.id ?? null);
    setErro(null);
    if (b && !linhas.some((l) => l.produtoId === b.produtoId)) {
      setLinhas((a) => [...a, { produtoId: b.produtoId, quantidade: emTexto(b.quantidade), preco: "" }]);
    }
  }

  /** O ícone de cadastrar no cabeçalho do cartão. */
  const botaoCadastrar = (qual: "fornecedor" | "produto") => (
    <button
      type="button"
      title={qual === "fornecedor" ? "Cadastrar fornecedor" : "Cadastrar produto"}
      aria-label={qual === "fornecedor" ? "Cadastrar fornecedor" : "Cadastrar produto"}
      onClick={() => setCadastrando(cadastrando === qual ? null : qual)}
      className={`ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:border-[var(--primary)] hover:text-[var(--primary)] ${
        cadastrando === qual
          ? "border-[var(--primary)] text-[var(--primary)]"
          : "border-[var(--border)] text-[var(--muted-foreground)]"
      }`}
    >
      {qual === "fornecedor" ? (
        <UserPlus aria-hidden className="size-4" />
      ) : (
        <PackagePlus aria-hidden className="size-4" />
      )}
      <span className="hidden sm:inline">Cadastrar</span>
    </button>
  );

  /** O cabeçalho numerado de cada cartão. */
  const cabecalho = (n: number, titulo: string, detalhe: string | null, acao?: React.ReactNode) => (
    <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--botao)] text-xs font-semibold text-[var(--botao-texto)]">
        {n}
      </span>
      <h2 className="font-semibold">{titulo}</h2>
      {detalhe && <span className="text-sm text-[var(--muted-foreground)]">· {detalhe}</span>}
      {acao}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 1 · Por quê. Três botões lado a lado, o escolhido cheio. */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {cabecalho(1, "Motivo", null)}
        <div className="grid grid-cols-3 gap-2 p-3">
          {MOTIVOS.map((m) => {
            const ativo = motivo === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={ativo}
                onClick={() => setMotivo(m)}
                className={`flex min-h-14 flex-col items-center justify-center rounded-lg border px-1.5 py-2 text-center ${
                  ativo
                    ? "border-[var(--botao)] bg-[var(--botao)] text-[var(--botao-texto)]"
                    : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]"
                }`}
              >
                <span className="text-sm font-semibold leading-tight">{MOTIVO_SEM_PEDIDO[m].texto}</span>
                <span
                  className={`mt-0.5 text-[11px] leading-tight ${
                    ativo ? "opacity-85" : "text-[var(--muted-foreground)]"
                  }`}
                >
                  {MOTIVO_SEM_PEDIDO[m].dica}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2 · De quem. A busca por nome, como no pedido manual. */}
      {motivo !== null && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {cabecalho(2, "Fornecedor", null, botaoCadastrar("fornecedor"))}
          <div className="space-y-2 p-3">
            {cadastrando === "fornecedor" && (
              <CadastroRapidoFornecedor
                nomeInicial={fornecedor ? "" : buscaFornecedor}
                aoFechar={() => setCadastrando(null)}
                aoCriar={(f) => {
                  setFornecedoresNovos((a) => [...a, f]);
                  setFornecedorId(f.id);
                  setBuscaFornecedor("");
                  setCadastrando(null);
                }}
              />
            )}
            {fornecedor ? (
              <div className="flex items-center gap-3">
                <p className="min-w-0 flex-1 truncate text-lg font-semibold">{fornecedor.nome}</p>
                <button
                  type="button"
                  onClick={() => {
                    setFornecedorId(null);
                    setBuscaFornecedor("");
                    setBonificacaoId(null);
                  }}
                  className="shrink-0 text-sm text-[var(--primary)] underline-offset-4 hover:underline"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <div>
                <Input
                  value={buscaFornecedor}
                  onChange={(e) => setBuscaFornecedor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (fornecedoresAchados.length > 0) setFornecedorId(fornecedoresAchados[0].id);
                  }}
                  placeholder="Buscar fornecedor pelo nome"
                  aria-label="Buscar fornecedor pelo nome"
                  className="h-10 w-full"
                  autoFocus
                />
                {fornecedoresAchados.length > 0 && (
                  <ul className="mt-1 divide-y divide-[var(--border)] rounded-md border border-[var(--border)] bg-[var(--background)]">
                    {fornecedoresAchados.map((f) => (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => setFornecedorId(f.id)}
                          className="w-full px-3 py-2.5 text-left text-sm hover:bg-[var(--muted)]"
                        >
                          {f.nome}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {termoFornecedor !== "" && fornecedoresAchados.length === 0 && (
                  <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">
                    Nenhum fornecedor com esse nome. Cadastre pelo botão acima.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* A bonificação combinada que chegou separada, ou depois do pedido:
          ligar a entrada a ela tira a cobrança de Pendências. */}
      {bonificacoesDoFornecedor.length > 0 && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Gift aria-hidden className="size-4 text-[var(--primary)]" />
            É a bonificação combinada?
          </p>
          <div role="radiogroup" aria-label="Bonificação combinada" className="mt-2 space-y-1.5">
            {bonificacoesDoFornecedor.map((b) => (
              <button
                key={b.id}
                type="button"
                role="radio"
                aria-checked={bonificacaoId === b.id}
                onClick={() => ligar(bonificacaoId === b.id ? null : b)}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm ${
                  bonificacaoId === b.id
                    ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold"
                    : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]"
                }`}
              >
                <span className="min-w-0 flex-1">{b.texto}</span>
                <span className="shrink-0 text-xs font-normal text-[var(--muted-foreground)]">pedido #{b.pedidoId}</span>
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={bonificacaoId === null}
              onClick={() => ligar(null)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                bonificacaoId === null
                  ? "border-[var(--primary)] bg-[var(--primary-soft)] font-semibold"
                  : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]"
              }`}
            >
              Não, é outra coisa
            </button>
          </div>
        </section>
      )}

      {/* 3 · O que veio. Quantidade sempre; preço da nota só no balcão. */}
      {motivo !== null && fornecedorId !== null && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {cabecalho(
            3,
            "O que chegou",
            linhas.length === 0 ? null : linhas.length === 1 ? "1 item" : `${linhas.length} itens`,
            botaoCadastrar("produto"),
          )}
          <div className="space-y-3 p-3">
            {cadastrando === "produto" && (
              <CadastroRapidoProduto
                fornecedorId={fornecedorId}
                categorias={categorias}
                aoFechar={() => setCadastrando(null)}
                aoCriar={(p) => {
                  setProdutosNovos((a) => [
                    ...a,
                    { id: p.id, nome: p.nome, unidade: p.unidade, lote: null, fornecedorIds: [fornecedorId] },
                  ]);
                  setLinhas((a) => [...a, { produtoId: p.id, quantidade: "", preco: "" }]);
                  setCadastrando(null);
                }}
              />
            )}

            <SeletorDeProduto
              focarAoAbrir
              semMoldura
              semPreco={!comPreco}
              produtos={produtos.map((p) => ({
                id: p.id,
                nome: p.nome,
                unidade: p.unidade,
                // Chegou o que chegou: aqui o lote de compra não vale.
                lote: null,
                doFornecedor: p.fornecedorIds.includes(fornecedorId),
              }))}
              aoAcrescentar={async (produtoId, q, preco) => {
                // Produto que já está na lista soma na linha dele.
                setLinhas((a) => {
                  const ja = a.find((l) => l.produtoId === produtoId);
                  if (!ja) return [...a, { produtoId, quantidade: emTexto(q), preco: emReais(preco) }];
                  return a.map((l) =>
                    l.produtoId === produtoId
                      ? {
                          ...l,
                          quantidade: emTexto((lerNumeroBR(l.quantidade) ?? 0) + q),
                          preco: preco === null ? l.preco : emReais(preco),
                        }
                      : l,
                  );
                });
                return null;
              }}
            />

            {linhas.length > 0 && (
              <ul
                onKeyDown={enterProximoValor}
                className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--background)]"
              >
                {linhas.map((l) => {
                  const produto = porId.get(l.produtoId);
                  if (!produto) return null;
                  const unidade = UNIT_LABEL[produto.unidade];
                  const q = lerNumeroBR(l.quantidade);
                  const p = lerNumeroBR(l.preco);
                  return (
                    <li key={l.produtoId} className="space-y-1.5 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 font-semibold">{produto.nome}</p>
                        <button
                          type="button"
                          onClick={() => setLinhas((a) => a.filter((x) => x.produtoId !== l.produtoId))}
                          aria-label={`Tirar ${produto.nome}`}
                          title="Tirar da entrada"
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--destructive)]"
                        >
                          ✕
                        </button>
                      </div>
                      {/* Três colunas mesmo sem preço, para a quantidade não
                          esticar a tela inteira. */}
                      <div className="grid grid-cols-3 items-end gap-2">
                        <label className="block">
                          <span className="block text-xs text-[var(--muted-foreground)]">Chegou</span>
                          <span className="relative block">
                            <Input
                              inputMode="decimal"
                              data-valor
                              aria-label={`Quantidade de ${produto.nome}`}
                              value={l.quantidade}
                              onChange={(e) => mudar(l.produtoId, "quantidade", e.target.value)}
                              className="num-display h-10 w-full pr-10 text-right"
                            />
                            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
                              {unidade}
                            </span>
                          </span>
                        </label>
                        {comPreco && (
                          <>
                            <label className="block">
                              <span className="block text-xs text-[var(--muted-foreground)]">Preço/{unidade}</span>
                              <span className="relative block">
                                <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
                                  R$
                                </span>
                                <Input
                                  inputMode="decimal"
                                  data-valor
                                  aria-label={`Preço da nota de ${produto.nome}`}
                                  value={l.preco}
                                  onChange={(e) => mudar(l.produtoId, "preco", e.target.value)}
                                  placeholder="0,00"
                                  className="num-display h-10 w-full pl-7 text-right"
                                />
                              </span>
                            </label>
                            <div className="text-right">
                              <span className="block text-xs text-[var(--muted-foreground)]">Subtotal</span>
                              <p className="flex h-10 items-center justify-end font-semibold tabular-nums">
                                {q !== null && p !== null ? (
                                  formatMoney(q * p)
                                ) : (
                                  <span className="text-[var(--muted-foreground)]">—</span>
                                )}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {/* O fechamento preso embaixo: com a lista comprida, o botão continua à vista. */}
      {motivo !== null && fornecedorId !== null && (
        <div className="sticky bottom-[var(--barra-de-baixo)] z-10 flex items-center gap-3 border-t border-[var(--border)] bg-[var(--background)] py-3">
          <div className="min-w-0 flex-1">
            {comPreco ? (
              <p className="text-base">
                Total <strong className="text-lg tabular-nums">{formatMoney(total)}</strong>
              </p>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                {MOTIVO_SEM_PEDIDO[motivo].texto} · sem custo
              </p>
            )}
            <p className="text-xs text-[var(--muted-foreground)]">O estoque sobe ao confirmar.</p>
          </div>
          <Button type="button" size="lg" disabled={pendente || linhas.length === 0} onClick={confirmar}>
            {pendente ? "Confirmando…" : "Confirmar entrada"}
          </Button>
        </div>
      )}
    </div>
  );
}
