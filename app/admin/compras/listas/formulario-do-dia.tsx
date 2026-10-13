"use client";

import { CalendarDays, Power, ShoppingBasket, Trash2, Truck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { ConfirmarNaLinha } from "@/components/confirmar-na-linha";
import { CartaoDeSecao } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apagarDiaDaRotina, ligarDiaDaRotina, salvarDiaDaRotina } from "@/lib/actions/lista-compra";
import { DIAS_DA_SEMANA, UNIT_LABEL, chave, formatAmount, lerNumeroBR } from "@/lib/format";
import { useAcao } from "@/lib/use-acao";
import type { ProductUnit } from "@/generated/prisma/client";

import { SeletorDeProduto } from "../pedidos/seletor-de-produto";

/** Segunda primeiro: é como a semana de compra é lida na casa. */
const ORDEM_DOS_DIAS = [1, 2, 3, 4, 5, 6, 0];

export type ProdutoDaRotina = {
  id: number;
  nome: string;
  unidade: ProductUnit;
  lote: number | null;
  /** Quem vende: cadastro, exclusivo ou categoria. Só ordena a busca. */
  fornecedorIds: number[];
};

export type FornecedorDaRotina = {
  id: number;
  nome: string;
  /** Os dias que ele já tem cadastrados. */
  dias: { dia: number; listaId: number }[];
  /** Os produtos dos dias dele: um dia novo já nasce com eles. */
  produtoIds: number[];
};

type Linha = { produtoId: number; ideal: string };

const paraTexto = (n: number) => String(n).replace(".", ",");

/**
 * Um dia da compra de rotina, na ordem em que se pensa nele: o fornecedor, o
 * dia da semana, e os produtos com o estoque ideal de cada um. Serve para
 * cadastrar (sem `lista`) e para mudar um dia que já existe.
 *
 * Num dia novo de um fornecedor que já tem outros dias, os produtos dele já
 * vêm na lista, com o ideal em branco: é só digitar o de hoje.
 */
