"use client";

import { Check, Copy, ListChecks, Lock, MessageCircle, Pencil, Send, ShoppingCart, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { BotaoQuadrado, FileiraDeBotoes } from "@/components/botao-quadrado";
import { CaixaDeConfirmacao } from "@/components/confirmar-na-linha";
import { CabecalhoDaPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  acrescentarItemNoPedido,
  cancelarPedido,
  definirEntregaPrevista,
  marcarEnviado,
  mudarItemDoPedido,
  tirarItemDoPedido,
} from "@/lib/actions/pedido";
import { AvaliacaoDaEntrega } from "../../qualidade-do-produto";
import { corDoTom, rotuloDoPedido } from "@/lib/cotacao-labels";
import { UNIT_LABEL, formatMoney, lerNumeroBR, plural, precoNoCampo } from "@/lib/format";
import type { PedidoCompraStatus, ProductUnit } from "@/generated/prisma/client";

import { SeletorDeProduto, type ProdutoParaPedido } from "../seletor-de-produto";
import { recadoDoPedido } from "../texto-do-pedido";
import { BonificacoesCombinadas } from "../../bonificacao-form";
import { creditoCombinado, descontoNaNota, type BonificacaoParaMostrar } from "@/lib/bonificacoes";

export type PedidoDetalheRow = {
  id: number;
  fornecedor: string;
  fornecedorId: number;
  estatus: PedidoCompraStatus;
  /** Encerrado em Recebimentos com "Não foi entregue". */
  naoEntregue?: boolean;
  total: number;
  entregaConfirmada: boolean;
  entregaPrevista: string | null;
  /** "24 de setembro", quando foi marcado como enviado. */
  enviadoEm: string | null;
  cotacaoId: number | null;
  token: string | null;
  wa: string | null;
  /** Compra no atacado: a casa vai buscar. Sem WhatsApp nem link — a lista. */
  atacado: boolean;
  origem: { tipo: "cotacao" | "contagem" | "avulso"; texto: string; href: string | null };
  /** O que foi combinado de bonificação com o fornecedor neste pedido. */
  bonificacoes: BonificacaoParaMostrar[];
  itens: {
    id: number;
    produtoId: number;
    nome: string;
    unidade: ProductUnit;
    lote: number | null;
    quantidade: number;
    precoUnitario: number | null;
    /** Atacado: o último custo, congelado quando o pedido nasceu. */
    precoEstimado: number | null;
    /** O fornecedor avisou pelo link que não tem. */
    emFalta: boolean;
    /** Depois de recebido: quanto chegou, o problema anotado e o preço da nota. */
    recebida: number | null;
    problema: "FALTA" | "DEVOLVIDO" | "AVARIA" | null;
    precoPago: number | null;
    /** As estrelas da entrega, quando o item é avaliável e chegou. */
    qualidade: {
      recebimento: { nota: number; comentario: string | null; autor: string | null } | null;
      dono: { nota: number; comentario: string | null } | null;
    } | null;
  }[];
};

const emTexto = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
const emReais = precoNoCampo;

export function PedidoDetalhe({
  pedido: p,
  produtos,
  peloLink = false,
  podeComprar = true,
  voltar,
}: {
  pedido: PedidoDetalheRow;
  produtos: ProdutoParaPedido[];
  /** O "‹ voltar" do alto da tela, que a página escolhe. */
  voltar?: { href: string; texto: string };
  /** Aberto pelo link de atalhos: cancelar o que já chegou pede login. */
  peloLink?: boolean;
  /** Quem configura Compras mexe e manda; o estoquista só vê (decisão do dono). */
  podeComprar?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [pendente, startTransition] = useTransition();

  const encerrado = p.entregaConfirmada || p.estatus === "CANCELADO";
  const enviado = p.estatus === "ENVIADO";
  /* Quem edita: não é de cotação, não está encerrado, não foi enviado. As
     mesmas guardas de `lib/actions/pedido.ts` — aqui só decidem o desenho; a
     palavra final é do servidor. */
  const editavel = p.cotacaoId === null && !encerrado && !enviado && podeComprar;
  const esperaComprador = !podeComprar && (p.estatus === "CRIADO" || p.estatus === "AGUARDANDO_FORNECEDOR");
  const rotulo = p.naoEntregue
    ? { texto: "não entregue", tom: "neutro" as const }
    : rotuloDoPedido(p.estatus, p.atacado);
  // O atacado antes da nota: quanto deve dar, pela última compra de cada item.
  const estimado = p.itens.reduce((s, i) => s + i.quantidade * (i.precoUnitario ?? i.precoEstimado ?? 0), 0);

  /** Roda uma ação do servidor e devolve o erro, se houve. A tela volta
      refeita pela própria ação, que revalida as telas de Compras. */
  function rodar(acao: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    setErro(null);
    return new Promise<string | null>((resolve) => {
      startTransition(async () => {
        const r = await acao();
        if (!r.ok) {
          setErro(r.message);
          return resolve(r.message);
        }
        resolve(null);
      });
    });
  }

  function recado() {
    return recadoDoPedido(p, window.location.origin);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(recado());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não consegui copiar. Selecione o texto e copie à mão.");
    }
  }

  const desconto = descontoNaNota(p.bonificacoes);
  const credito = creditoCombinado(p.bonificacoes);
  const semPreco = p.atacado && p.total === 0 && !p.entregaConfirmada;
  const motivoTravado = editavel
    ? null
    : p.cotacaoId !== null
      ? "Saiu de uma cotação: os números são os que o fornecedor cotou. Para mudar, vá à cotação."
      : p.estatus === "CANCELADO"
        ? "Este pedido foi cancelado."
        : p.entregaConfirmada
          ? "Já chegou e teve a entrada registrada."
          : esperaComprador
            ? "Espera quem compra revisar e mandar ao fornecedor. Você vê, mas não muda."
            : !podeComprar
              ? "Já foi enviado ao fornecedor."
              : "Já foi enviado ao fornecedor, então está travado. Toque em Voltar a editar para mudar.";
  const podeCancelar = p.estatus !== "CANCELADO" && !(peloLink && p.entregaConfirmada) && !esperaComprador;
  const mandaDaqui = !encerrado && !p.atacado && podeComprar;

  return (
    <div className="space-y-4">
      {/* No verde do alto: o fornecedor, e embaixo o selo, o número e a origem. */}
      <CabecalhoDaPagina
        voltar={voltar}
        titulo={p.fornecedor}
        subtitulo={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="selo" style={{ color: corDoTom(rotulo.tom) }}>
              {rotulo.texto}
            </span>
            <span>Pedido #{p.id}</span>
            {p.enviadoEm && <span>· enviado em {p.enviadoEm}</span>}
          </span>
        }
      />

      {/* O resumo: o total em destaque, o que fica a pagar com a bonificação,
          de onde veio e quando chega. */}
      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--primary)]">{semPreco ? "Estimado" : "Total"}</p>
            <p className="num-display text-3xl leading-tight" title={semPreco ? "Estimado pela última compra" : undefined}>
              {semPreco ? (estimado > 0 ? `≈ ${formatMoney(estimado)}` : "sem estimativa") : formatMoney(p.total)}
            </p>
          </div>
          <p className="text-right text-sm text-[var(--muted-foreground)]">{plural(p.itens.length, "item", "itens")}</p>
        </div>
        {(desconto > 0 || credito > 0) && (
          <p className="text-sm text-[var(--muted-foreground)]">
            {desconto > 0 && (
              <>
                − {formatMoney(desconto)} de desconto na nota ·{" "}
                <span className="font-semibold text-[var(--foreground)]">a pagar {formatMoney(Math.max(p.total - desconto, 0))}</span>
              </>
            )}
            {desconto > 0 && credito > 0 && " · "}
            {credito > 0 && <>{formatMoney(credito)} de crédito para o próximo pedido</>}
          </p>
        )}
        <dl className="divide-y divide-[var(--border)] border-t border-[var(--border)] text-sm">
          <div className="flex items-center justify-between gap-3 py-2">
            <dt className="text-[var(--muted-foreground)]">Origem</dt>
            <dd className="min-w-0 truncate text-right font-medium">
              {p.origem.href ? (
                <Link href={p.origem.href} className="text-[var(--primary)] underline-offset-4 hover:underline">
                  {p.origem.texto}
                </Link>
              ) : (
                p.origem.texto
              )}
            </dd>
          </div>
          {!encerrado && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <dt className="text-[var(--muted-foreground)]">
                <label htmlFor={`chega-${p.id}`}>Chega em</label>
              </dt>
              <dd>
                <Input
                  id={`chega-${p.id}`}
                  type="date"
                  defaultValue={p.entregaPrevista ?? ""}
                  onBlur={(e) => {
                    const v = e.target.value;
                    if (v === (p.entregaPrevista ?? "")) return;
                    void rodar(() => definirEntregaPrevista(p.id, v === "" ? null : v));
                  }}
                  className="h-10 w-44"
                />
              </dd>
            </div>
          )}
        </dl>
        {/* Por que não dá para mexer, dito antes de tentar. */}
        {motivoTravado && (
          <p className="flex items-start gap-2 rounded-lg bg-[var(--muted)] px-3 py-2 text-sm text-[var(--muted-foreground)]">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
            {motivoTravado}
          </p>
        )}
      </section>

      {/* As ações em botões quadrados, a principal em destaque. */}
      {(mandaDaqui || p.atacado || podeCancelar || !(p.atacado && !encerrado)) && (
        <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
          <FileiraDeBotoes>
            {!encerrado && p.atacado && (
              <BotaoQuadrado icone={ShoppingCart} texto="Lista de compra" tom="primario" href={`/admin/compras/pedidos/${p.id}/lista`} />
            )}
            {mandaDaqui && (
              <>
                <BotaoQuadrado
                  icone={MessageCircle}
                  texto="WhatsApp"
                  tom="primario"
                  desligado={p.wa === null}
                  dica={p.wa ? "Mandar pelo WhatsApp" : "Este fornecedor não tem telefone cadastrado"}
                  onClick={() => p.wa && window.open(`${p.wa}?text=${encodeURIComponent(recado())}`, "_blank", "noopener")}
                />
                <BotaoQuadrado
                  icone={copiado ? Check : Copy}
                  texto={copiado ? "Copiado" : p.token === null ? "Copiar pedido" : "Copiar link"}
                  onClick={copiar}
                />
                {/* Uma ação à parte, e não efeito do WhatsApp: abrir a conversa
                    não é mandar, a pessoa pode fechar sem enviar. */}
                {enviado ? (
                  <BotaoQuadrado icone={Pencil} texto="Voltar a editar" desligado={pendente} onClick={() => rodar(() => marcarEnviado(p.id, false))} />
                ) : (
                  <BotaoQuadrado icone={Send} texto="Marcar enviado" desligado={pendente} onClick={() => rodar(() => marcarEnviado(p.id, true))} />
                )}
              </>
            )}
            {!(p.atacado && !encerrado) && <BotaoQuadrado icone={ListChecks} texto="Lista do mercado" href={`/admin/compras/pedidos/${p.id}/lista`} />}
            {podeCancelar && (
              <BotaoQuadrado
                icone={X}
                texto="Cancelar"
                tom="perigo"
                ativo={cancelando}
                onClick={() => {
                  setErro(null);
                  setCancelando((v) => !v);
                }}
              />
            )}
          </FileiraDeBotoes>

          {cancelando && (
            <div className="mt-1 space-y-2 border-t border-[var(--border)] p-3">
              <p className="text-sm font-semibold">
                Cancelar o pedido de {p.fornecedor}, de {formatMoney(p.total)}?
              </p>
              <p className="text-sm text-[var(--muted-foreground)]">
                Ele sai de Recebimentos e o link do fornecedor deixa de funcionar.
                {p.entregaConfirmada && " O que tinha entrado SAI do estoque, e o preço dessa entrada sai do histórico."} Não dá para reabrir
                depois.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pendente}
                  onClick={async () => {
                    const falha = await rodar(() => cancelarPedido(p.id));
                    if (!falha) setCancelando(false);
                  }}
                >
                  {pendente ? "Cancelando…" : "Cancelar o pedido"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setCancelando(false)}>
                  Voltar
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {/* Os itens num cartão branco: um por linha, o nome e o subtotal em
          cima, a conta embaixo. */}
      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <h2 className="flex items-baseline gap-2 border-b border-[var(--border)] px-4 py-3">
          <span className="font-bold">Itens</span>
          <span className="text-sm text-[var(--muted-foreground)]">{p.itens.length}</span>
        </h2>
        {editavel && (
          <div className="border-b border-[var(--border)] p-3">
            <SeletorDeProduto
              semMoldura
              produtos={produtos}
              pendente={pendente}
              aoAcrescentar={(produtoId, q, preco) => rodar(() => acrescentarItemNoPedido(p.id, produtoId, q, preco))}
            />
          </div>
        )}
        <ul className="divide-y divide-[var(--border)] px-4">
          {p.itens.map((i) => (
            <ItemDoPedido
              key={i.id}
              item={i}
              editavel={editavel}
              pendente={pendente}
              aoMudar={(m) => rodar(() => mudarItemDoPedido(i.id, m))}
              aoTirar={() => rodar(() => tirarItemDoPedido(i.id))}
            />
          ))}
        </ul>
      </section>

      {/* A bonificação combinada: dá para acrescentar até o pedido chegar,
          mesmo em pedido de cotação; ela não mexe em item nem em preço. Pelo
          link de atalhos só se vê a combinada: combinar pede login. */}
      {(p.bonificacoes.length > 0 || (!peloLink && !p.entregaConfirmada && p.estatus !== "CANCELADO")) && (
        <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <h2 className="border-b border-[var(--border)] px-4 py-3 font-bold">Bonificação combinada</h2>
          <div className="p-4">
            <BonificacoesCombinadas
              alvo={{ pedidoCompraId: p.id }}
              existentes={p.bonificacoes}
              produtosDoPedido={p.itens.map((i) => ({
                id: i.produtoId,
                nome: i.nome,
                unidade: i.unidade,
                lote: null,
                doFornecedor: true,
              }))}
              todosOsProdutos={produtos}
              editavel={!peloLink && !p.entregaConfirmada && p.estatus !== "CANCELADO"}
            />
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Uma linha do pedido: quantidade e preço editáveis, gravados ao sair do
 * campo — como a grade de produtos, que grava sem botão de salvar. Só grava
 * o que mudou; sair de um campo sem mexer não vai ao servidor.
 */
function ItemDoPedido({
  item: i,
  editavel,
  pendente,
  aoMudar,
  aoTirar,
}: {
  item: PedidoDetalheRow["itens"][number];
  editavel: boolean;
  pendente: boolean;
  aoMudar: (m: { quantidade?: number; precoUnitario?: number | null }) => Promise<string | null>;
  aoTirar: () => Promise<string | null>;
}) {
  const [quantidade, setQuantidade] = useState(emTexto(i.quantidade));
  const [preco, setPreco] = useState(emReais(i.precoUnitario));
  // Tirar pergunta antes: a lixeira ao lado dos campos era fácil de tocar
  // sem querer, e o item saía do pedido no primeiro toque.
  const [tirando, setTirando] = useState(false);
  const unidade = UNIT_LABEL[i.unidade];

  async function salvarQuantidade() {
    const q = lerNumeroBR(quantidade);
    if (q === i.quantidade) return;
    if (q === null || q <= 0) return setQuantidade(emTexto(i.quantidade));
    const falha = await aoMudar({ quantidade: q });
    if (falha) setQuantidade(emTexto(i.quantidade));
  }

  async function salvarPreco() {
    const v = preco.trim() === "" ? null : lerNumeroBR(preco);
    if (v === i.precoUnitario) return;
    if (preco.trim() !== "" && (v === null || v <= 0)) return setPreco(emReais(i.precoUnitario));
    const falha = await aoMudar({ precoUnitario: v });
    if (falha) setPreco(emReais(i.precoUnitario));
  }

  /* Recebido, a conta é a que valeu: o que chegou × o preço pago (o da nota,
     corrigido na conferência). O pedido e o combinado ficam na linha de baixo,
     quando diferem. */
  const recebidoItem = i.recebida !== null;
  const qtdDaConta = recebidoItem ? i.recebida! : i.quantidade;
  const precoDaConta = recebidoItem ? (i.precoPago ?? i.precoUnitario) : i.precoUnitario;
  const subtotal = precoDaConta === null ? null : precoDaConta * qtdDaConta;

  const diferencaDeQtd = recebidoItem && Math.abs(i.recebida! - i.quantidade) >= 0.0005;
  const diferencaDePreco =
    recebidoItem && i.precoPago !== null && i.precoUnitario !== null && Math.abs(i.precoPago - i.precoUnitario) >= 0.005;
  const precoNaLinha =
    precoDaConta === null
      ? i.emFalta
        ? null
        : i.precoEstimado === null
          ? "a combinar"
          : `≈ ${formatMoney(i.precoEstimado)}`
      : formatMoney(precoDaConta);

  return (
    <li className="space-y-2 py-3">
      {/* Nome e subtotal na mesma linha; a conta embaixo, em cinza. */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="leading-snug font-semibold">{i.nome}</p>
          {!editavel && (
            <p className="text-sm text-[var(--muted-foreground)] tabular-nums">
              {emTexto(qtdDaConta)} {unidade}
              {precoNaLinha && ` × ${precoNaLinha}`}
            </p>
          )}
        </div>
        <p className="shrink-0 text-right font-bold tabular-nums">
          {subtotal === null ? (
            <span className="font-medium text-[var(--muted-foreground)]">
              {i.precoEstimado === null ? (editavel ? "" : "—") : `≈ ${formatMoney(i.precoEstimado * i.quantidade)}`}
            </span>
          ) : (
            formatMoney(subtotal)
          )}
        </p>
        {editavel && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => setTirando(true)}
            aria-expanded={tirando}
            aria-label={`Tirar ${i.nome} do pedido`}
            title="Tirar do pedido"
            className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
          >
            <Trash2 aria-hidden className="size-4" />
          </button>
        )}
      </div>

      {tirando && (
        <CaixaDeConfirmacao
          pergunta={`Tirar ${i.nome} do pedido?`}
          confirmar="Tirar"
          pendente={pendente}
          aoConfirmar={() => {
            setTirando(false);
            void aoTirar();
          }}
          aoVoltar={() => setTirando(false)}
        />
      )}

      {/* Editável: os dois campos lado a lado, do mesmo tamanho. */}
      {editavel && (
        <div className="grid grid-cols-2 gap-2">
          <label className="relative block">
            <span className="sr-only">Quantidade de {i.nome}</span>
            <Input
              inputMode="decimal"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              onBlur={salvarQuantidade}
              className="num-display h-10 w-full pr-10 text-right"
            />
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
              {unidade}
            </span>
          </label>
          <label className="relative block">
            <span className="sr-only">
              Preço por {unidade} de {i.nome}
            </span>
            <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
              R$
            </span>
            <Input
              inputMode="decimal"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              onBlur={salvarPreco}
              // No atacado, o estimado como dica: o preço é o da nota.
              placeholder={i.precoEstimado === null ? "0,00" : emReais(i.precoEstimado)}
              className="num-display h-10 w-full pr-12 pl-7 text-right"
            />
            <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
              /{unidade}
            </span>
          </label>
        </div>
      )}

      {/* Os avisos do item em selos: em falta, lote, o que a conferência
          anotou (quanto chegou, o problema, o preço pago diferente). */}
      {(i.emFalta || i.lote !== null || diferencaDeQtd || i.problema || diferencaDePreco) && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {i.emFalta && <span className={`${SELO} bg-[var(--danger-soft)] text-[var(--destructive)]`}>Em falta no fornecedor</span>}
          {i.problema && (
            <span className={`${SELO} bg-[var(--destructive)] text-white`}>
              {{ FALTA: "Falta", DEVOLVIDO: "Devolvido", AVARIA: "Avaria" }[i.problema]}
            </span>
          )}
          {diferencaDeQtd &&
            (i.quantidade === 0 ? (
              /* Incluído na conferência: veio sem estar no pedido. */
              <span className={`${SELO} bg-[var(--warn-soft)]`}>Fora do pedido</span>
            ) : (
              <span className={`${SELO} bg-[var(--muted)]`}>
                Pediu {emTexto(i.quantidade)} {unidade}
              </span>
            ))}
          {diferencaDePreco && (
            <span
              className={`${SELO} ${
                i.precoPago! > i.precoUnitario! ? "bg-[var(--danger-soft)] text-[var(--destructive)]" : "bg-[var(--primary-soft)] text-[var(--ok-strong)]"
              }`}
            >
              {i.precoPago! > i.precoUnitario! ? "Pagou mais" : "Pagou menos"} · combinado {formatMoney(i.precoUnitario!)}
            </span>
          )}
          {i.lote !== null && (
            <span className={`${SELO} bg-[var(--muted)] text-[var(--muted-foreground)]`}>
              Lote de {emTexto(i.lote)} {unidade}
            </span>
          )}
        </div>
      )}

      {/* A qualidade desta entrega: a nota de quem recebeu e a sua. */}
      {i.qualidade && (
        <div className="rounded-xl px-3 py-2.5" style={{ background: "var(--warn-soft)" }}>
          <p className="mb-1 text-xs font-semibold">Qualidade</p>
          <AvaliacaoDaEntrega
            pedidoCompraItemId={i.id}
            nome={i.nome}
            recebimento={i.qualidade.recebimento}
            dono={i.qualidade.dono}
          />
        </div>
      )}
    </li>
  );
}

const SELO = "rounded-full px-2.5 py-0.5 font-semibold";
