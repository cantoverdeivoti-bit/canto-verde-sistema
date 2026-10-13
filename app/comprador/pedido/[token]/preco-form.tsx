"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmarPedidoDireto } from "@/lib/actions/pedido";
import { UNIT_LABEL, formatAmount, formatMoney, lerNumeroBR } from "@/lib/format";
import type { ProductUnit } from "@/generated/prisma/client";

import { enterProximoValor } from "@/lib/enter-proximo-valor";
import { SeletorDeMarca } from "../../seletor-de-marca";
import { baixarResumo, textoDoResumo, type Resumo } from "./resumo-imagem";

export type ItemDoPedido = {
  id: number;
  nome: string;
  unidade: ProductUnit;
  categoria: string;
  quantidade: number;
  /** As marcas que a casa aceita. Vazio = tanto faz, e a pergunta some. */
  marcas: string[];
  aceitaSimilar: boolean;
  precoAnterior: number | null;
  marcaAnterior: string | null;
  observacaoAnterior: string | null;
  /** Ele já tinha marcado este item como em falta numa resposta anterior. */
  emFaltaAntes: boolean;
};

/**
 * O formulário do fornecedor exclusivo. Um preço por item, sem campo de
 * quantidade — quem decide quanto comprar é a casa, na contagem; o
 * fornecedor só confirma quanto cobra por cada um.
 *
 * Reenviar é permitido, igual à cotação: quem errou um dígito corrige e
 * manda de novo. Confirmação parcial também — o item que ele deixar em
 * branco hoje continua esperando, e ele pode voltar ao mesmo link depois.
 */
