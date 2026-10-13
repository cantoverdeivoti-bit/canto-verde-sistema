"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";

import { Input } from "@/components/ui/input";
import { cadastroRapidoFornecedor, cadastroRapidoProduto } from "@/lib/actions/compras";
import { UNIT_LABEL } from "@/lib/format";
import { maskPhoneBR } from "@/lib/phone-mask";
import type { ProductUnit } from "@/generated/prisma/client";

const UNIDADES = Object.keys(UNIT_LABEL) as ProductUnit[];

/** A moldura dos dois: título, o ✕ para fechar e o erro embaixo. */
function Moldura({
  titulo,
  aoFechar,
  erro,
  children,
  aoEnviar,
}: {
  titulo: string;
  aoFechar: () => void;
  erro: string | null;
  children: React.ReactNode;
  aoEnviar: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        aoEnviar();
      }}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{titulo}</p>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="inline-flex size-7 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">{children}</div>
      {erro && (
        <p role="alert" className="mt-2 text-xs" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
    </form>
  );
}

function BotaoSalvar({ pendente }: { pendente: boolean }) {
  return (
    <button
      type="submit"
      disabled={pendente}
      className="h-10 rounded-lg bg-[var(--botao)] px-4 text-sm font-medium text-[var(--botao-texto)] disabled:opacity-60"
    >
      {pendente ? "Salvando…" : "Cadastrar"}
    </button>
  );
}

/**
 * Fornecedor novo sem sair do pedido: nome e telefone. O resto do cadastro
 * se completa depois, em Fornecedores.
 */
export function CadastroRapidoFornecedor({
  nomeInicial = "",
  aoCriar,
  aoFechar,
}: {
  /** O que estava na busca — quem não achou, geralmente já digitou o nome. */
  nomeInicial?: string;
  aoCriar: (f: { id: number; nome: string }) => void;
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState(nomeInicial);
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const r = await cadastroRapidoFornecedor(nome, telefone);
      if (!r.ok) return setErro(r.message);
      aoCriar({ id: r.id, nome: nome.trim() });
    });
  }

  return (
    <Moldura titulo="Cadastrar fornecedor" aoFechar={aoFechar} erro={erro} aoEnviar={salvar}>
      <label className="min-w-0 flex-1 basis-48 text-xs">
        <span className="mb-1 block text-[var(--muted-foreground)]">Nome</span>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 w-full" autoFocus />
      </label>
      <label className="w-40 text-xs">
        <span className="mb-1 block text-[var(--muted-foreground)]">WhatsApp</span>
        <Input
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(maskPhoneBR(e.target.value))}
          placeholder="(51) 99999-9999"
          className="h-9 w-full"
        />
      </label>
      <BotaoSalvar pendente={pendente} />
    </Moldura>
  );
}

/**
 * Produto novo sem sair do pedido: nome, unidade e categoria. Já nasce
 * ligado ao fornecedor do pedido e entra na lista. Estoque ideal, lote e
 * marcas se completam depois, em Produtos.
 */
export function CadastroRapidoProduto({
  fornecedorId,
  categorias,
  aoCriar,
  aoFechar,
}: {
  /** Nulo: ainda sem fornecedor (o mercado da nota que vai ser cadastrado). */
  fornecedorId: number | null;
  categorias: { id: number; name: string }[];
  aoCriar: (p: { id: number; nome: string; unidade: ProductUnit }) => void;
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [unidade, setUnidade] = useState<ProductUnit>("UN");
  const [categoriaId, setCategoriaId] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const r = await cadastroRapidoProduto(
        nome,
        unidade,
        categoriaId === "" ? null : Number(categoriaId),
        fornecedorId,
      );
      if (!r.ok) return setErro(r.message);
      aoCriar({ id: r.id, nome: nome.trim(), unidade });
    });
  }

  return (
    <Moldura titulo="Cadastrar produto" aoFechar={aoFechar} erro={erro} aoEnviar={salvar}>
      <label className="min-w-0 flex-1 basis-48 text-xs">
        <span className="mb-1 block text-[var(--muted-foreground)]">Nome</span>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="h-9 w-full" autoFocus />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted-foreground)]">Unidade</span>
        <select
          value={unidade}
          onChange={(e) => setUnidade(e.target.value as ProductUnit)}
          className="field h-9 w-24"
        >
          {UNIDADES.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--muted-foreground)]">Categoria</span>
        <select
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          className="field h-9 w-40"
        >
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <BotaoSalvar pendente={pendente} />
    </Moldura>
  );
}
