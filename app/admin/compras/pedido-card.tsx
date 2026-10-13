"use client";

import { AlertTriangle, Ban, Check, Gift, ListChecks, PackageX, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { BotaoQuadrado, FileiraDeBotoes } from "@/components/botao-quadrado";
import { CaixaDeConfirmacao } from "@/components/confirmar-na-linha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Estrelas } from "@/components/estrelas";
import { cancelarPedido, naoFoiEntregue, receberPedido } from "@/lib/actions/pedido";
import {
  ESTADO_DA_BONIFICACAO,
  bonificacaoPorExtenso,
  eMercadoria,
  type BonificacaoParaMostrar,
} from "@/lib/bonificacoes";
import { NOTA_QUE_PEDE_MOTIVO, erroDaNota } from "@/lib/qualidade-regra";
import { enterProximoValor } from "@/lib/enter-proximo-valor";
import { corDoTom, rotuloDoPedido } from "@/lib/cotacao-labels";
import { UNIT_LABEL, formatAmount, formatMoney, lerNumeroBR, precoNoCampo } from "@/lib/format";
import type { PedidoCompraStatus, ProductUnit } from "@/generated/prisma/client";

import { IncluirItem, type ItemIncluido } from "./recebimentos/incluir-item";

export type PedidoRow = {
  id: number;
  fornecedor: string;
  /** Para incluir na conferência o que veio fora do pedido (Recebimentos). */
  fornecedorId?: number;
  estatus: PedidoCompraStatus;
  total: number;
  entregaConfirmada: boolean;
  /** "2026-09-24" — quando deve chegar. Nulo é "ninguém sabe ainda". */
  entregaPrevista: string | null;
  /** Compra no atacado: a casa foi buscar; o preço vem da nota. */
  atacado?: boolean;
  itens: {
    id: number;
    /** Para a busca de incluir não oferecer o que já está no pedido. */
    produtoId?: number;
    nome: string;
    unidade: ProductUnit;
    quantidade: number;
    /** Nulo é "o fornecedor exclusivo ainda não confirmou" — só existe no pedido direto. */
    precoUnitario: number | null;
    /** Atacado: o último custo, congelado quando o pedido nasceu. Só dica —
        o preço que vale é o da nota. */
    precoEstimado?: number | null;
    /** O fornecedor avisou pelo link que não tem — provavelmente não vem. */
    emFalta?: boolean;
    /** Qual marca ele disse que manda. Nulo quando o produto não pede marca. */
    marca: string | null;
    recebida: number | null;
    /** O ✕ da conferência. Nulo quando veio certo ou ainda não chegou. */
    problema?: "FALTA" | "DEVOLVIDO" | "AVARIA" | null;
    /** O que foi pago pela nota. Diferente do combinado, a tela mostra os dois. */
    precoPago?: number | null;
    /** Produto escolhido para avaliar qualidade: quem recebe dá as estrelas. */
    avaliar?: boolean;
  }[];
  /** A bonificação combinada: conferida junto, separada do que foi pago. */
  bonificacoes?: BonificacaoParaMostrar[];
};

/** A bonificação que se confere na entrega: mercadoria ou desconto, ainda combinada. */
const seConfere = (b: BonificacaoParaMostrar) => b.estado === "COMBINADA" && b.tipo !== "CREDITO";

const PROBLEMA_TEXTO = { FALTA: "Falta", DEVOLVIDO: "Devolvido", AVARIA: "Avaria" } as const;

/**
 * Quanto o pedido deve dar antes da nota: o preço combinado de cada item, ou
 * o estimado do atacado. Zero quando não há nenhum dos dois.
 */
export function estimadoDoPedido(pedido: Pick<PedidoRow, "itens">): number {
  return pedido.itens.reduce((s, i) => s + i.quantidade * (i.precoUnitario ?? i.precoEstimado ?? 0), 0);
}

/** O estimado do atacado como dica na caixa do preço da nota — nunca como valor. */
function dicaDoPreco(estimado: number | null | undefined): string {
  return estimado == null ? "R$" : `≈ ${estimado.toFixed(2).replace(".", ",")}`;
}

/**
 * Um pedido, e a conferência de quem recebeu.
 *
 * Os campos começam vazios, não com a quantidade pedida: preencher de antemão
 * convidaria a confirmar sem olhar, e o ponto da conferência é justamente
 * comparar o que veio com o que foi pedido.
 *
 * Aparece em duas telas e dá entrada em uma só. A cotação mostra o pedido
 * porque foi ali que ele nasceu, só para ler; quem registra a mercadoria é
 * Recebimentos, que abre o cartão já conferindo (e mostra os já recebidos,
 * também só para ler). Duas portas para a mesma ação é como um pedido acaba
 * conferido duas vezes, e entrada de estoque não tem desfazer.
 *
 * O pedido direto pode chegar aqui com o preço de um item em branco: o
 * fornecedor exclusivo nunca respondeu o link e a mercadoria veio assim
 * mesmo. Quem confere digita o preço da nota, que vem junto com a caixa.
 */
export function PedidoCard({
  pedido,
  conferir = false,
  titulo,
  detalhe,
  embutido = false,
  abertoDeInicio = false,
  semCabecalho = false,
  aoVoltar,
}: {
  pedido: PedidoRow;
  /** Dentro do cartão do fornecedor: sem borda própria, separado por linha. */
  embutido?: boolean;
  /** Só Recebimentos dá entrada. Nas outras telas o cartão é leitura. */
  conferir?: boolean;
  /**
   * O que vai em negrito no topo. Por padrão o fornecedor, que é o que
   * identifica o pedido numa tela onde ele aparece solto. Em Recebimentos os
   * cartões já vêm agrupados sob o nome do fornecedor, e repeti-lo aqui seria
   * dizer duas vezes a mesma coisa a vinte pixels de distância — lá o título
   * passa a ser a data, que é o que distingue dois pedidos do mesmo.
   */
  titulo?: React.ReactNode;
  /** Uma linha de contexto sob o cabeçalho: de que rodada o pedido veio. */
  detalhe?: React.ReactNode;
  /**
   * Já abre conferindo: a linha da lista foi tocada para isso. Com `conferir`,
   * é o único jeito de começar a conferir (Recebimentos sempre passa).
   */
  abertoDeInicio?: boolean;
  /** Sem o nome e o valor no topo: a linha que abriu o cartão já mostra os dois. */
  semCabecalho?: boolean;
  /** Fecha quem abriu o cartão, depois de dar entrada ou de encerrar o pedido. */
  aoVoltar?: () => void;
}) {
  const [conferindo, setConferindo] = useState(abertoDeInicio && conferir);
  const [recebido, setRecebido] = useState<Record<number, string>>({});
  const [precoDigitado, setPrecoDigitado] = useState<Record<number, string>>({});
  /* Os três botões de cada item na conferência: confere (veio certo),
     ajustar (quantidade ou preço diferente) e problema (falta, devolvido,
     avaria). Sem nenhum tocado, o item ainda não foi conferido. */
  const [situacao, setSituacao] = useState<Record<number, Situacao>>({});
  const [motivo, setMotivo] = useState<Record<number, Motivo>>({});
  // As estrelas de quem recebe, nos produtos marcados para avaliar.
  const [notas, setNotas] = useState<Record<number, number>>({});
  const [comentarios, setComentarios] = useState<Record<number, string>>({});
  // A bonificação: veio ou não, e quanto veio (mercadoria).
  const [bonVeio, setBonVeio] = useState<Record<number, boolean>>({});
  const [bonQtd, setBonQtd] = useState<Record<number, string>>({});
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  /* Os itens que ninguém tocou, mostrados antes de confirmar: sem o aviso, eles
     viravam "não veio" calados e a falta caía em Pendências. */
  const [semConferir, setSemConferir] = useState<string[] | null>(null);
  // O que veio sem estar no pedido, incluído na conferência.
  const [incluidos, setIncluidos] = useState<ItemIncluido[]>([]);

  const estado = rotuloDoPedido(pedido.estatus, pedido.atacado);


  /**
   * Um preço da nota digitado e diferente do combinado. Quem ajusta o preço e
   * depois toca em "Confere" — lendo o botão como "confirmar o ajuste" — não
   * pode perder o que digitou: o preço fica valendo, e a caixa, à vista.
   */
  function precoAlterado(i: PedidoRow["itens"][number]): number | null {
    const p = lerNumeroBR(precoDigitado[i.id] ?? "");
    if (p === null || p <= 0) return null;
    return i.precoUnitario === null || Math.abs(p - i.precoUnitario) >= 0.005 ? p : null;
  }

  /**
   * O que vale na nota para este item, pela situação dele: a quantidade e o
   * preço que o "Dar entrada" grava. O quadro de totais usa a mesma conta,
   * então o que se vê é o que entra. Nulo é item ainda não conferido; preço
   * nulo é "falta digitar o preço da nota"; quantidade nula, "falta quanto veio".
   */
  function contaDaNota(i: PedidoRow["itens"][number]): { quantidade: number | null; preco: number | null } | null {
    const sit = situacao[i.id];
    if (!sit) return null;
    const precoNota = lerNumeroBR(precoDigitado[i.id] ?? "");
    if (sit === "ok") {
      // Confere: veio o pedido, pelo preço do pedido. Sem preço no pedido, só
      // o da nota fecha a conta; digitado e diferente, vale ele (`precoAlterado`).
      return { quantidade: i.quantidade, preco: i.precoUnitario === null ? precoNota : (precoAlterado(i) ?? i.precoUnitario) };
    }
    return { quantidade: lerNumeroBR(recebido[i.id] ?? ""), preco: precoNota ?? i.precoUnitario };
  }

  /**
   * O item pede estrelas agora: é de produto marcado e está vindo — conferido
   * como veio, ou ajustado com quantidade maior que zero. O que não veio não
   * se avalia.
   */
  function vaiAvaliar(i: PedidoRow["itens"][number]): boolean {
    if (!i.avaliar) return false;
    const sit = situacao[i.id];
    if (sit === "ok") return true;
    if (sit === "ajuste" || sit === "problema") return (lerNumeroBR(recebido[i.id] ?? "") ?? 0) > 0;
    return false;
  }

  /** Toca num dos três botões de um item e prepara os campos dele. */
  function marcar(i: PedidoRow["itens"][number], nova: Situacao) {
    setSemConferir(null);
    setSituacao((a) => ({ ...a, [i.id]: nova }));
    if (nova === "ajuste") {
      setRecebido((r) => ({ ...r, [i.id]: r[i.id] || String(i.quantidade).replace(".", ",") }));
      if (i.precoUnitario !== null) {
        setPrecoDigitado((p) => ({ ...p, [i.id]: p[i.id] || precoNoCampo(i.precoUnitario) }));
      }
    }
    if (nova === "problema") {
      setRecebido((r) => ({ ...r, [i.id]: "0" }));
      setMotivo((m) => ({ ...m, [i.id]: m[i.id] ?? "FALTA" }));
    }
  }

  /** "Tudo confere": marca como certo cada item que ainda não foi tocado. */
  function tudoConfere() {
    setSemConferir(null);
    setSituacao((a) => {
      const novo = { ...a };
      for (const i of pedido.itens) if (novo[i.id] === undefined) novo[i.id] = "ok";
      return novo;
    });
  }

  function confirmar(naoVieram = false) {
    setErro(null);
    const intocados = pedido.itens.filter((i) => situacao[i.id] === undefined);
    if (intocados.length > 0 && !naoVieram) {
      setSemConferir(intocados.map((i) => i.nome));
      return;
    }
    setSemConferir(null);
    const dados: Record<
      string,
      { quantidade: number; precoUnitario?: number; problema?: Motivo } | null
    > = {};
    for (const i of pedido.itens) {
      const conta = contaDaNota(i);
      if (!conta) {
        dados[String(i.id)] = null;
        continue;
      }
      if (conta.quantidade === null || conta.quantidade < 0) return setErro(`Digite quanto veio de ${i.nome}.`);
      if (conta.quantidade > 0 && conta.preco === null) return setErro(`Digite o preço da nota de ${i.nome}.`);
      // O preço só vai quando muda o do pedido: sem ele, o servidor fica com o combinado.
      const mandaPreco = conta.preco !== null && conta.preco !== i.precoUnitario;
      dados[String(i.id)] = {
        quantidade: conta.quantidade,
        ...(mandaPreco ? { precoUnitario: conta.preco! } : {}),
        ...(situacao[i.id] === "problema" ? { problema: motivo[i.id] ?? "FALTA" } : {}),
      };
    }
    // Estrelas: todo produto marcado que chegou precisa da nota de quem recebe.
    const avaliacoes: Record<string, { nota: number; comentario: string }> = {};
    for (const i of pedido.itens) {
      if (!vaiAvaliar(i)) continue;
      const problema = erroDaNota(notas[i.id], comentarios[i.id] ?? "", i.nome);
      if (problema) return setErro(problema);
      avaliacoes[String(i.id)] = { nota: notas[i.id], comentario: comentarios[i.id] ?? "" };
    }
    // A bonificação: cada uma precisa de resposta, como o item tocado.
    const bonificacoes: Record<string, { veio: boolean; quantidade?: number }> = {};
    for (const b of (pedido.bonificacoes ?? []).filter(seConfere)) {
      const veio = bonVeio[b.id];
      if (veio === undefined) return setErro(`Diga se a bonificação veio: ${bonificacaoPorExtenso(b)}.`);
      if (veio && eMercadoria(b.tipo)) {
        const q = lerNumeroBR(bonQtd[b.id] ?? String(b.quantidade ?? ""));
        if (q === null || q <= 0) return setErro(`Digite quanto veio da bonificação: ${bonificacaoPorExtenso(b)}.`);
        bonificacoes[String(b.id)] = { veio, quantidade: q };
      } else {
        bonificacoes[String(b.id)] = { veio };
      }
    }
    startTransition(async () => {
      const r = await receberPedido(
        pedido.id,
        dados,
        avaliacoes,
        bonificacoes,
        incluidos.map((x) => ({ produtoId: x.produtoId, quantidade: x.quantidade, preco: x.preco })),
      );
      if (r.ok) {
        setConferindo(false);
        aoVoltar?.();
      }
      else setErro(r.message);
    });
  }

  const conferidos = pedido.itens.filter((i) => situacao[i.id] !== undefined);
  const itensSemPreco = pedido.itens.filter((i) => i.precoUnitario === null).length;
  const estimado = estimadoDoPedido(pedido);
  /* O quadro da conferência: o pedido de um lado, a nota do outro, somando
     só o que já foi tocado. Item sem preço digitado fica de fora e é contado. */
  const totalDoPedido = pedido.itens.reduce((t, i) => t + i.quantidade * (i.precoUnitario ?? 0), 0);
  let totalDaNota = 0;
  let notaSemPreco = 0;
  for (const i of pedido.itens) {
    const conta = contaDaNota(i);
    if (!conta) continue;
    const q = conta.quantidade ?? 0;
    if (q > 0 && conta.preco === null) notaSemPreco++;
    else totalDaNota += q * (conta.preco ?? 0);
  }
  // O que veio fora do pedido também está na nota.
  for (const x of incluidos) totalDaNota += x.quantidade * x.preco;
  const faltamConferir = pedido.itens.length - conferidos.length;
  const diferenca = totalDaNota - totalDoPedido;
  /* Onde se confere, fora da conferência os produtos ficam escondidos: a
     lista é de pedidos. Como Recebimentos já abre conferindo, isso só
     acontece entre dar entrada e a linha fechar. */
  const esconderItens = conferir && !conferindo && !pedido.entregaConfirmada;

  return (
    <li className={embutido ? "px-3 py-3" : "card p-3"}>
      {/* Título e valor na mesma linha; estado, origem e previsão embaixo. */}
      {!semCabecalho && (
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 font-semibold first-letter:uppercase">
          {titulo ?? pedido.fornecedor}
        </p>
        {pedido.total === 0 && itensSemPreco > 0 ? (
          <span className="shrink-0 text-sm text-[var(--muted-foreground)]">
            {estimado > 0 ? `≈ ${formatMoney(estimado)}` : "a confirmar"}
          </span>
        ) : (
          <span className="num-display shrink-0 font-semibold">{formatMoney(pedido.total)}</span>
        )}
      </div>
      )}

      {/* Onde se recebe, só o título e o valor: estado, origem e previsão não
          ajudam quem está com a caixa na mão. Nas outras telas, a linha fica. */}
      {!(conferir && !pedido.entregaConfirmada) && (
        <div className={`${semCabecalho ? "" : "mt-1 "}flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]`}>
          <span className="selo" style={{ color: corDoTom(estado.tom) }}>
            {estado.texto}
          </span>
          {detalhe && <span>{detalhe}</span>}
        </div>
      )}

      {/* Cada item numa linha corrida — quantidade, produto e preço juntos —
          e, conferindo, os três botões pequenos ao lado. */}
      {!esconderItens && (
      <ul
        onKeyDown={enterProximoValor}
        className="mt-2 first:mt-0 divide-y divide-[var(--border)] rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm"
      >
        {pedido.itens.map((i) => {
          const semPreco = i.precoUnitario === null;
          const unidade = UNIT_LABEL[i.unidade];
          /* Recebido, a conta é a que valeu: o que chegou × o preço pago (o da
             nota, corrigido na conferência). Mostrar a quantidade pedida × o
             combinado fazia a correção de preço parecer que não tinha gravado. */
          const recebidoItem = i.recebida !== null;
          const qtdDaConta = recebidoItem ? i.recebida! : i.quantidade;
          const precoDaConta = recebidoItem ? (i.precoPago ?? i.precoUnitario) : i.precoUnitario;
          return (
            <li
              key={i.id}
              className="border-l-[3px] px-2.5 py-2"
              style={{ borderLeftColor: conferindo ? FAIXA[situacao[i.id] ?? "nada"] : "transparent" }}
            >
              {/* O produto em cima, grande; embaixo, a conta inteira junta —
                  quantidade × preço unitário = total do produto. Os botões,
                  pequenos, vêm em seguida (ao lado, no computador). */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-snug">
                    {i.nome}
                    {i.marca && (
                      <span className="font-normal text-[var(--muted-foreground)]"> ({i.marca})</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[15px] tabular-nums">
                    <span className="font-semibold">{formatAmount(qtdDaConta)}</span>{" "}
                    <span className="text-sm text-[var(--muted-foreground)]">{unidade}</span>
                    <span className="text-[var(--muted-foreground)]"> × </span>
                    {recebidoItem && precoDaConta !== null ? (
                      <>
                        <span>{formatMoney(precoDaConta)}</span>
                        <span className="text-sm text-[var(--muted-foreground)]">/{unidade}</span>
                        <span className="text-[var(--muted-foreground)]"> = </span>
                        <span className="font-bold">{formatMoney(qtdDaConta * precoDaConta)}</span>
                      </>
                    ) : semPreco && i.emFalta ? (
                      <span className="text-sm font-semibold" style={{ color: "var(--destructive)" }}>
                        em falta no fornecedor
                      </span>
                    ) : semPreco && i.precoEstimado != null ? (
                      <span className="text-sm text-[var(--muted-foreground)]">
                        ≈ {formatMoney(i.precoEstimado)}/{unidade} estimado
                      </span>
                    ) : semPreco ? (
                      <span className="text-sm" style={{ color: "var(--warn)" }}>
                        preço a confirmar
                      </span>
                    ) : (
                      <>
                        <span>{formatMoney(i.precoUnitario!)}</span>
                        <span className="text-sm text-[var(--muted-foreground)]">/{unidade}</span>
                        <span className="text-[var(--muted-foreground)]"> = </span>
                        <span className="font-bold">{formatMoney(i.quantidade * i.precoUnitario!)}</span>
                      </>
                    )}
                  </p>
                </div>
                {conferindo && (
                  <div className="flex shrink-0 gap-1">
                    {BOTOES.map((b) => {
                      // Neutros, com só o ícone na cor; o escolhido fica cheio.
                      const ativo = situacao[i.id] === b.chave;
                      return (
                        <button
                          key={b.chave}
                          type="button"
                          aria-pressed={ativo}
                          title={b.dica}
                          onClick={() => marcar(i, b.chave)}
                          className={`inline-flex h-6 items-center justify-center gap-0.5 rounded border px-1.5 text-[11px] font-semibold ${
                            ativo ? "text-white" : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]"
                          }`}
                          style={ativo ? { background: b.cor, borderColor: b.cor } : undefined}
                        >
                          <b.Icone aria-hidden className="size-3" style={ativo ? undefined : { color: b.cor }} />
                          {b.texto}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Embaixo, só o que mudou em relação ao pedido: a conta de cima já
                  é a do que chegou, pelo preço pago. */}
              {i.recebida !== null &&
                (Math.abs(i.recebida - i.quantidade) >= 0.0005 ||
                  i.problema ||
                  (i.precoPago != null && i.precoUnitario !== null && Math.abs(i.precoPago - i.precoUnitario) >= 0.005)) && (
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--muted-foreground)]">
                  {Math.abs(i.recebida - i.quantidade) >= 0.0005 && (
                    i.quantidade === 0 ? (
                      /* Incluído na conferência: veio sem estar no pedido. */
                      <span className="selo" style={{ color: "var(--warn)" }}>
                        fora do pedido
                      </span>
                    ) : (
                      <span>
                        pediu <span className="tabular-nums">{formatAmount(i.quantidade)}</span> {unidade}
                      </span>
                    )
                  )}
                  {/* O problema anotado na conferência, visível depois dela. */}
                  {i.problema && (
                    <span
                      className="rounded px-1.5 py-0.5 font-semibold text-white"
                      style={{ background: "var(--destructive)" }}
                    >
                      {PROBLEMA_TEXTO[i.problema]}
                    </span>
                  )}
                  {/* Pago diferente do combinado: os dois, para a diferença aparecer. */}
                  {i.precoPago != null &&
                    i.precoUnitario !== null &&
                    Math.abs(i.precoPago - i.precoUnitario) >= 0.005 && (
                      <span style={{ color: i.precoPago > i.precoUnitario ? "var(--destructive)" : "var(--ok-strong)" }}>
                        combinado {formatMoney(i.precoUnitario)} · {i.precoPago > i.precoUnitario ? "pagou mais" : "pagou menos"}
                      </span>
                    )}
                </p>
              )}
              {conferindo &&
                situacao[i.id] !== undefined &&
                !(situacao[i.id] === "ok" && !semPreco && precoAlterado(i) === null) && (
                <div className="mt-2 space-y-2">
                  {/* Confere, mas o pedido não tinha preço (só o da nota), ou o
                      preço foi corrigido antes: a caixa fica à vista. */}
                  {situacao[i.id] === "ok" && (semPreco || precoAlterado(i) !== null) && (
                    <label className="block sm:max-w-[10rem]">
                      <span className="block text-xs text-[var(--muted-foreground)]">Preço da nota ({unidade})</span>
                      <Input
                        inputMode="decimal"
                        aria-label={`Preço de ${i.nome}`}
                        data-valor
                        placeholder={dicaDoPreco(i.precoEstimado)}
                        value={precoDigitado[i.id] ?? ""}
                        onChange={(e) => setPrecoDigitado((p) => ({ ...p, [i.id]: e.target.value }))}
                        className="num-display h-8 w-full text-right"
                      />
                    </label>
                  )}

                  {/* Ajustar: o que veio e o preço da nota, já preenchidos com
                      o do pedido para corrigir só o que mudou. Problema: o
                      motivo e quanto veio (zero quando nada). */}
                  {(situacao[i.id] === "ajuste" || situacao[i.id] === "problema") && (
                    <>
                      {situacao[i.id] === "problema" && (
                        <div className="flex gap-1.5">
                          {MOTIVOS.map((m) => {
                            const ativo = (motivo[i.id] ?? "FALTA") === m.chave;
                            return (
                              <button
                                key={m.chave}
                                type="button"
                                aria-pressed={ativo}
                                onClick={() => setMotivo((a) => ({ ...a, [i.id]: m.chave }))}
                                className={`h-7 rounded-full border px-3 text-xs font-medium ${
                                  ativo
                                    ? "border-[var(--destructive)] bg-[var(--destructive)] text-white"
                                    : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]"
                                }`}
                              >
                                {m.texto}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
                        <label className="block">
                          <span className="block text-xs text-[var(--muted-foreground)]">Veio ({unidade})</span>
                          <Input
                            inputMode="decimal"
                            aria-label={`Recebido de ${i.nome}`}
                            data-valor
                            placeholder="0"
                            value={recebido[i.id] ?? ""}
                            onChange={(e) => setRecebido((r) => ({ ...r, [i.id]: e.target.value }))}
                            className="num-display h-8 w-full text-right"
                          />
                        </label>
                        <label className="block">
                          <span className="block text-xs text-[var(--muted-foreground)]">Preço da nota ({unidade})</span>
                          <Input
                            inputMode="decimal"
                            aria-label={`Preço de ${i.nome}`}
                        data-valor
                            placeholder={dicaDoPreco(i.precoEstimado)}
                            value={precoDigitado[i.id] ?? ""}
                            onChange={(e) => setPrecoDigitado((p) => ({ ...p, [i.id]: e.target.value }))}
                            className="num-display h-8 w-full text-right"
                          />
                        </label>
                      </div>
                    </>
                  )}
                </div>
              )}
              {conferindo && <ContaDaNota conta={contaDaNota(i)} item={i} />}
              {/* As estrelas de quem recebe, no produto marcado que está
                  vindo. Obrigatórias: o Confirmar não passa sem elas. */}
              {conferindo && vaiAvaliar(i) && (
                <div
                  className="mt-2 space-y-1.5 rounded-lg px-2.5 py-2"
                  style={{ background: "var(--warn-soft)" }}
                >
                  <p className="text-xs font-semibold">Como veio a qualidade?</p>
                  <Estrelas
                    valor={notas[i.id] ?? null}
                    aoMudar={(n) => setNotas((a) => ({ ...a, [i.id]: n }))}
                    rotulo={`Qualidade de ${i.nome}`}
                  />
                  {notas[i.id] !== undefined && (
                    <Input
                      value={comentarios[i.id] ?? ""}
                      onChange={(e) => setComentarios((c) => ({ ...c, [i.id]: e.target.value }))}
                      maxLength={300}
                      placeholder={
                        notas[i.id] <= NOTA_QUE_PEDE_MOTIVO
                          ? "O que estava ruim? (obrigatório)"
                          : "Comentário (opcional)"
                      }
                      className="h-8 w-full text-sm"
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      )}

      {conferindo && !pedido.entregaConfirmada && pedido.fornecedorId !== undefined && (
        <IncluirItem
          fornecedorId={pedido.fornecedorId}
          noPedido={new Set(pedido.itens.map((i) => i.produtoId ?? -1))}
          incluidos={incluidos}
          aoMudar={(novos) => {
            setErro(null);
            setIncluidos(novos);
          }}
          pendente={pendente}
        />
      )}

      {!esconderItens && (pedido.bonificacoes ?? []).some((b) => b.estado !== "CANCELADA") && (
        <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-sm">
          <p className="flex items-center gap-1.5 font-semibold">
            <Gift aria-hidden className="size-4 text-[var(--primary)]" />
            Bonificação combinada
          </p>
          {conferindo && (
            <p className="text-xs text-[var(--muted-foreground)]">Conte separado do que foi pago.</p>
          )}
          <ul className="mt-1.5 space-y-2">
            {pedido.bonificacoes!
              .filter((b) => b.estado !== "CANCELADA")
              .map((b) => {
                const conferivel = conferindo && seConfere(b);
                const veio = bonVeio[b.id];
                const mercadoria = eMercadoria(b.tipo);
                return (
                  <li key={b.id}>
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      <p className="min-w-0 flex-1">
                        {bonificacaoPorExtenso(b)}
                        {b.nota && <span className="block text-xs text-[var(--muted-foreground)]">{b.nota}</span>}
                      </p>
                      {conferivel ? (
                        <div className="flex shrink-0 gap-1">
                          {[true, false].map((sim) => {
                            const ativo = veio === sim;
                            const cor = sim ? "var(--ok-strong)" : "var(--destructive)";
                            const Icone = sim ? Check : X;
                            return (
                              <button
                                key={String(sim)}
                                type="button"
                                aria-pressed={ativo}
                                onClick={() => {
                                  setErro(null);
                                  setBonVeio((a) => ({ ...a, [b.id]: sim }));
                                  if (sim && mercadoria) {
                                    setBonQtd((q) => ({ ...q, [b.id]: q[b.id] ?? String(b.quantidade ?? "").replace(".", ",") }));
                                  }
                                }}
                                className={`inline-flex h-6 items-center gap-0.5 rounded border px-1.5 text-[11px] font-semibold ${
                                  ativo ? "text-white" : "border-[var(--border)] bg-[var(--background)] text-[var(--muted-foreground)]"
                                }`}
                                style={ativo ? { background: cor, borderColor: cor } : undefined}
                              >
                                <Icone aria-hidden className="size-3" style={ativo ? undefined : { color: cor }} />
                                {sim ? (mercadoria ? "Veio" : "Veio abatido") : mercadoria ? "Não veio" : "Não veio abatido"}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="selo shrink-0 self-start text-[var(--muted-foreground)] sm:self-auto">
                          {b.tipo === "CREDITO" && b.estado === "COMBINADA"
                            ? "crédito a receber"
                            : b.estado === "RECEBIDA" && mercadoria && b.quantidadeRecebida !== null
                              ? `veio ${formatAmount(b.quantidadeRecebida)}`
                              : ESTADO_DA_BONIFICACAO[b.estado]}
                        </span>
                      )}
                    </div>
                    {conferivel && veio && mercadoria && (
                      <label className="mt-1.5 block max-w-[10rem]">
                        <span className="block text-xs text-[var(--muted-foreground)]">
                          Veio ({b.produto ? UNIT_LABEL[b.produto.unidade] : "un"})
                        </span>
                        <Input
                          inputMode="decimal"
                          aria-label={`Quanto veio da bonificação: ${bonificacaoPorExtenso(b)}`}
                          data-valor
                          value={bonQtd[b.id] ?? ""}
                          onChange={(e) => setBonQtd((q) => ({ ...q, [b.id]: e.target.value }))}
                          className="num-display h-8 w-full text-right"
                        />
                      </label>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      )}

      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}

      {pedido.entregaConfirmada ? (
        <p className="hint mt-2">Entrada registrada: o estoque já subiu com o que chegou.</p>
      ) : !conferir ? (
        /* Leitura, e o caminho escrito: só Recebimentos dá entrada. */
        <p className="hint mt-2">
          A entrada é dada em{" "}
          <Link
            href="/admin/compras/recebimentos"
            className="text-[var(--primary)] underline-offset-4 hover:underline"
          >
            Recebimentos
          </Link>
          , quando a mercadoria chegar.
        </p>
      ) : conferindo ? (
        <div className="mt-3 space-y-2">
          {/* Pedido e nota lado a lado, ao vivo: quem confere bate o total da
              nota com o papel do fornecedor e vê que o ajuste entrou. */}
          <div className="space-y-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-[var(--muted-foreground)]">Pedido</span>
              <span className="tabular-nums">
                {itensSemPreco === 0
                  ? formatMoney(totalDoPedido)
                  : pedido.itens.every((i) => i.precoUnitario !== null || i.precoEstimado != null)
                    ? `≈ ${formatMoney(estimado)}`
                    : totalDoPedido > 0
                      ? `${formatMoney(totalDoPedido)} + ${itensSemPreco} a confirmar`
                      : "preço a confirmar"}
              </span>
            </p>
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-medium">Nota</span>
              <span className="text-lg font-bold tabular-nums">
                {conferidos.length === 0 ? "nada conferido" : formatMoney(totalDaNota)}
              </span>
            </p>
            {faltamConferir === 0 && notaSemPreco === 0 && itensSemPreco === 0 && (
              <p className="flex items-baseline justify-between gap-3">
                <span className="text-[var(--muted-foreground)]">Diferença</span>
                {Math.abs(diferenca) < 0.005 ? (
                  <span style={{ color: "var(--ok-strong)" }}>igual ao pedido</span>
                ) : (
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: diferenca > 0 ? "var(--destructive)" : "var(--ok-strong)" }}
                  >
                    {diferenca > 0 ? "+ " : "− "}
                    {formatMoney(Math.abs(diferenca))}
                  </span>
                )}
              </p>
            )}
            {(faltamConferir > 0 || notaSemPreco > 0) && (
              <p className="text-xs" style={{ color: "var(--warn)" }}>
                {[
                  faltamConferir > 0 &&
                    (faltamConferir === 1 ? "Falta 1 item para conferir" : `Faltam ${faltamConferir} itens para conferir`),
                  notaSemPreco > 0 &&
                    (notaSemPreco === 1 ? "falta o preço da nota de 1 item" : `falta o preço da nota de ${notaSemPreco} itens`),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
          {/* Os atalhos da conferência e as duas saídas do pedido que não vai
              ser conferido, em quadrados. "Tudo confere" não some quando tudo
              já foi tocado: só apaga, para a fileira não pular. */}
          <div className="basis-full border-t border-[var(--border)] pt-1">
            <FileiraDeBotoes>
              <BotaoQuadrado
                icone={ListChecks}
                texto="Tudo confere"
                dica="Marca como certo o que ainda não foi tocado"
                desligado={pendente || faltamConferir === 0}
                onClick={tudoConfere}
              />
              <EncerrarPedido pedido={pedido} desabilitado={pendente} aoEncerrar={() => aoVoltar?.()} />
            </FileiraDeBotoes>
          </div>
          {semConferir && (
            <CaixaDeConfirmacao
              pergunta={
                <>
                  {semConferir.length === 1 ? "1 item ficou" : `${semConferir.length} itens ficaram`} sem conferir:{" "}
                  {semConferir.join(", ")}. Se confirmar assim, {semConferir.length === 1 ? "ele entra" : "eles entram"} como
                  &quot;não veio&quot; e a falta vai para Pendências. Ou toque em Tudo confere.
                </>
              }
              confirmar="Confirmar assim"
              pendente={pendente}
              aoConfirmar={() => confirmar(true)}
              aoVoltar={() => setSemConferir(null)}
            />
          )}
          <div className="flex">
            <Button type="button" size="lg" className="h-11 flex-1 py-0 sm:flex-none" disabled={pendente} onClick={() => confirmar()}>
              {pendente ? "Dando entrada…" : "Dar entrada"}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/**
 * A conta do item na nota, logo embaixo das caixas, quando ela muda a do
 * pedido: "Nota: 2 UN × R$ 5,50 = R$ 11,00 · pedido R$ 15,00". Vermelho se
 * subiu, verde se caiu, as cores do "pagou mais" e "pagou menos".
 */
function ContaDaNota({
  conta,
  item,
}: {
  conta: { quantidade: number | null; preco: number | null } | null;
  item: PedidoRow["itens"][number];
}) {
  if (!conta || conta.quantidade === null) return null;
  const unidade = UNIT_LABEL[item.unidade];
  if (conta.quantidade > 0 && conta.preco === null) {
    return (
      <p className="mt-1.5 text-xs" style={{ color: "var(--warn)" }}>
        Falta o preço da nota.
      </p>
    );
  }
  const total = conta.quantidade * (conta.preco ?? 0);
  const doPedido = item.precoUnitario === null ? null : item.quantidade * item.precoUnitario;
  // Igual ao pedido, a linha de cima já diz tudo.
  if (doPedido !== null && Math.abs(total - doPedido) < 0.005) return null;
  const cor =
    doPedido === null ? undefined : total > doPedido ? "var(--destructive)" : "var(--ok-strong)";
  return (
    <p className="mt-1.5 text-[13px] tabular-nums">
      <span className="text-[var(--muted-foreground)]">Nota: </span>
      {formatAmount(conta.quantidade)} {unidade}
      {conta.preco !== null && (
        <>
          {" "}× {formatMoney(conta.preco)}/{unidade}
        </>
      )}{" "}
      = <span className="font-bold" style={{ color: cor }}>{formatMoney(total)}</span>
      {doPedido !== null && (
        <span className="text-[var(--muted-foreground)]"> · pedido {formatMoney(doPedido)}</span>
      )}
    </p>
  );
}

/**
 * As duas saídas de Recebimentos para o pedido que não vai ser conferido:
 * "Não foi entregue" (o fornecedor não vem mais, e a casa deixa pra lá) e
 * "Cancelar pedido" (pedido que não devia existir). As duas tiram o pedido
 * da lista; a primeira conta como falha do fornecedor no relatório.
 * Pergunta antes, na mesma fileira: nenhuma das duas volta atrás.
 *
 * Desenha os quadrados soltos, para entrar na fileira de quem chama; a
 * pergunta e o erro ocupam a linha inteira embaixo deles.
 */
function EncerrarPedido({
  pedido,
  desabilitado,
  aoEncerrar,
}: {
  pedido: PedidoRow;
  desabilitado: boolean;
  aoEncerrar: () => void;
}) {
  const [qual, setQual] = useState<"nao-entregue" | "cancelar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function escolher(q: "nao-entregue" | "cancelar") {
    setErro(null);
    setQual((atual) => (atual === q ? null : q));
  }

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const r = qual === "nao-entregue" ? await naoFoiEntregue(pedido.id) : await cancelarPedido(pedido.id);
      if (!r.ok) return setErro(r.message);
      setQual(null);
      aoEncerrar();
    });
  }

  return (
    <>
      <BotaoQuadrado
        icone={PackageX}
        texto="Não foi entregue"
        ativo={qual === "nao-entregue"}
        desligado={desabilitado || pendente}
        onClick={() => escolher("nao-entregue")}
      />
      <BotaoQuadrado
        icone={Ban}
        texto="Cancelar pedido"
        tom="perigo"
        ativo={qual === "cancelar"}
        desligado={desabilitado || pendente}
        onClick={() => escolher("cancelar")}
      />
      {qual !== null && (
        <CaixaDeConfirmacao
          pergunta={
            <>
              <span className="block font-medium">
                {qual === "nao-entregue"
                  ? `${pedido.fornecedor} não vai entregar este pedido?`
                  : `Cancelar o pedido de ${pedido.fornecedor}?`}
              </span>
              <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                {qual === "nao-entregue"
                  ? "O pedido sai de Recebimentos e fica como não entregue, contando contra o fornecedor no relatório. Não dá para reabrir."
                  : "O pedido sai de Recebimentos e o link do fornecedor deixa de funcionar. Não dá para reabrir."}
              </span>
            </>
          }
          confirmar={qual === "nao-entregue" ? "Não foi entregue" : "Cancelar pedido"}
          pendente={pendente}
          aoConfirmar={confirmar}
          aoVoltar={() => setQual(null)}
        />
      )}
      {erro && (
        <p role="alert" className="msg-error col-span-full basis-full">
          {erro}
        </p>
      )}
    </>
  );
}

type Situacao = "ok" | "ajuste" | "problema";
type Motivo = "FALTA" | "DEVOLVIDO" | "AVARIA";

const BOTOES: { chave: Situacao; texto: string; dica: string; cor: string; Icone: typeof Check }[] = [
  { chave: "ok", texto: "Confere", dica: "Veio certo: quantidade e preço do pedido", cor: "var(--ok-strong)", Icone: Check },
  { chave: "ajuste", texto: "Ajustar", dica: "Mudar a quantidade ou o valor", cor: "var(--warn)", Icone: AlertTriangle },
  { chave: "problema", texto: "Problema", dica: "Falta, devolvido ou avaria", cor: "var(--destructive)", Icone: X },
];

const MOTIVOS: { chave: Motivo; texto: string }[] = [
  { chave: "FALTA", texto: "Falta" },
  { chave: "DEVOLVIDO", texto: "Devolvido" },
  { chave: "AVARIA", texto: "Avaria" },
];

/** A faixa à esquerda do item, na cor do botão tocado — discreta, mas dá
    para ver de longe o que já foi conferido. */
const FAIXA: Record<Situacao | "nada", string> = {
  nada: "transparent",
  ok: "var(--ok-strong)",
  ajuste: "var(--warn)",
  problema: "var(--destructive)",
};
