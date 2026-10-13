"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fornecedorParaEditar,
  saveSupplier,
  type FornecedorParaEditar,
} from "@/lib/actions/compras";
import { maskPhoneBR } from "@/lib/phone-mask";

const VAZIO: FornecedorParaEditar = {
  name: "",
  apelido: "",
  contactName: "",
  phone: "",
  deliveryDays: "",
  deliveryWeekdays: "",
  paymentTerms: "",
  minOrder: "",
  notes: "",
  isActive: true,
  categoryIds: [],
};

/**
 * Ajustar um fornecedor sem sair da cotação.
 *
 * É aqui que os erros aparecem: gerando link para sete fornecedores é que se
 * vê o telefone faltando, o mínimo desatualizado, a gaveta que ninguém
 * marcou. Sair para Fornecedores, achar o cadastro, voltar e perder de vista
 * quem já foi chamado era o suficiente para não corrigir.
 *
 * Carrega o fornecedor INTEIRO ao abrir, e não da lista da tela.
 * `saveSupplier` grava o fornecedor inteiro: um painel que conhecesse só os
 * campos que mostra apagaria o prazo e a condição de pagamento ao salvar
 * o nome. Os campos que ele não mostra viajam intactos, de ida e de volta. É a
 * mesma defesa que o painel de produto da conferência usa, e pela mesma razão
 * — lá o estrago silencioso era o lote de compra.
 *
 * Mostra o que se decide AQUI: nome, telefone, pedido mínimo, prazo e as
 * gavetas. O resto do cadastro continua em Fornecedores, que é a tela do
 * cadastro; repeti-lo aqui faria duas telas para a mesma coisa, e a segunda
 * envelheceria.
 */
export function FornecedorPanel({
  supplierId,
  categorias,
  categoriasDaCotacao,
  aoFechar,
}: {
  /** Nulo cria um fornecedor novo. */
  supplierId: number | null;
  categorias: { id: number; name: string }[];
  /** As gavetas dos itens desta cotação. Sem uma delas, ele não aparece aqui. */
  categoriasDaCotacao: number[];
  aoFechar: () => void;
}) {
  const [d, setD] = useState<FornecedorParaEditar | null>(
    supplierId === null ? VAZIO : null,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  useEffect(() => {
    if (supplierId === null) return;
    let cancelado = false;
    fornecedorParaEditar(supplierId).then((r) => {
      if (cancelado) return;
      if (r.ok) setD(r.data);
      else setErro(r.message);
    });
    return () => {
      cancelado = true;
    };
  }, [supplierId]);

  function mexer(troca: Partial<FornecedorParaEditar>) {
    setD((a) => (a === null ? a : { ...a, ...troca }));
  }

  function alternarCategoria(id: number) {
    setD((a) =>
      a === null
        ? a
        : {
            ...a,
            categoryIds: a.categoryIds.includes(id)
              ? a.categoryIds.filter((x) => x !== id)
              : [...a.categoryIds, id],
          },
    );
  }

  function salvar() {
    if (d === null) return;
    setErro(null);
    startTransition(async () => {
      const r = await saveSupplier(supplierId, d);
      if (!r.ok) return setErro(r.message ?? "Não foi possível salvar.");
      aoFechar();
    });
  }

  if (d === null) {
    return (
      <div className="card mt-2 p-2.5 text-sm text-[var(--muted-foreground)]">
        {erro ?? "Carregando…"}
      </div>
    );
  }

  const daCotacao = new Set(categoriasDaCotacao);

  /* Um fornecedor que não atende nenhuma gaveta desta cotação não vai
     aparecer nela — a lista sai de quem cobre as categorias dos itens. Dizer
     isso ANTES de salvar evita o cadastro que some no instante seguinte e a
     pergunta de para onde ele foi. */
  const foraDaLista =
    daCotacao.size > 0 && !d.categoryIds.some((c) => daCotacao.has(c));

  return (
    <div className="card mt-2 space-y-3 p-2.5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="forn-nome">
            Razão social
          </label>
          <Input
            id="forn-nome"
            autoFocus
            value={d.name}
            onChange={(e) => mexer({ name: e.target.value })}
            className="h-9"
          />
        </div>

        <div>
          <label className="label" htmlFor="forn-apelido">
            Apelido
          </label>
          <Input
            id="forn-apelido"
            value={d.apelido}
            onChange={(e) => mexer({ apelido: e.target.value })}
            maxLength={40}
            placeholder={d.name.split(" ")[0] || "Himalaia"}
            className="h-9"
          />
          {/* A dica diz PARA QUE serve, e não o que é.
              "Apelido" sozinho convida a escrever o nome inteiro de novo —
              e aí a coluna estreita continua estreita e o apelido não
              resolve nada. */}
          <p className="hint mt-1">
            Como a casa chama ele. É o que aparece nas colunas da cotação, onde
            a razão social não cabe. Vazio, vale o nome completo.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="forn-fone">
            Telefone
          </label>
          <Input
            id="forn-fone"
            inputMode="tel"
            value={d.phone}
            // A máscara é a mesma do cadastro: o WhatsApp sai daqui, e dois
            // formatos de telefone no banco viram dois jeitos de falhar.
            onChange={(e) => mexer({ phone: maskPhoneBR(e.target.value) })}
            placeholder="(51) 99999-9999"
            className="h-9"
          />
        </div>

        <div>
          <label className="label" htmlFor="forn-minimo">
            Pedido mínimo
          </label>
          <Input
            id="forn-minimo"
            inputMode="decimal"
            value={d.minOrder}
            onChange={(e) => mexer({ minOrder: e.target.value })}
            placeholder="150,00"
            className="h-9"
          />
        </div>

        <div>
          <label className="label" htmlFor="forn-prazo">
            Prazo de entrega <span className="font-normal">(dias)</span>
          </label>
          <Input
            id="forn-prazo"
            inputMode="numeric"
            value={d.deliveryDays}
            onChange={(e) => mexer({ deliveryDays: e.target.value })}
            placeholder="3"
            className="h-9"
          />
        </div>
      </div>

      <div>
        <p className="label">O que ele atende</p>
        <div className="flex flex-wrap gap-1.5">
          {categorias.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => alternarCategoria(c.id)}
              aria-pressed={d.categoryIds.includes(c.id)}
              className="chip"
            >
              {c.name}
              {/* A gaveta que esta cotação usa, marcada. São catorze no
                  cadastro e quase sempre duas nesta rodada — sem a marca ele
                  procuraria as certas uma a uma. */}
              {daCotacao.has(c.id) && (
                <span aria-hidden className="ml-1 text-[var(--primary)]">
                  •
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {foraDaLista && (
        <p className="msg-warn">
          Sem nenhuma das gavetas desta cotação (marcadas com •), ele não vai
          aparecer nesta lista. O cadastro fica salvo e ele aparece nas rodadas
          das gavetas que você marcar.
        </p>
      )}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pendente || d.name.trim().length < 2}
          onClick={salvar}
        >
          {pendente ? "Salvando…" : supplierId === null ? "Cadastrar" : "Salvar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={aoFechar}>
          cancelar
        </Button>

        {/* O resto do cadastro tem tela própria, e o caminho para ela fica
            dito aqui — senão este painel viraria o cadastro inteiro por
            acréscimo. */}
        <p className="text-xs text-[var(--muted-foreground)]">
          A condição de pagamento fica em Fornecedores.
        </p>
      </div>
    </div>
  );
}