export function PrecoForm({
  token,
  itens,
  casa,
  fornecedor,
  diasDeEntrega,
  entregaAtual,
}: {
  token: string;
  itens: ItemDoPedido[];
  /** Para o cabeçalho do resumo em imagem. */
  casa: string;
  fornecedor: string;
  /** Os próximos 7 dias, de seg a dom, para ele escolher quando entrega. */
  diasDeEntrega: { dia: string; sigla: string; extenso: string }[];
  /** "2026-10-01" — o que o pedido já prevê, se prevê. */
  entregaAtual: string | null;
}) {
  const [entrega, setEntrega] = useState<string | null>(() =>
    entregaAtual !== null && diasDeEntrega.some((d) => d.dia === entregaAtual) ? entregaAtual : null,
  );
  const [precos, setPrecos] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      itens.map((i) => [i.id, i.precoAnterior === null ? "" : String(i.precoAnterior).replace(".", ",")]),
    ),
  );
  const [obs, setObs] = useState<Record<number, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, i.observacaoAnterior ?? ""])),
  );
  const [marcas, setMarcas] = useState<Record<number, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, i.marcaAnterior ?? ""])),
  );
  // O que ele não tem. Marcado, o item sai da conta e a casa fica sabendo.
  const [falta, setFalta] = useState<Set<number>>(
    () => new Set(itens.filter((i) => i.emFaltaAntes).map((i) => i.id)),
  );
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // O que foi confirmado, congelado no envio: é o que vai na imagem.
  const [resumo, setResumo] = useState<Resumo | null>(null);

  const grupos = new Map<string, ItemDoPedido[]>();
  for (const i of itens) {
    if (!grupos.has(i.categoria)) grupos.set(i.categoria, []);
    grupos.get(i.categoria)!.push(i);
  }

  // Só o que tem preço maior que zero vai. Zero, para quem preenche, quer
  // dizer "não vendo esta semana" — mandar a linha faria o servidor recusar
  // o envio inteiro por causa de um item que nem era para ir.
  const preenchidos = itens.filter((i) => !falta.has(i.id) && (lerNumeroBR(precos[i.id] ?? "") ?? 0) > 0);
  const emFalta = itens.filter((i) => falta.has(i.id));
  const nomesEmFalta = emFalta.map((i) => i.nome);

  function alternarFalta(id: number) {
    setFalta((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }
  const total = preenchidos.reduce(
    (soma, i) => soma + i.quantidade * (lerNumeroBR(precos[i.id] ?? "") ?? 0),
    0,
  );
  const escolhido = diasDeEntrega.find((d) => d.dia === entrega);
  const linhasDoResumo = preenchidos.map((i) => ({
    nome: i.nome,
    unidade: i.unidade,
    quantidade: i.quantidade,
    preco: lerNumeroBR(precos[i.id] ?? "") ?? 0,
    marca: marcas[i.id] ?? "",
    obs: obs[i.id] ?? "",
  }));

  function enviar(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    const resposta: Record<string, unknown> = {};
    for (const i of preenchidos) {
      resposta[String(i.id)] = {
        precoUnitario: lerNumeroBR(precos[i.id] ?? ""),
        marca: marcas[i.id] ?? "",
        observacoes: obs[i.id] ?? "",
      };
    }
    startTransition(async () => {
      const r = await confirmarPedidoDireto(token, resposta, entrega, emFalta.map((i) => i.id));
      if (!r.ok) return setErro(r.message);
      const agora = new Date();
      const feito: Resumo = {
        casa,
        fornecedor,
        quando:
          `${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` +
          (escolhido ? ` · entrega ${escolhido.extenso}` : ""),
        linhas: linhasDoResumo,
        faltas: nomesEmFalta,
      };
      setResumo(feito);
      // Um clique só: confirmou, o comprovante já baixa.
      baixarResumo(feito);
    });
  }

  if (resumo) {
    return (
      <div className="card p-5">
        <p className="text-lg font-semibold">Recebemos seu preço. Obrigado!</p>
        <p className="mt-1 text-base text-[var(--muted-foreground)]">
          {resumo.linhas.length} {resumo.linhas.length === 1 ? "item" : "itens"} · total{" "}
          <strong className="tabular-nums text-[var(--foreground)]">
            {formatMoney(resumo.linhas.reduce((s, l) => s + l.quantidade * l.preco, 0))}
          </strong>
          {resumo.faltas && resumo.faltas.length > 0 && (
            <> · {resumo.faltas.length === 1 ? "1 em falta" : `${resumo.faltas.length} em falta`}</>
          )}
        </p>
        {/* O comprovante já baixou ao confirmar. O link fica para o celular
            que bloqueou o download, ou para quem apagou o arquivo. */}
        <p className="mt-3 flex items-center gap-1.5 text-sm text-[var(--muted-foreground)]">
          <Download aria-hidden className="size-4" />
          O resumo em imagem foi baixado.
          <button
            type="button"
            onClick={() => baixarResumo(resumo)}
            className="text-[var(--primary)] underline underline-offset-4"
          >
            baixar de novo
          </button>
        </p>

        {/* O mesmo resumo em texto, para colar numa conversa. */}
        <ResumoParaCopiar titulo="Resumo em texto" texto={textoDoResumo(resumo)} className="mt-4" />

        <p className="mt-4 text-sm text-[var(--muted-foreground)]">
          Precisa corrigir? Abra este mesmo link de novo e reenvie.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} onKeyDown={enterProximoValor} className="space-y-6">
      {[...grupos.entries()].map(([categoria, lista]) => (
        <fieldset key={categoria}>
          <legend className="section-label mb-2">{categoria}</legend>
          <ul className="space-y-3">
            {lista.map((i) => (
              <li key={i.id} className={`card space-y-2.5 p-3 ${falta.has(i.id) ? "opacity-80" : ""}`}>
                <p className={`text-lg leading-snug font-semibold ${falta.has(i.id) ? "line-through decoration-2" : ""}`}>
                  {i.nome}
                </p>

                {/* Quantidade, preço e subtotal. No celular não cabem os três
                    mais o botão numa linha: quantidade e subtotal em cima, a
                    caixa do preço com o "Em falta" ao lado, embaixo, larga. Na
                    tela maior, as três colunas de sempre — os campos de preço
                    ficam um embaixo do outro e os números fecham na mesma linha. */}
                <div className="grid grid-cols-2 items-end gap-x-3 gap-y-2 sm:grid-cols-[5rem_minmax(0,1fr)_7rem]">
                  <div>
                    <p className="text-xs font-medium text-[var(--muted-foreground)]">Quantidade</p>
                    <p className="flex h-12 items-center gap-1">
                      <span className="text-2xl font-bold tabular-nums">{formatAmount(i.quantidade)}</span>
                      <span className="text-base text-[var(--muted-foreground)]">{UNIT_LABEL[i.unidade]}</span>
                    </p>
                  </div>
                  <div className="text-right sm:order-3">
                    <p className="text-xs font-medium text-[var(--muted-foreground)]">Subtotal</p>
                    <p className="flex h-12 items-center justify-end text-lg font-semibold tabular-nums">
                      {!falta.has(i.id) && (lerNumeroBR(precos[i.id] ?? "") ?? 0) > 0 ? (
                        formatMoney(i.quantidade * (lerNumeroBR(precos[i.id] ?? "") ?? 0))
                      ) : (
                        <span className="text-[var(--muted-foreground)]">—</span>
                      )}
                    </p>
                  </div>
                  {/* A caixa do preço em destaque: é a única coisa que ele
                      precisa preencher. Vinho enquanto falta; verde quando já
                      tem preço — dá para ver de relance o que falta. Ao lado,
                      em amarelo, o "Em falta": um toque diz à casa que ele não
                      tem, e a casa pode buscar em outro lugar a tempo. */}
                  {(() => {
                    const semItem = falta.has(i.id);
                    const preenchido = (lerNumeroBR(precos[i.id] ?? "") ?? 0) > 0;
                    const cor = semItem ? "var(--warn)" : preenchido ? "var(--ok-strong)" : "var(--primary)";
                    return (
                      <div className="col-span-2 sm:order-2 sm:col-span-1">
                        <span className="block text-xs font-semibold" style={{ color: cor }}>
                          {semItem ? "Em falta" : `Preço por ${UNIT_LABEL[i.unidade]}`}
                        </span>
                        <div className="flex gap-2">
                          {semItem ? (
                            <p
                              className="flex h-12 min-w-0 flex-1 items-center rounded-md border-2 border-dashed px-3 text-sm"
                              style={{ borderColor: cor, color: cor }}
                            >
                              Você não tem este item
                            </p>
                          ) : (
                            <label className="relative block min-w-0 flex-1">
                              <span
                                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm font-bold"
                                style={{ color: cor }}
                              >
                                R$
                              </span>
                              <Input
                                inputMode="decimal"
                                placeholder="0,00"
                                enterKeyHint="next"
                                aria-label={`Preço por ${UNIT_LABEL[i.unidade]} de ${i.nome}`}
                                data-valor
                                value={precos[i.id] ?? ""}
                                onChange={(e) => setPrecos((p) => ({ ...p, [i.id]: e.target.value }))}
                                className="num-display h-12 w-full border-2 bg-[var(--background)] pl-9 text-right text-xl font-semibold shadow-sm"
                                style={{ borderColor: cor }}
                              />
                            </label>
                          )}
                          <button
                            type="button"
                            aria-pressed={semItem}
                            aria-label={semItem ? `Tenho ${i.nome}` : `${i.nome} em falta`}
                            onClick={() => alternarFalta(i.id)}
                            className="h-12 shrink-0 rounded-md border-2 px-3 text-sm font-semibold leading-tight"
                            style={
                              semItem
                                ? { borderColor: "var(--warn)", background: "var(--warn)", color: "#fff" }
                                : { borderColor: "var(--warn)", background: "var(--warn-soft)", color: "var(--warn)" }
                            }
                          >
                            {semItem ? "Tenho" : "Em falta"}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {!falta.has(i.id) && (
                <>
                {/* `empty:` porque o seletor some quando o produto não pede
                    marca, e um respiro antes de nada é um buraco. */}
                <div className="empty:hidden">
                  <SeletorDeMarca
                    marcas={i.marcas}
                    aceitaSimilar={i.aceitaSimilar}
                    valor={marcas[i.id] ?? ""}
                    aoMudar={(m) => setMarcas((atual) => ({ ...atual, [i.id]: m }))}
                  />
                </div>

                {/* Observação é exceção: campo pequeno, sem rótulo. */}
                <Input
                  placeholder="Observação (opcional)"
                  enterKeyHint="done"
                  aria-label={`Observação sobre ${i.nome}`}
                  value={obs[i.id] ?? ""}
                  onChange={(e) => setObs((o) => ({ ...o, [i.id]: e.target.value }))}
                  className="h-8 w-full text-sm"
                />
                </>
                )}
              </li>
            ))}
          </ul>
        </fieldset>
      ))}

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      {/* Quando ele entrega: um toque num dos dias da semana, numa linha só.
          Cada sigla é a próxima vez daquele dia, de hoje em diante; a data
          inteira aparece embaixo, para não haver dúvida. Vira a data prevista
          do pedido, que é o que a casa vê em Receber pedidos. */}
      <section className="space-y-2 rounded-xl border border-[var(--border)] p-4">
        <h2 className="text-base font-semibold">Quando você entrega?</h2>
        <div className="grid grid-cols-7 gap-1.5">
          {diasDeEntrega.map((d) => {
            const ativo = entrega === d.dia;
            return (
              <button
                key={d.dia}
                type="button"
                aria-pressed={ativo}
                aria-label={d.extenso}
                title={d.extenso}
                onClick={() => setEntrega(ativo ? null : d.dia)}
                className={`h-10 rounded-md border text-sm font-semibold ${
                  ativo
                    ? "border-[var(--botao)] bg-[var(--botao)] text-[var(--botao-texto)]"
                    : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)]"
                }`}
              >
                {d.sigla}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          {escolhido ? (
            <>
              Entrega <strong className="text-[var(--foreground)]">{escolhido.extenso}</strong>
            </>
          ) : (
            "Toque no dia em que a mercadoria chega."
          )}
        </p>
      </section>

      {/* O pedido inteiro em texto, no fim, para ele copiar e colar na
          conversa ou no sistema dele. Acompanha o que está preenchido. */}
      {(linhasDoResumo.length > 0 || nomesEmFalta.length > 0) && (
        <ResumoParaCopiar
          titulo="Resumo do pedido"
          texto={textoDoResumo(
            { casa, fornecedor, quando: "", linhas: linhasDoResumo, faltas: nomesEmFalta },
            escolhido ? `Entrega: ${escolhido.extenso}` : "",
          )}
        />
      )}

      {/* O total do que ele preencheu, antes de mandar: é a conta que ele
          confere com a nota. */}
      <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-base">
          {preenchidos.length === 0 && emFalta.length === 0 ? (
            <span className="text-[var(--muted-foreground)]">Preencha o preço para confirmar.</span>
          ) : preenchidos.length === 0 ? (
            <span className="text-[var(--muted-foreground)]">
              {emFalta.length === 1 ? "1 item em falta" : `${emFalta.length} itens em falta`}
            </span>
          ) : (
            <>
              <span className="text-[var(--muted-foreground)]">
                {preenchidos.length} de {itens.length} com preço · total{" "}
              </span>
              <strong className="text-lg tabular-nums">{formatMoney(total)}</strong>
            </>
          )}
        </p>
        <Button
          type="submit"
          size="lg"
          className="w-full sm:w-auto"
          disabled={pendente || (preenchidos.length === 0 && emFalta.length === 0)}
        >
          {pendente ? "Enviando…" : "Confirmar preço"}
        </Button>
      </div>
    </form>
  );
}

/** Uma caixa com o texto e o botão de copiar. */
function ResumoParaCopiar({ titulo, texto, className = "" }: { titulo: string; texto: string; className?: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem permissão de área de transferência: o texto está na tela para
      // selecionar à mão.
    }
  }
  return (
    <div className={`rounded-lg border border-[var(--border)] bg-[var(--background)] ${className}`}>
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <span className="text-sm font-semibold">{titulo}</span>
        <button
          type="button"
          onClick={copiar}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-sm font-medium hover:border-[var(--primary)]"
        >
          {copiado ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap select-all">
        {texto}
      </pre>
    </div>
  );
}
