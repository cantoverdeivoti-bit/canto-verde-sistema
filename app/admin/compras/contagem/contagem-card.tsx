"use client";

import { ChevronRight, Copy, MessageCircle, ShoppingCart, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  apagarContagem,
  cancelarContagem,
  estenderContagem,
  finalizarPeloDono,
} from "@/lib/actions/contagem";
import { corDoTom } from "@/lib/cotacao-labels";
import { plural } from "@/lib/format";
import { TempoRestante } from "@/components/tempo-restante";

export type Contagem = {
  id: number;
  token: string;
  concluida: boolean;
  cotacaoId: number | null;
  /** "Cotação de 02/10", quando virou uma. */
  cotacaoNome: string | null;
  /** Quantos pedidos diretos ela gerou. Só o número: os pedidos moram em
      Recebimentos, e aqui eles só decidem se a contagem já virou compra. */
  pedidosDiretos: number;
  /** Virou compra junto com outras, mesmo sem cotação nem pedido amarrado a
      ela: o pedido direto da rodada guarda só a contagem mais nova. */
  processada: boolean;
  vencida: boolean;
  /** Descartada por quem cuida das compras: o link morreu de vez. */
  cancelada: boolean;
  /** Venceu sem finalizar há menos de uma semana: ainda pede uma decisão. */
  parada: boolean;
  expiraEmTexto: string;
  /** O mesmo prazo como instante, para o relógio de quanto falta. */
  expiraEmIso: string;
  abertaEmTexto: string;
  /** "quinta, 01/10": a data das anteriores, para a linha caber. */
  abertaEmCurto: string;
  /** O fornecedor da Requisição de onde ela saiu, quando saiu de uma. */
  lista: string | null;
  contados: number;
  total: number;
  categorias: string;
  responsavel: string | null;
  /** Nomes do que o estoquista lançou e ainda espera decisão. */
  produtosNovos: string[];
  /** O que ainda não foi contado, por categoria (só nas que não fecharam). */
  faltando: { categoria: string; nomes: string[] }[];
};

type Confirmacao = "finalizar" | "descartar" | "apagar" | null;

/**
 * Uma contagem na lista, com as ações que fazem sentido no estado dela.
 *
 * O estado não é um enum no banco: sai de `concluida`, `cotacaoId`,
 * `pedidosDiretos`, `processada`, `canceladaEm` e do prazo.
 *
 * Aberta (contando, ou parada há pouco): finalizar com o que foi contado,
 * mandar o link de novo, mais prazo e descartar. "Encerrar o link" saiu: ele
 * fechava sem gravar estoque, e o nome não dizia que o trabalho ia embora.
 */
