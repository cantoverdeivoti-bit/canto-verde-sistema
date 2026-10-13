"use client";

import { PackagePlus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { OrcamentoSemana } from "@/components/orcamento-semana";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criarPedidoManual } from "@/lib/actions/pedido";
import { UNIT_LABEL, chave, formatMoney, lerNumeroBR, precoNoCampo } from "@/lib/format";
import type { OrcamentoDaSemana } from "@/lib/orcamento";
import type { ProdutoComFornecedores } from "@/lib/produtos-para-pedido";

import { SeletorDeProduto } from "../pedidos/seletor-de-produto";
import { CadastroRapidoFornecedor, CadastroRapidoProduto } from "./cadastro-rapido";

type Linha = { produtoId: number; quantidade: string; preco: string };

const emTexto = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
const emReais = precoNoCampo;

/**
 * O rascunho do pedido manual, só na tela até "Criar pedido".
 *
 * Nada vai ao banco antes disso: um pedido pela metade que ficasse gravado
 * apareceria em Recebimentos cobrando uma conferência que nunca vai
 * acontecer. Criado, ele vira um pedido de verdade, e as edições seguintes
 * são na página dele.
 */
export function NovoPedido({
  iniciais = [],
  avisoId = null,
  fornecedores,
  produtos: produtosDaPagina,
  orcamento,
  categorias,
  ultimoPago = {},
}: {
  /** Já na lista ao abrir — o "Comprar de outro" de Pendências. */
  iniciais?: { produtoId: number; quantidade: number }[];
  /** O aviso de falta que este pedido resolve, quando veio de "Comprar de outro". */
  avisoId?: number | null;
  fornecedores: { id: number; nome: string }[];
  produtos: ProdutoComFornecedores[];
  /** Para o cadastro rápido de produto. */
  categorias: { id: number; name: string }[];
  /** O orçamento da semana: aqui só mostra, não trava — compra urgente não espera. */
  orcamento: OrcamentoDaSemana;
  /** O último preço pago de cada produto (última entrega conferida): a referência ao lado do campo. */
  ultimoPago?: Record<number, { valor: number; dia: string; fornecedor: string | null }>;
}) {
  const router = useRouter();
  const [fornecedorId, setFornecedorId] = useState<number | null>(null);
  const [buscaFornecedor, setBuscaFornecedor] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    iniciais.map((i) => ({ produtoId: i.produtoId, quantidade: emTexto(i.quantidade), preco: "" })),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  // Qual cadastro rápido está aberto.
  const [cadastrando, setCadastrando] = useState<"fornecedor" | "produto" | null>(null);
  /* O que foi cadastrado aqui entra já, sem esperar a página recarregar: o
     fornecedor fica escolhido e o produto cai na lista do pedido. */
  const [fornecedoresNovos, setFornecedoresNovos] = useState<{ id: number; nome: string }[]>([]);
  const [produtosNovos, setProdutosNovos] = useState<ProdutoComFornecedores[]>([]);
  const produtos = [
    ...produtosDaPagina,
    ...produtosNovos.filter((n) => !produtosDaPagina.some((p) => p.id === n.id)),
  ];

  const porId = new Map(produtos.map((p) => [p.id, p]));
  const fornecedor =
    [...fornecedores, ...fornecedoresNovos].find((f) => f.id === fornecedorId) ?? null;
  const termoFornecedor = chave(buscaFornecedor);
  const fornecedoresAchados =
    termoFornecedor === ""
      ? []
      : fornecedores.filter((f) => chave(f.nome).includes(termoFornecedor)).slice(0, 8);

  const total = linhas.reduce((acc, l) => {
    const q = lerNumeroBR(l.quantidade);
    const p = lerNumeroBR(l.preco);
    return q !== null && p !== null ? acc + q * p : acc;
  }, 0);

  function mudar(produtoId: number, campo: "quantidade" | "preco", valor: string) {
    setLinhas((a) => a.map((l) => (l.produtoId === produtoId ? { ...l, [campo]: valor } : l)));
  }

  function criar() {
    if (fornecedorId === null) return setErro("Escolha o fornecedor.");
    if (linhas.length === 0) return setErro("Acrescente ao menos um produto.");
    const itens: { produtoId: number; quantidade: number; precoUnitario: number | null }[] = [];
    for (const l of linhas) {
      const q = lerNumeroBR(l.quantidade);
      const nome = porId.get(l.produtoId)?.nome ?? "produto";
      if (q === null || q <= 0) return setErro(`Falta a quantidade de ${nome}.`);
      const p = l.preco.trim() === "" ? null : lerNumeroBR(l.preco);
      if (l.preco.trim() !== "" && (p === null || p <= 0)) {
        return setErro(`Preço inválido em ${nome}.`);
      }
      itens.push({ produtoId: l.produtoId, quantidade: q, precoUnitario: p });
    }
    setErro(null);
    startTransition(async () => {
      const r = await criarPedidoManual(fornecedorId, itens, avisoId);
      if (!r.ok) return setErro(r.message);
      router.push(`/admin/compras/pedidos/${r.data.id}`);
    });
  }

  // Sem estado novo aqui de propósito: é só conta sobre as linhas.
  const semPreco = linhas.filter((l) => l.preco.trim() === "").length;

  /** O ícone de cadastrar no cabeçalho de cada cartão. */
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
  const cabecalho = (
    n: number,
    titulo: string,
    detalhe: string | null,
    qual: "fornecedor" | "produto",
  ) => (
    <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
      <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--botao)] text-xs font-semibold text-[var(--botao-texto)]">
        {n}
      </span>
      <h2 className="font-semibold">{titulo}</h2>
      {detalhe && <span className="text-sm text-[var(--muted-foreground)]">· {detalhe}</span>}
      {botaoCadastrar(qual)}
    </div>
  );

  return (
    <div className="space-y-4">
      <OrcamentoSemana
        dados={orcamento}
        estaCompra={linhas.length > 0 ? total : undefined}
        className="rounded-lg border border-[var(--border)] px-3 py-2"
      />

      {/* 1 · Fornecedor. Busca em texto, e não uma lista de rolar: são
          dezenas de fornecedores, e digitar três letras é mais rápido que
          procurar. Enter escolhe o primeiro achado. */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        {cabecalho(1, "Fornecedor", null, "fornecedor")}
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

      {/* 2 · Produtos: a busca em cima, a lista embaixo. Cada linha com
          quantidade, preço e subtotal em colunas iguais, para os números
          ficarem um embaixo do outro. */}
      {fornecedorId !== null && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)]">
          {cabecalho(
            2,
            "Produtos",
            linhas.length === 0 ? null : linhas.length === 1 ? "1 item" : `${linhas.length} itens`,
            "produto",
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
              produtos={produtos.map((p) => ({
                id: p.id,
                nome: p.nome,
                unidade: p.unidade,
                lote: p.lote,
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
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--background)]">
                {linhas.map((l) => {
                  const produto = porId.get(l.produtoId);
                  if (!produto) return null;
                  const unidade = UNIT_LABEL[produto.unidade];
                  const q = lerNumeroBR(l.quantidade);
                  const p = lerNumeroBR(l.preco);
                  const pago = ultimoPago[l.produtoId];
                  return (
                    <li key={l.produtoId} className="space-y-1.5 px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 font-semibold">{produto.nome}</p>
                        <button
                          type="button"
                          onClick={() => setLinhas((a) => a.filter((x) => x.produtoId !== l.produtoId))}
                          aria-label={`Tirar ${produto.nome}`}
                          title="Tirar do pedido"
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--destructive)]"
                        >
                          ✕
                        </button>
                      </div>
                      {/* O último preço pago, com um toque para usar: é a referência de quem
                          combina o preço por telefone. */}
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--muted-foreground)]">
                        {pago ? (
                          <>
                            <span>
                              Último pago:{" "}
                              <strong className="font-semibold text-[var(--foreground)] tabular-nums">
                                {formatMoney(pago.valor)}/{unidade}
                              </strong>{" "}
                              · {pago.dia}
                              {pago.fornecedor && ` · ${pago.fornecedor}`}
                            </span>
                            {l.preco.trim() === "" && (
                              <button
                                type="button"
                                onClick={() => mudar(l.produtoId, "preco", emReais(pago.valor))}
                                className="font-semibold text-[var(--primary)] underline underline-offset-2"
                              >
                                usar este preço
                              </button>
                            )}
                          </>
                        ) : (
                          <span>Ainda não comprado: sem último preço.</span>
                        )}
                      </p>
                      <div className="grid grid-cols-3 items-end gap-2">
                        <label className="block">
                          <span className="block text-xs text-[var(--muted-foreground)]">Quantidade</span>
                          <span className="relative block">
                            <Input
                              inputMode="decimal"
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
                        <label className="block">
                          <span className="block text-xs text-[var(--muted-foreground)]">Preço por {unidade}</span>
                          <span className="relative block">
                            <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
                              R$
                            </span>
                            <Input
                              inputMode="decimal"
                              aria-label={`Preço por ${unidade} de ${produto.nome}`}
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

      {/* O fechamento fica preso embaixo da tela: com a lista comprida, o
          total e o botão continuam à vista. */}
      {fornecedorId !== null && (
        <div className="sticky bottom-[var(--barra-de-baixo)] z-10 flex items-center gap-3 border-t border-[var(--border)] bg-[var(--background)] py-3">
          <div className="min-w-0 flex-1">
            <p className="text-base">
              Total <strong className="text-lg tabular-nums">{formatMoney(total)}</strong>
            </p>
            {semPreco > 0 && (
              <p className="text-xs text-[var(--muted-foreground)]">
                {semPreco === 1 ? "1 item" : `${semPreco} itens`} sem preço, a combinar
              </p>
            )}
          </div>
          <Button type="button" size="lg" disabled={pendente || linhas.length === 0} onClick={criar}>
            {pendente ? "Criando…" : "Criar pedido"}
          </Button>
        </div>
      )}
    </div>
  );
}
