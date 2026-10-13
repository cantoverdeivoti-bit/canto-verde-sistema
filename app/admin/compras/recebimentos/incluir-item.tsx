"use client";

import { PackagePlus, Plus, Trash2 } from "lucide-react";
import { createContext, useContext, useState } from "react";

import { UNIT_LABEL, formatAmount, formatMoney } from "@/lib/format";
import type { ProdutoComFornecedores } from "@/lib/produtos-para-pedido";
import type { ProductUnit } from "@/generated/prisma/client";

import { CadastroRapidoProduto } from "../pedido-manual/cadastro-rapido";
import { SeletorDeProduto } from "../pedidos/seletor-de-produto";

/** O que veio sem estar no pedido, como a conferência guarda até dar entrada. */
export type ItemIncluido = {
  produtoId: number;
  nome: string;
  unidade: ProductUnit;
  quantidade: number;
  preco: number;
};

type ParaIncluir = {
  produtos: ProdutoComFornecedores[];
  categorias: { id: number; name: string }[];
};

/*
 * A lista de produtos mora num contexto, e não numa prop de cada pedido: a
 * tela de Recebimentos é de servidor e cada pedido é um componente de
 * cliente, então a lista (trezentos e poucos produtos) iria repetida no
 * HTML uma vez por pedido esperando. Aqui ela vai uma vez só.
 *
 * Fora de Recebimentos não há provedor, e o botão de incluir não aparece:
 * só Recebimentos dá entrada.
 */
const Contexto = createContext<ParaIncluir | null>(null);

export function ProvedorDeInclusao({ children, ...valor }: ParaIncluir & { children: React.ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** Se a conferência desta tela pode incluir itens. */
export function useInclusao(): ParaIncluir | null {
  return useContext(Contexto);
}

/**
 * Incluir na conferência o que o fornecedor mandou sem estar no pedido.
 *
 * Preço da nota obrigatório (decisão do dono): sem ele o estoque entraria
 * sem custo e a divergência não diria quanto vale. O produto que já está no
 * pedido não aparece na busca: o que veio dele se acerta na linha dele.
 */
export function IncluirItem({
  fornecedorId,
  noPedido,
  incluidos,
  aoMudar,
  pendente,
}: {
  fornecedorId: number;
  /** Os produtos que já estão no pedido. */
  noPedido: Set<number>;
  incluidos: ItemIncluido[];
  aoMudar: (novos: ItemIncluido[]) => void;
  pendente: boolean;
}) {
  const dados = useInclusao();
  const [aberto, setAberto] = useState(false);
  const [cadastrando, setCadastrando] = useState(false);
  /* O produto acabado de cadastrar entra na busca já, sem esperar a tela
     recarregar a lista. */
  const [novos, setNovos] = useState<ProdutoComFornecedores[]>([]);
  if (!dados) return null;

  const produtos = [...dados.produtos, ...novos].filter((p) => !noPedido.has(p.id));

  return (
    <div className="mt-2 space-y-2">
      {incluidos.length > 0 && (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm">
          {incluidos.map((x) => (
            <li
              key={x.produtoId}
              className="flex items-center gap-2 border-l-[3px] px-2.5 py-2"
              style={{ borderLeftColor: "var(--warn)" }}
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{x.nome}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  <span className="selo mr-1.5" style={{ color: "var(--warn)" }}>
                    fora do pedido
                  </span>
                  <span className="num-display">
                    {formatAmount(x.quantidade)} {UNIT_LABEL[x.unidade]} × {formatMoney(x.preco)} ={" "}
                    {formatMoney(x.quantidade * x.preco)}
                  </span>
                </span>
              </span>
              <button
                type="button"
                disabled={pendente}
                aria-label={`Tirar ${x.nome}`}
                title="Tirar"
                onClick={() => aoMudar(incluidos.filter((i) => i.produtoId !== x.produtoId))}
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:text-[var(--destructive)]"
              >
                <Trash2 aria-hidden className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!aberto ? (
        <button
          type="button"
          disabled={pendente}
          onClick={() => setAberto(true)}
          className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 text-sm font-medium text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
        >
          <Plus aria-hidden className="size-4" />
          Incluir item que veio fora do pedido
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-dashed border-[var(--border)] p-2.5">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm font-medium">Fora do pedido</p>
            <button
              type="button"
              onClick={() => setCadastrando((c) => !c)}
              aria-label="Cadastrar produto"
              title="Cadastrar produto"
              className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium hover:border-[var(--primary)] hover:text-[var(--primary)] ${
                cadastrando ? "border-[var(--primary)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--muted-foreground)]"
              }`}
            >
              <PackagePlus aria-hidden className="size-4" />
              Cadastrar
            </button>
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                setCadastrando(false);
              }}
              className="h-10 rounded-lg px-2.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            >
              fechar
            </button>
          </div>

          {cadastrando && (
            <CadastroRapidoProduto
              fornecedorId={fornecedorId}
              categorias={dados.categorias}
              aoFechar={() => setCadastrando(false)}
              aoCriar={(p) => {
                setNovos((a) => [
                  ...a,
                  { id: p.id, nome: p.nome, unidade: p.unidade, lote: null, fornecedorIds: [fornecedorId] },
                ]);
                setCadastrando(false);
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
              // Chegou o que chegou: o lote de compra não vale aqui.
              lote: null,
              doFornecedor: p.fornecedorIds.includes(fornecedorId),
            }))}
            aoAcrescentar={async (produtoId, quantidade, preco) => {
              if (preco === null || preco <= 0) return "Digite o preço da nota.";
              const p = produtos.find((x) => x.id === produtoId);
              if (!p) return "Produto não encontrado.";
              // O mesmo produto de novo soma na linha dele, com o preço novo.
              const ja = incluidos.find((i) => i.produtoId === produtoId);
              aoMudar(
                ja
                  ? incluidos.map((i) =>
                      i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + quantidade, preco } : i,
                    )
                  : [...incluidos, { produtoId, nome: p.nome, unidade: p.unidade, quantidade, preco }],
              );
              return null;
            }}
          />
        </div>
      )}
    </div>
  );
}