export function ContagemCard({
  contagem: c,
  escolhivel = false,
  escolhida = false,
  aoEscolher,
  peloLink = false,
}: {
  contagem: Contagem;
  /** Aberto pelo link de atalhos: sem montar compra e sem links para telas
      que pedem login. Descartar só fecha o link, não apaga. */
  peloLink?: boolean;
  /** Fechada e ainda não gasta: só essas podem virar compra, e só elas têm a
      caixa. A escolha mora em `ListaContagens`, que tem o botão. */
  escolhivel?: boolean;
  escolhida?: boolean;
  aoEscolher?: () => void;
}) {
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [confirmando, setConfirmando] = useState<Confirmacao>(null);
  const [prazo, setPrazo] = useState(false);
  const [verFalta, setVerFalta] = useState(false);

  const emAndamento = !c.concluida && !c.vencida;
  // Aberta: dá para finalizar, estender ou descartar.
  const aberta = emAndamento || c.parada;
  // Pedido direto sozinho não fecha a contagem: quem a dá por gasta é
  // `processada`, que o botão do fim e a requisição sempre gravam.
  const jaVirouPedido = c.processada || c.cotacaoId !== null;
  // As anteriores são uma linha só: data curta e o fornecedor.
  const anterior = !aberta && !escolhivel;
  const faltam = c.total - c.contados;
  const caminhoDoLink = `/estoquista/contagem/${c.token}`;

  function rodar(acao: () => Promise<{ ok: boolean; message?: string }>, depois?: () => void) {
    setErro(null);
    startTransition(async () => {
      const r = await acao();
      if (!r.ok) setErro(r.message ?? "Falhou.");
      else depois?.();
    });
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${caminhoDoLink}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não consegui copiar.");
    }
  }

  function mandarDeNovo() {
    const texto = `Contagem de estoque${c.responsavel ? `, ${c.responsavel}` : ""}: ${window.location.origin}${caminhoDoLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  return (
    <li className={anterior ? "px-3 py-2.5" : "card p-3"}>
      {/* A caixa fica FORA do `details`: clique dentro de um `summary` abre e
          fecha a gaveta, e marcar não pode abrir o cartão. */}
      <div className="flex items-start gap-2">
        {escolhivel && !peloLink && (
          <label className="-m-2 flex shrink-0 cursor-pointer items-center justify-center p-2">
            <input
              type="checkbox"
              checked={escolhida}
              onChange={aoEscolher}
              aria-label={`Incluir a contagem de ${c.abertaEmTexto} na cotação`}
              title="Incluir esta contagem na cotação"
              className="size-6 shrink-0 cursor-pointer accent-[var(--primary)]"
            />
          </label>
        )}

        <details open={aberta} className="group/contagem min-w-0 flex-1">
          {/* O cabeçalho: a seta, a data em negrito e, embaixo, de onde ela
              veio; o estado à direita, num selo. "venceu sem finalizar"
              solto no fim da linha quebrava em duas e desalinhava o cartão.
              A seta é nossa (a do navegador some): ela gira ao abrir. */}
          {/* No celular, o tempo e os selos descem para a linha de baixo:
              ao lado do título eles tomavam metade da largura, a data quebrava
              em duas linhas e o nome do fornecedor saía cortado. */}
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden
              className="size-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-open/contagem:rotate-90"
            />
            <span className="min-w-0 flex-1 basis-[calc(100%-1.5rem)] sm:basis-auto">
              <span className={`block text-sm font-semibold ${anterior ? "truncate" : ""}`}>
                {anterior ? c.abertaEmCurto : c.abertaEmTexto}
                {anterior && c.lista !== null && (
                  <span className="font-normal text-[var(--muted-foreground)]"> · {c.lista}</span>
                )}
              </span>
              {/* Fora das anteriores, a segunda linha: o fornecedor da
                  Compra de rotina e, na pronta, quantos foram contados e por quem
                  (duas do mesmo dia não ficam com o mesmo título). */}
              {!anterior && (c.lista !== null || escolhivel) && (
                <span className="block truncate text-xs text-[var(--muted-foreground)]">
                  {[
                    c.lista,
                    escolhivel ? `${plural(c.contados, "item", "itens")}${c.responsavel ? `, ${c.responsavel}` : ""}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              )}
            </span>
            {(emAndamento || c.parada || c.produtosNovos.length > 0) && (
              <span className="flex shrink-0 flex-col items-end gap-1 max-sm:w-full max-sm:flex-row max-sm:flex-wrap max-sm:items-center max-sm:pl-6">
                {emAndamento && (
                  <span title={`O link vence ${c.expiraEmTexto}`}>
                    <TempoRestante fimIso={c.expiraEmIso} className="text-sm" />
                  </span>
                )}
                {c.parada && (
                  <span
                    className="selo whitespace-nowrap"
                    style={{ color: "var(--destructive)", background: "var(--danger-soft)" }}
                  >
                    venceu sem finalizar
                  </span>
                )}
                {c.produtosNovos.length > 0 && (
                  <span className="selo whitespace-nowrap" style={{ color: corDoTom("pendente") }}>
                    {plural(c.produtosNovos.length, "produto novo", "produtos novos")}
                  </span>
                )}
              </span>
            )}
          </summary>

          {/* Quem conta e quanto já foi, com a barra; as categorias embaixo,
              pequenas. Tocar no número abre o que falta, por categoria. */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-baseline gap-3 text-sm">
              <p className="min-w-0 flex-1 truncate text-[var(--muted-foreground)]">
                {c.responsavel ? `com ${c.responsavel}` : ""}
              </p>
              {aberta && faltam > 0 ? (
                <button
                  type="button"
                  aria-expanded={verFalta}
                  onClick={() => setVerFalta((v) => !v)}
                  className="shrink-0 underline-offset-4 hover:underline"
                >
                  <span className="num-display font-semibold">{c.contados}</span>
                  <span className="text-[var(--muted-foreground)]"> de {c.total} contados</span>
                  <span className="ml-1 text-xs text-[var(--primary)]">{verFalta ? "fechar" : "ver o que falta"}</span>
                </button>
              ) : (
                <p className="shrink-0">
                  <span className="num-display font-semibold">{c.contados}</span>
                  <span className="text-[var(--muted-foreground)]"> de {c.total} contados</span>
                </p>
              )}
            </div>
            {c.total > 0 && (
              <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
                <span
                  className="block h-full rounded-full bg-[var(--primary)]"
                  style={{ width: `${Math.min((c.contados / c.total) * 100, 100)}%` }}
                />
              </div>
            )}
            <p className="text-xs text-[var(--muted-foreground)]">{c.categorias || "sem categoria"}</p>

            {verFalta && c.faltando.length > 0 && (
              <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border border-[var(--border)] p-2.5 text-sm">
                <p className="text-xs font-semibold">Faltam {faltam}</p>
                {c.faltando.map((g) => (
                  <div key={g.categoria}>
                    <p className="text-xs font-semibold text-[var(--muted-foreground)]">
                      {g.categoria} · {g.nomes.length}
                    </p>
                    <p className="text-sm">{g.nomes.join(" · ")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* As ações. Somem na que já virou compra: o selo da barra já diz
              isso e leva à compra. */}
          {!jaVirouPedido && (
            <div className="mt-2 space-y-2 border-t border-[var(--border)] pt-2">
              {aberta ? (
                <>
                  {c.contados > 0 && confirmando !== "finalizar" && (
                    <Button
                      type="button"
                      className="h-10 w-full sm:w-auto"
                      disabled={pendente}
                      onClick={() => setConfirmando("finalizar")}
                    >
                      Finalizar com {plural(c.contados, "item contado", "itens contados")}
                    </Button>
                  )}
                  {confirmando === "finalizar" && (
                    <Confirma
                      texto={
                        faltam > 0
                          ? `Finalizar com ${c.contados} de ${c.total}? O estoque sobe com o que foi contado; os ${faltam} que faltam ficam com o estoque de antes.`
                          : "Finalizar a contagem? O estoque sobe com o que foi contado."
                      }
                      botao="Finalizar"
                      pendente={pendente}
                      aoConfirmar={() => rodar(() => finalizarPeloDono(c.id), () => setConfirmando(null))}
                      aoVoltar={() => setConfirmando(null)}
                    />
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {emAndamento && (
                      <>
                        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={mandarDeNovo}>
                          <MessageCircle aria-hidden className="size-4" />
                          Mandar de novo
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={copiar}
                          aria-label="Copiar o link da contagem"
                          title="Copiar o link da contagem"
                        >
                          <Copy aria-hidden className="size-4" />
                          {copiado ? "Copiado" : "Copiar"}
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-expanded={prazo}
                      onClick={() => setPrazo((p) => !p)}
                    >
                      {c.parada ? "Reabrir" : "Mais prazo"}
                    </Button>
                    {confirmando !== "descartar" && (
                      <button
                        type="button"
                        onClick={() => setConfirmando("descartar")}
                        aria-label="Descartar a contagem"
                        title="Descartar"
                        className="ml-auto flex size-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
                      >
                        <Trash2 aria-hidden className="size-[18px]" />
                      </button>
                    )}
                  </div>

                  {prazo && (
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-[var(--muted-foreground)]">
                        {c.parada ? "Reabrir o link por" : "Mais"}
                      </span>
                      {[6, 12, 24].map((h) => (
                        <Button
                          key={h}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pendente}
                          onClick={() => rodar(() => estenderContagem(c.id, h), () => setPrazo(false))}
                        >
                          {h} h
                        </Button>
                      ))}
                    </div>
                  )}

                  {confirmando === "descartar" && (
                    <Confirma
                      perigo
                      texto={
                        c.contados > 0
                          ? `Descartar a contagem? ${plural(c.contados, "item contado se perde", "itens contados se perdem")} e o estoque fica como estava.`
                          : "Descartar a contagem? O link para de funcionar."
                      }
                      botao="Descartar"
                      pendente={pendente}
                      aoConfirmar={() =>
                        rodar(() => (peloLink ? cancelarContagem(c.id) : apagarContagem(c.id)), () => setConfirmando(null))
                      }
                      aoVoltar={() => setConfirmando(null)}
                    />
                  )}
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 text-xs text-[var(--muted-foreground)]">
                    {c.concluida
                      ? c.pedidosDiretos > 0
                        ? `${c.pedidosDiretos === 1 ? "1 pedido direto já confirmado" : `${c.pedidosDiretos} pedidos diretos já confirmados`}. Marque a caixa ao lado para montar o resto.`
                        : "Contagem fechada, pronta para virar compra."
                      : c.cancelada
                        ? "Descartada. O que foi contado não virou estoque."
                        : "O link venceu sem ser finalizado. O que foi contado não virou estoque."}
                  </p>
                  {/* Com pedido já confirmado, apagar deixaria o pedido sem
                      origem, e o servidor recusa: sem botão que sempre falha. */}
                  {!peloLink && c.pedidosDiretos === 0 && confirmando !== "apagar" && (
                    <button
                      type="button"
                      onClick={() => setConfirmando("apagar")}
                      aria-label={`Apagar a contagem de ${c.abertaEmTexto}`}
                      title="Apagar esta contagem"
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[var(--muted-foreground)] transition hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </button>
                  )}
                </div>
              )}

              {confirmando === "apagar" && (
                <Confirma
                  perigo
                  texto={`Apagar esta contagem de ${c.abertaEmTexto}? Vão junto ${plural(c.contados, "item contado", "itens contados")}${
                    c.produtosNovos.length > 0
                      ? ` e ${plural(c.produtosNovos.length, "produto novo", "produtos novos")} esperando decisão`
                      : ""
                  }. Não tem desfazer.${c.concluida ? " O estoque dos produtos continua com o que foi contado." : ""}`}
                  botao="Apagar"
                  pendente={pendente}
                  aoConfirmar={() => rodar(() => apagarContagem(c.id), () => setConfirmando(null))}
                  aoVoltar={() => setConfirmando(null)}
                />
              )}
            </div>
          )}

          {/* Uma linha, sem botão de decidir: decidir precisa do formulário,
              e ele mora em Produtos. */}
          {c.produtosNovos.length > 0 && (
            <div className="mt-2 border-t border-[var(--border)] pt-2">
              <p className="text-xs text-[var(--muted-foreground)]">
                Achados fora do cadastro: {c.produtosNovos.join(" · ")}.{" "}
                {peloLink ? (
                  "Quem cuida das compras autoriza em Produtos."
                ) : (
                  <>
                    <Link href="/admin/compras" className="text-[var(--primary)] underline-offset-4 hover:underline">
                      Autorizar em Produtos
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
          )}
        </details>

        {/* Que esta contagem já virou compra, na ponta direita e clicável.
            Fora do `summary`: um link ali dentro abriria o cartão no caminho. */}
        {jaVirouPedido && peloLink && (
          <span className="selo shrink-0 text-[var(--muted-foreground)]">
            <ShoppingCart aria-hidden className="mr-1 size-3" />
            {c.cotacaoId !== null ? c.cotacaoNome : "pedido direto"}
          </span>
        )}
        {jaVirouPedido &&
          !peloLink &&
          (c.cotacaoId !== null ? (
            <Link
              href={`/admin/compras/cotacao/${c.cotacaoId}`}
              title={`Abrir a ${c.cotacaoNome}`}
              className="selo shrink-0 text-[var(--muted-foreground)] transition hover:text-[var(--primary)]"
            >
              <ShoppingCart aria-hidden className="mr-1 size-3" />
              {c.cotacaoNome}
            </Link>
          ) : (
            <Link
              href={`/admin/compras/enviar?c=${c.id}`}
              title="Abrir os pedidos diretos desta rodada"
              className="selo shrink-0 text-[var(--primary)] underline-offset-4 hover:underline"
            >
              <ShoppingCart aria-hidden className="mr-1 size-3" />
              pedido direto
            </Link>
          ))}
      </div>

      {/* O erro fica FORA do `details`: uma falha não pode se esconder atrás
          de uma seta fechada. */}
      {erro && (
        <p role="alert" className="mt-2 text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
    </li>
  );
}

/** A confirmação embutida no cartão, dizendo o que acontece antes. */
function Confirma({
  texto,
  botao,
  pendente,
  perigo = false,
  aoConfirmar,
  aoVoltar,
}: {
  texto: string;
  botao: string;
  pendente: boolean;
  perigo?: boolean;
  aoConfirmar: () => void;
  aoVoltar: () => void;
}) {
  return (
    <div className={`${perigo ? "card-alerta" : "rounded-lg border border-[var(--border)]"} p-2.5`}>
      <p className="text-sm">{texto}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* Tamanho normal, e não `sm`: o `sm` deste projeto pinta o fundo
            claro e apagaria a cor do botão que confirma. */}
        <Button
          type="button"
          className="h-10"
          variant={perigo ? "destructive" : "default"}
          disabled={pendente}
          onClick={aoConfirmar}
        >
          {pendente ? "…" : botao}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pendente} onClick={aoVoltar}>
          voltar
        </Button>
      </div>
    </div>
  );
}