export function FormularioDoDia({
  fornecedores,
  produtos,
  lista = null,
  fornecedorInicial = null,
  sugeridos = {},
  peloLink = false,
}: {
  fornecedores: FornecedorDaRotina[];
  produtos: ProdutoDaRotina[];
  /** O dia sendo mudado. Nulo = cadastro novo. */
  lista?: { id: number; fornecedorId: number; dia: number; ativa: boolean; itens: { produtoId: number; ideal: number }[] } | null;
  /** Cadastro novo vindo do "+ outro dia" de um fornecedor. */
  fornecedorInicial?: number | null;
  /** "30 (estoquista)": ideal sugerido esperando decisão, por produto. */
  sugeridos?: Record<number, string>;
  /** Pelo link de atalhos: apagar pede login. */
  peloLink?: boolean;
}) {
  const router = useRouter();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Ligar, desligar e apagar o dia: o erro aparece embaixo dos quadrados.
  const { erro: erroDaAcao, pendente: pendenteDaAcao, rodar } = useAcao();

  const linhasDoFornecedor = (id: number | null): Linha[] =>
    (fornecedores.find((f) => f.id === id)?.produtoIds ?? []).map((produtoId) => ({ produtoId, ideal: "" }));

  const [fornecedorId, setFornecedorId] = useState<number | null>(lista?.fornecedorId ?? fornecedorInicial);
  const [dia, setDia] = useState<number | null>(lista?.dia ?? null);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    lista ? lista.itens.map((i) => ({ produtoId: i.produtoId, ideal: paraTexto(i.ideal) })) : linhasDoFornecedor(fornecedorInicial),
  );
  const [busca, setBusca] = useState("");
  const [mexeu, setMexeu] = useState(false);

  // Sair com coisa digitada e não salva pergunta antes.
  useEffect(() => {
    if (!mexeu) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [mexeu]);

  const fornecedor = fornecedores.find((f) => f.id === fornecedorId) ?? null;
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const naLista = new Set(linhas.map((l) => l.produtoId));
  const termo = chave(busca);
  const achados = termo === "" ? [] : fornecedores.filter((f) => chave(f.nome).includes(termo)).slice(0, 8);
  /** O dia já cadastrado para este fornecedor (que não é o que está aberto). */
  const ocupado = (d: number) => fornecedor?.dias.find((x) => x.dia === d && x.listaId !== lista?.id) ?? null;

  function escolherFornecedor(id: number | null) {
    setFornecedorId(id);
    setBusca("");
    setDia(null);
    setLinhas(linhasDoFornecedor(id));
    setMexeu(id !== null);
  }

  function digitar(produtoId: number, ideal: string) {
    setLinhas((ls) => ls.map((l) => (l.produtoId === produtoId ? { ...l, ideal } : l)));
    setMexeu(true);
  }

  function salvar() {
    setErro(null);
    if (fornecedorId === null) return setErro("Escolha o fornecedor.");
    if (dia === null) return setErro("Escolha o dia da semana.");
    if (linhas.length === 0) return setErro("Escolha ao menos um produto.");
    const semIdeal = linhas.find((l) => {
      const n = lerNumeroBR(l.ideal.trim());
      return n === null || n <= 0;
    });
    if (semIdeal) return setErro(`Digite o estoque ideal de ${porId.get(semIdeal.produtoId)?.nome ?? "todos os produtos"}.`);
    startTransition(async () => {
      const r = await salvarDiaDaRotina({ listaId: lista?.id ?? null, fornecedorId, dia, itens: linhas });
      if (!r.ok) return setErro(r.message);
      setMexeu(false);
      router.push("/admin/compras/listas");
    });
  }

  return (
    <div className="space-y-4">
      <CartaoDeSecao icone={Truck} titulo="Fornecedor" frase="Quem entrega nesta compra de rotina.">
        {fornecedor ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-medium">{fornecedor.nome}</span>
            {lista === null && (
              <Button type="button" size="sm" variant="outline" onClick={() => escolherFornecedor(null)}>
                Trocar
              </Button>
            )}
          </div>
        ) : (
          <div className="max-w-sm text-sm">
            <label className="block">
              <span className="mb-1 block font-medium">Nome do fornecedor</span>
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (achados.length > 0) escolherFornecedor(achados[0].id);
                }}
                placeholder="Buscar pelo nome"
                className="h-10 w-full"
                autoFocus
              />
            </label>
            {achados.length > 0 && (
              <ul className="mt-1 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {achados.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => escolherFornecedor(f.id)}
                      className="w-full px-3 py-2.5 text-left hover:bg-[var(--muted)]"
                    >
                      {f.nome}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {termo !== "" && achados.length === 0 && (
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">Nenhum fornecedor com esse nome.</p>
            )}
          </div>
        )}
      </CartaoDeSecao>

      {fornecedor && (
        <CartaoDeSecao icone={CalendarDays} titulo="Dia da semana" frase="No dia, a contagem desta rotina vira pedido.">
          <div>
            <div className="flex flex-wrap gap-1.5">
              {ORDEM_DOS_DIAS.map((d) => {
                const ja = ocupado(d);
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={ja !== null}
                    aria-pressed={dia === d}
                    onClick={() => {
                      setDia(d);
                      setMexeu(true);
                    }}
                    title={ja ? `${fornecedor.nome} já tem a ${DIAS_DA_SEMANA[d]}` : undefined}
                    className="chip px-3 py-2 text-sm capitalize disabled:opacity-40"
                  >
                    {DIAS_DA_SEMANA[d].slice(0, 3)}
                  </button>
                );
              })}
            </div>
            {fornecedor.dias.some((x) => x.listaId !== lista?.id) && (
              <p className="hint">
                Já cadastrados:{" "}
                {fornecedor.dias
                  .filter((x) => x.listaId !== lista?.id)
                  .sort((a, b) => ORDEM_DOS_DIAS.indexOf(a.dia) - ORDEM_DOS_DIAS.indexOf(b.dia))
                  .map((x, i) => (
                    <span key={x.listaId}>
                      {i > 0 && ", "}
                      <Link href={`/admin/compras/listas/${x.listaId}`} className="text-[var(--primary)] underline underline-offset-2">
                        {DIAS_DA_SEMANA[x.dia]}
                      </Link>
                    </span>
                  ))}
                .
              </p>
            )}
          </div>
        </CartaoDeSecao>
      )}

      {fornecedor && dia !== null && (
        <CartaoDeSecao
          icone={ShoppingBasket}
          titulo={
            <>
              Produtos e estoque ideal na <span className="capitalize">{DIAS_DA_SEMANA[dia]}</span>
            </>
          }
          frase="O pedido sai com o ideal menos o contado."
        >
          {linhas.length > 0 && (
            <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] text-sm">
              {linhas.map((l) => {
                const p = porId.get(l.produtoId);
                const nome = p?.nome ?? "Produto desativado";
                return (
                  <li key={l.produtoId} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{nome}</p>
                      {(p?.lote != null || sugeridos[l.produtoId]) && (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          {p?.lote != null && `lote de ${formatAmount(p.lote)}`}
                          {p?.lote != null && sugeridos[l.produtoId] && " · "}
                          {sugeridos[l.produtoId] && (
                            <span className="text-[var(--warn)]">estoquista sugeriu {sugeridos[l.produtoId]}</span>
                          )}
                        </p>
                      )}
                    </div>
                    <input
                      inputMode="decimal"
                      value={l.ideal}
                      onChange={(e) => digitar(l.produtoId, e.target.value)}
                      placeholder="ideal"
                      aria-label={`Estoque ideal de ${nome}`}
                      className={`field num-display h-10 w-20 shrink-0 bg-[var(--surface)] px-2 py-0 text-right ${
                        l.ideal.trim() === "" ? "border-[var(--warn)]" : ""
                      }`}
                    />
                    <span className="w-8 shrink-0 text-xs text-[var(--muted-foreground)]">
                      {p ? UNIT_LABEL[p.unidade] : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setLinhas((ls) => ls.filter((x) => x.produtoId !== l.produtoId));
                        setMexeu(true);
                      }}
                      aria-label={`Tirar ${nome}`}
                      title="Tirar deste dia"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <SeletorDeProduto
            soProduto
            focarAoAbrir={linhas.length === 0}
            produtos={produtos
              .filter((p) => !naLista.has(p.id))
              .map((p) => ({
                id: p.id,
                nome: p.nome,
                unidade: p.unidade,
                lote: p.lote,
                doFornecedor: p.fornecedorIds.includes(fornecedor.id),
              }))}
            aoAcrescentar={async (produtoId) => {
              setLinhas((ls) => (ls.some((l) => l.produtoId === produtoId) ? ls : [...ls, { produtoId, ideal: "" }]));
              setMexeu(true);
              return null;
            }}
          />
        </CartaoDeSecao>
      )}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {fornecedor && dia !== null && (
        <div className="sticky bottom-[calc(var(--barra-de-baixo)+0.75rem)] z-10 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--primary)] bg-[var(--card)] p-3 shadow-lg">
          <p className="min-w-0 flex-1 text-sm">
            {fornecedor.nome} · <span className="capitalize">{DIAS_DA_SEMANA[dia]}</span> · {linhas.length}{" "}
            {linhas.length === 1 ? "produto" : "produtos"}
          </p>
          <Button type="button" className="h-10" disabled={pendente} onClick={salvar}>
            {pendente ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      )}

      {lista && (
        <div className="space-y-2">
          <CartaoDeBotoes>
            <BotaoQuadrado
              icone={Power}
              texto={lista.ativa ? "Desligar" : "Ligar"}
              dica="Ligada: no dia, a contagem vira pedido"
              desligado={pendenteDaAcao}
              onClick={() => rodar(() => ligarDiaDaRotina(lista.id, !lista.ativa))}
            />
            {!peloLink && (
              <ConfirmarNaLinha
                pergunta={
                  <>
                    Apagar a <span className="capitalize">{DIAS_DA_SEMANA[lista.dia]}</span> de <strong>{fornecedor?.nome}</strong>? Os
                    pedidos que já saíram dela continuam.
                  </>
                }
                pendente={pendenteDaAcao}
                aoConfirmar={() =>
                  rodar(
                    () => apagarDiaDaRotina(lista.id),
                    () => {
                      setMexeu(false);
                      router.push("/admin/compras/listas");
                    },
                  )
                }
              >
                {(abrir) => <BotaoQuadrado icone={Trash2} texto="Apagar dia" tom="perigo" desligado={pendenteDaAcao} onClick={abrir} />}
              </ConfirmarNaLinha>
            )}
          </CartaoDeBotoes>
          {erroDaAcao && (
            <p role="alert" className="msg-error">
              {erroDaAcao}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
