"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { criarLancamento, editarLancamento } from "@/lib/actions/financeiro";
import { dividirEmParcelas } from "@/lib/financeiro-calculo";
import type { LancamentoNaTela, OpcoesDoFinanceiro } from "@/lib/financeiro-dados";
import { formatMoney, lerNumeroBR, precoNoCampo } from "@/lib/format";

import { useAcao } from "@/lib/use-acao";
import { OpcoesDeCategoria } from "./opcoes-de-categoria";

/**
 * Lançar ou editar uma conta. A competência acompanha o vencimento até a
 * pessoa mexer nela: a luz de setembro que vence em outubro é o caso que
 * pede o campo separado, e é a exceção.
 */
export function LancamentoForm({
  tipo,
  opcoes,
  hoje,
  existente,
  fechar,
}: {
  tipo: "PAGAR" | "RECEBER";
  opcoes: OpcoesDoFinanceiro;
  hoje: string;
  existente?: LancamentoNaTela;
  fechar: () => void;
}) {
  const categorias = opcoes.categorias.filter((c) => c.tipo === tipo);
  const [v, setV] = useState({
    descricao: existente?.descricao ?? "",
    valor: existente ? precoNoCampo(existente.valor) : "",
    vencimento: existente?.vencimento ?? hoje,
    competencia: existente?.competencia ?? hoje.slice(0, 7),
    categoriaId: existente?.categoria.id ?? null,
    contaId: existente?.conta?.id ?? null,
    fornecedorId: existente?.fornecedor?.id ?? null,
    centroCustoId: existente?.centro?.id ?? null,
    documento: existente?.documento ?? "",
    observacao: existente?.observacao ?? "",
    parcelas: "1",
  });
  // O centro segue a sugestão da categoria até a pessoa escolher outro.
  const [centroEscolhido, setCentroEscolhido] = useState(existente !== undefined);
  const [competenciaSolta, setCompetenciaSolta] = useState(existente ? existente.competencia !== existente.vencimento.slice(0, 7) : false);
  const { erro, pendente, rodar } = useAcao();
  const muda = <K extends keyof typeof v>(k: K, valor: (typeof v)[K]) => setV((a) => ({ ...a, [k]: valor }));

  const nParcelas = Number(v.parcelas);
  const valor = lerNumeroBR(v.valor) ?? 0;
  const pagar = tipo === "PAGAR";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.categoriaId === null) return;
        const dados = { ...v, tipo, categoriaId: v.categoriaId };
        rodar(() => (existente ? editarLancamento(existente.id, dados) : criarLancamento(dados)), fechar);
      }}
      // Sem moldura própria: quem abre o formulário já dá o cartão (o dos
      // quadrados, na conta nova; a linha da lista, na edição).
      className="space-y-4"
    >
      {/* Os campos curtos em pares no celular e quatro por linha no
          computador: valor e datas primeiro, depois as escolhas, que pedem
          a linha inteira no celular para o nome caber. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <label className="col-span-2 lg:col-span-4">
          <span className="label">Descrição</span>
          <Input
            value={v.descricao}
            onChange={(e) => muda("descricao", e.target.value)}
            required
            maxLength={120}
            autoFocus
            placeholder={pagar ? "Conta de luz, nota 1234 da Himalaia" : "Aluguel do salão, evento da Ana"}
          />
        </label>
        <label>
          <span className="label">Valor (R$)</span>
          <Input inputMode="decimal" value={v.valor} onChange={(e) => muda("valor", e.target.value)} placeholder="0,00" required />
        </label>
        <label>
          <span className="label">{nParcelas > 1 ? "Vencimento da 1ª parcela" : "Vencimento"}</span>
          <Input
            type="date"
            value={v.vencimento}
            onChange={(e) => {
              const d = e.target.value;
              setV((a) => ({ ...a, vencimento: d, competencia: competenciaSolta || !d ? a.competencia : d.slice(0, 7) }));
            }}
            required
          />
        </label>
        <label>
          <span className="label">Mês de competência</span>
          <Input
            type="month"
            value={v.competencia}
            onChange={(e) => {
              setCompetenciaSolta(true);
              muda("competencia", e.target.value);
            }}
            disabled={nParcelas > 1}
            required
          />
          <span className="hint block">O mês a que a conta pertence na DRE.{nParcelas > 1 && " Parcelado, cada parcela fica no mês em que vence."}</span>
        </label>
        <label>
          <span className="label">Documento</span>
          <Input value={v.documento} onChange={(e) => muda("documento", e.target.value)} maxLength={60} placeholder="Nota, boleto" />
        </label>
        <label className="col-span-2 sm:col-span-1">
          <span className="label">Categoria</span>
          <select
            value={v.categoriaId ?? ""}
            onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null;
              const sugerido = categorias.find((c) => c.id === id)?.centroPadraoId ?? null;
              setV((a) => ({ ...a, categoriaId: id, centroCustoId: centroEscolhido ? a.centroCustoId : sugerido }));
            }}
            className="field"
            required
          >
            <OpcoesDeCategoria categorias={categorias} atual={existente?.categoria} />
          </select>
        </label>
        {pagar && (
          <label className="col-span-2 sm:col-span-1">
            <span className="label">Fornecedor</span>
            <select value={v.fornecedorId ?? ""} onChange={(e) => muda("fornecedorId", e.target.value ? Number(e.target.value) : null)} className="field">
              <option value="">Nenhum</option>
              {opcoes.fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="col-span-2 sm:col-span-1">
          <span className="label">Centro de custo</span>
          <select
            value={v.centroCustoId ?? ""}
            onChange={(e) => {
              setCentroEscolhido(true);
              muda("centroCustoId", e.target.value ? Number(e.target.value) : null);
            }}
            className="field"
          >
            <option value="">Sem centro</option>
            {opcoes.centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-2 sm:col-span-1">
          <span className="label">{pagar ? "Sai de qual conta" : "Entra em qual conta"}</span>
          <select value={v.contaId ?? ""} onChange={(e) => muda("contaId", e.target.value ? Number(e.target.value) : null)} className="field">
            <option value="">Decido na baixa</option>
            {opcoes.contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        {!existente && (
          <label>
            <span className="label">Parcelas</span>
            <Input inputMode="numeric" value={v.parcelas} onChange={(e) => muda("parcelas", e.target.value)} />
            {nParcelas > 1 && valor > 0 && Number.isInteger(nParcelas) && nParcelas <= 60 && (
              <span className="hint block">
                {nParcelas} × {formatMoney(dividirEmParcelas(valor, nParcelas)[1])}, uma por mês.
              </span>
            )}
          </label>
        )}
        <label className="col-span-2 lg:col-span-4">
          <span className="label">Observação</span>
          <Textarea value={v.observacao} onChange={(e) => muda("observacao", e.target.value)} rows={2} maxLength={1000} />
        </label>
      </div>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pendente || v.categoriaId === null}>
          {pendente ? "Salvando…" : existente ? "Salvar" : "Lançar"}
        </Button>
        <Button type="button" variant="ghost" onClick={fechar}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
