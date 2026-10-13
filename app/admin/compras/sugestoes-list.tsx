"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  apontarProdutoNovoPara,
  autorizarProdutoNovo,
  recusarProdutoNovo,
} from "@/lib/actions/compras";
import { SEM_CATEGORIA, UNIT_LABEL, chave, plural } from "@/lib/format";
import type { ProductUnit } from "@/generated/prisma/client";

export type Sugestao = {
  id: number;
  nome: string;
  unit: ProductUnit;
  categoryId: number | null;
  quantidade: number;
  contadoEmTexto: string;
  responsavel: string | null;
};

type Categoria = { id: number; name: string };
type DoCatalogo = { id: number; name: string; isActive: boolean };

const UNIDADES = Object.keys(UNIT_LABEL) as ProductUnit[];

/**
 * O que o estoquista achou na prateleira e ainda não é produto.
 *
 * Fora de `products-list.tsx` de propósito. Aquele arquivo tem mil e
 * quinhentas linhas e uma máquina de rascunho com gravação automática por id
 * de produto — e sugestão não tem id de produto, então dividir aqueles
 * `Record<number, …>` faria a sugestão 3 e o produto 3 colidirem em cinco
 * lugares. Pior: um formulário de aprovação que grava sozinho é uma máquina de
 * aprovar sem querer. Este só escreve no botão.
 *
 * Só o que está pendente aparece. Recusado fica no banco e some da tela — uma
 * aba de recusados seria exatamente a poluição que o dono reclama.
 */
export function SugestoesPendentes({
  sugestoes,
  categorias,
  catalogo,
}: {
  sugestoes: Sugestao[];
  categorias: Categoria[];
  catalogo: DoCatalogo[];
}) {
  return (
    <section className="card-alerta p-3">
      <p className="text-sm font-medium">
        {plural(sugestoes.length, "produto novo", "produtos novos")} da contagem
        esperando você autorizar
      </p>
      <ul className="mt-2 divide-y divide-[var(--border)]">
        {sugestoes.map((s) => (
          <Linha key={s.id} s={s} categorias={categorias} catalogo={catalogo} />
        ))}
      </ul>
    </section>
  );
}

function Linha({
  s,
  categorias,
  catalogo,
}: {
  s: Sugestao;
  categorias: Categoria[];
  catalogo: DoCatalogo[];
}) {
  const [nome, setNome] = useState(s.nome);
  const [unit, setUnit] = useState<ProductUnit>(s.unit);
  const [categoryId, setCategoryId] = useState(
    s.categoryId === null ? "" : String(s.categoryId),
  );
  const [quantidade, setQuantidade] = useState(
    String(s.quantidade).replace(".", ","),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  /**
   * O produto que já existe e se parece com este.
   *
   * O caso que mais acontece, e não a exceção: a contagem só carrega produto
   * ATIVO das gavetas escolhidas, então tudo que foi desativado é invisível
   * para o estoquista — e item desativado que voltou para a prateleira é
   * exatamente o que ele lança como novo. Sem este aviso, autorizar criaria um
   * segundo cadastro com o mesmo nome, porque `Product.name` não tem índice
   * único para segurar.
   *
   * Comparado com a mesma régua da busca, no nome que está no campo agora — se
   * o dono corrige "tomate ital." para "Tomate italiano", o parecido aparece.
   */
  const parecido = catalogo.find((p) => chave(p.name) === chave(nome));

  /**
   * `recarregar` só no caminho que mexe numa linha que já está na tela.
   *
   * A grade abaixo guarda um rascunho por produto, montado uma vez quando a
   * tela abriu, e é dele que ela desenha os campos. Autorizar cria um produto
   * novo, que não tem rascunho e cai no valor do servidor — esse aparece
   * certo. Mas religar escreve o estoque de um produto que JÁ tinha rascunho,
   * e a revalidação não desfaz o que está guardado no navegador: a linha
   * continuaria mostrando o número velho, dizendo que a contagem não valeu.
   *
   * Recarregar a página inteira é grosseiro para uma ação frequente, e esta
   * não é: acontece quando um item desativado volta para a prateleira. O
   * conserto fino seria sincronizar os rascunhos da grade, e isso é mexer no
   * arquivo de mil e quinhentas linhas por causa de um caso raro.
   */
  function agir(
    f: () => Promise<{ ok: boolean; message?: string }>,
    recarregar = false,
  ) {
    setErro(null);
    startTransition(async () => {
      const r = await f();
      if (!r.ok) return setErro(r.message ?? "Não deu certo.");
      if (recarregar) window.location.reload();
    });
  }

  const dados = { nome, unit, categoryId, quantidade };

  return (
    <li className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_5rem_5rem_9rem_auto] sm:items-center">
      <Input
        // "do produto novo", e não "do produto": a grade logo abaixo tem um
        // campo com o mesmo papel, e dois rótulos idênticos na mesma tela
        // deixam quem usa leitor de tela sem saber em qual está.
        aria-label="Nome do produto novo"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        className="h-8 font-medium"
      />
      <Input
        aria-label="Quantidade contada"
        inputMode="decimal"
        value={quantidade}
        onChange={(e) => setQuantidade(e.target.value)}
        className="h-8 text-right tabular-nums"
      />
      <select
        aria-label="Unidade"
        value={unit}
        onChange={(e) => setUnit(e.target.value as ProductUnit)}
        className="field h-8 py-0 text-sm"
      >
        {UNIDADES.map((u) => (
          <option key={u} value={u}>
            {UNIT_LABEL[u]}
          </option>
        ))}
      </select>
      <select
        aria-label="Categoria"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="field h-8 py-0 text-sm"
      >
        <option value="">{SEM_CATEGORIA}</option>
        {categorias.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pendente}
          onClick={() => agir(() => autorizarProdutoNovo(s.id, dados))}
        >
          Autorizar
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pendente}
          onClick={() => agir(() => recusarProdutoNovo(s.id))}
        >
          Recusar
        </Button>
      </div>

      {parecido && (
        <p className="col-span-full text-xs">
          Já existe <strong>{parecido.name}</strong>
          {!parecido.isActive && " (desativado)"} no cadastro.{" "}
          <button
            type="button"
            disabled={pendente}
            onClick={() =>
              agir(
                () =>
                  apontarProdutoNovoPara(
                    s.id,
                    parecido.id,
                    Number(quantidade.replace(",", ".")),
                  ),
                true,
              )
            }
            className="font-medium text-[var(--primary)] underline underline-offset-4"
          >
            {parecido.isActive ? "usar esse" : "religar esse"}
          </button>{" "}
          em vez de criar outro.
        </p>
      )}

      <p className="col-span-full text-xs text-[var(--muted-foreground)]">
        {/* A data importa: a quantidade é de uma prateleira daquele dia, e
            autorizar amanhã escreveria o número de ontem como estoque de hoje
            sem ninguém ver. Aqui ele vê, e o campo está do lado para corrigir. */}
        contado em {s.contadoEmTexto}
        {s.responsavel && ` por ${s.responsavel}`}
      </p>

      {erro && (
        <p role="alert" className="col-span-full error">
          {erro}
        </p>
      )}
    </li>
  );
}
