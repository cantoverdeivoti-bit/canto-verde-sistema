"use client";

import {
  CheckCheck,
  CircleAlert,
  FileText,
  MessageSquareText,
  PackageCheck,
  PackageX,
  Scale,
  ShoppingCart,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { Vazio } from "@/components/pagina";
import { marcarAvisoLido, marcarTodosAvisosLidos, resolverAviso } from "@/lib/actions/pendencias";
import { BLOCOS_DE_AVISO, blocoDoAviso, type BlocoDeAviso } from "@/lib/blocos-de-aviso";
import type { Aviso } from "@/lib/pendencias";

/** O aviso já com o dia e a hora no fuso da casa, montados no servidor. */
export type AvisoNaTela = Aviso & { dia: string; diaTexto: string; hora: string };

type Grupo = BlocoDeAviso;
const VAZIO: Record<Grupo, string> = {
  divergencia: "Nenhum pedido chegou com divergência nos últimos 30 dias.",
  recebido: "Nenhum pedido recebido certo nos últimos 30 dias.",
  outros: "Nenhuma resposta de fornecedor ou item em falta nos últimos 30 dias.",
};

/** O ícone de cada aba: o tipo de aviso fica dito ali, e não repetido em cada aviso. */
const ICONE_DO_GRUPO: Record<BlocoDeAviso, typeof Scale> = {
  divergencia: CircleAlert,
  recebido: PackageCheck,
  outros: MessageSquareText,
};

const GRUPOS = BLOCOS_DE_AVISO.map((b) => ({ ...b, vazio: VAZIO[b.chave], Icone: ICONE_DO_GRUPO[b.chave] }));

/** Para onde o aviso leva: o pedido, ou a cotação. */
function destino(a: Aviso): string | null {
  if (a.pedidoId !== null) return `/admin/compras/pedidos/${a.pedidoId}`;
  if (a.cotacaoId !== null) return `/admin/compras/cotacao/${a.cotacaoId}`;
  return null;
}

/** "Comprar de outro": o pedido manual já com os itens que faltaram. */
function comprarDeOutro(a: Aviso): string {
  const itens = a.itens.map((i) => `${i.produtoId}:${i.quantidade}`).join(",");
  return `/admin/compras/pedido-manual?itens=${itens}&aviso=${a.id}`;
}

/** O botão só com o símbolo: quadrado, do tamanho do dedo. Apagado enquanto grava. */
const BOTAO_SIMBOLO =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] hover:border-[var(--primary)] disabled:opacity-60";

/** "Não vou comprar": o carrinho riscado (o lucide não tem um pronto). */
function CarrinhoRiscado() {
  return (
    <span aria-hidden className="relative inline-flex">
      <ShoppingCart className="size-[18px]" />
      <span className="absolute top-1/2 left-1/2 h-[2px] w-6 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Agora: o que o fornecedor avisou que falta, e ninguém resolveu
// ---------------------------------------------------------------------------

export function FaltasParaAgir({ avisos }: { avisos: AvisoNaTela[] }) {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {avisos.map((a) => (
        <FaltaParaAgir key={a.id} aviso={a} />
      ))}
    </ul>
  );
}

function FaltaParaAgir({ aviso: a }: { aviso: AvisoNaTela }) {
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const href = destino(a);
  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-start gap-2.5">
        <PackageX aria-hidden className="mt-0.5 size-5 shrink-0" style={{ color: "var(--warn)" }} />
        <div className="min-w-0 flex-1">
          <p className="leading-snug">
            <span className="font-semibold">{a.fornecedor ?? "Fornecedor"}</span> {a.titulo}
          </p>
          {a.detalhe && <p className="text-sm text-[var(--muted-foreground)]">{a.detalhe}</p>}
          <p className="text-xs text-[var(--muted-foreground)]">
            {a.diaTexto} · {a.hora}
            {href && (
              <>
                {" · "}
                <Link href={href} className="text-[var(--primary)] underline-offset-4 hover:underline">
                  Ver pedido
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-7">
        {a.itens.length > 0 && (
          <Link
            href={comprarDeOutro(a)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--botao)] px-3 text-sm font-semibold text-[var(--botao-texto)] hover:opacity-90"
          >
            <ShoppingCart aria-hidden className="size-4" />
            Comprar de outro
          </Link>
        )}
        <button
          type="button"
          disabled={pendente}
          aria-label="Não vou comprar"
          title="Não vou comprar"
          onClick={() =>
            startTransition(async () => {
              const r = await resolverAviso(a.id);
              if (!r.ok) setErro(r.message);
            })
          }
          className={BOTAO_SIMBOLO}
        >
          <CarrinhoRiscado />
        </button>
      </div>
      {erro && (
        <p role="alert" className="pl-7 text-xs font-medium" style={{ color: "var(--destructive)" }}>
          {erro}
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// A linha do tempo
// ---------------------------------------------------------------------------

const AVISOS_POR_VEZ = 40;

export function LinhaDoTempo({ avisos, blocoInicial }: { avisos: AvisoNaTela[]; blocoInicial?: Grupo }) {
  // Abre no bloco pedido (o cartão da página inicial manda), ou no primeiro que tem aviso.
  const [grupo, setGrupo] = useState<Grupo>(
    () => blocoInicial ?? GRUPOS.find((g) => avisos.some((a) => blocoDoAviso(a.tipo) === g.chave))?.chave ?? "divergencia",
  );
  const [soNaoLidos, setSoNaoLidos] = useState(false);
  const [pendente, startTransition] = useTransition();
  // Desenha 40 de cada vez: trinta dias de aviso passam de centenas de
  // linhas, e o celular montava todas para mostrar as primeiras.
  const [limite, setLimite] = useState(AVISOS_POR_VEZ);

  const doGrupo = (g: Grupo) => avisos.filter((a) => blocoDoAviso(a.tipo) === g);
  const visiveis = doGrupo(grupo).filter((a) => !soNaoLidos || !a.lido);
  const naoLidos = avisos.filter((a) => !a.lido).length;
  const naoLidosNoGrupo = doGrupo(grupo).filter((a) => !a.lido).length;

  // Por dia, na ordem em que vieram (a lista já chega do mais novo ao mais velho).
  const porDia: { dia: string; texto: string; avisos: AvisoNaTela[] }[] = [];
  for (const a of visiveis.slice(0, limite)) {
    const ultimo = porDia[porDia.length - 1];
    if (ultimo && ultimo.dia === a.dia) ultimo.avisos.push(a);
    else porDia.push({ dia: a.dia, texto: a.diaTexto, avisos: [a] });
  }

  if (avisos.length === 0) {
    return (
      <Vazio>
        Nenhum aviso nos últimos 30 dias. Eles aparecem aqui quando um fornecedor responde, avisa falta ou
        quando um pedido é recebido.
      </Vazio>
    );
  }

  return (
    <div className="space-y-5">
      {/* Os três blocos, um de cada vez, com quantos tem cada um e o ponto de
          não lido; embaixo o "só não lidos" e o "marcar todos". */}
      <div className="space-y-2">
        {/* As três abas como cartões: o ícone e o número na cor do bloco em
            cima, o nome embaixo. A aberta fica com o fundo claro da cor e a
            borda; o ponto no ícone diz que tem aviso não lido. */}
        <div role="tablist" aria-label="Tipo de aviso" className="grid grid-cols-3 gap-2">
          {GRUPOS.map((g) => {
            const total = doGrupo(g.chave).length;
            const novos = doGrupo(g.chave).some((a) => !a.lido);
            const ativo = grupo === g.chave;
            return (
              <button
                key={g.chave}
                type="button"
                role="tab"
                aria-selected={ativo}
                onClick={() => {
                  setGrupo(g.chave);
                  setLimite(AVISOS_POR_VEZ);
                }}
                className="flex min-w-0 flex-col items-start gap-1.5 rounded-xl border-2 bg-[var(--card)] p-2.5 text-left transition"
                style={{ borderColor: ativo ? g.cor : "transparent", background: ativo ? g.fundo : undefined }}
              >
                <span className="flex w-full items-center justify-between">
                  <span className="relative flex size-8 items-center justify-center rounded-lg" style={{ background: g.fundo, color: g.cor }}>
                    <g.Icone aria-hidden className="size-[18px]" />
                    {novos && <span aria-label="tem não lido" className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[var(--card)]" style={{ background: g.cor }} />}
                  </span>
                  <span className="text-xl leading-none font-bold tabular-nums" style={{ color: total > 0 ? g.cor : "var(--muted-foreground)" }}>
                    {total}
                  </span>
                </span>
                {/* "Com divergência" não cabe na aba do celular: ali fica só "Divergência". */}
                <span className="w-full truncate text-xs font-semibold text-[var(--foreground)]">{g.chave === "divergencia" ? "Divergência" : g.nome}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {naoLidosNoGrupo > 0 && (
            <button
              type="button"
              aria-pressed={soNaoLidos}
              onClick={() => setSoNaoLidos((v) => !v)}
              className="chip h-10 shrink-0 px-3 text-sm whitespace-nowrap"
            >
              Não lidos · {naoLidosNoGrupo}
            </button>
          )}
          {naoLidos > 0 && (
            <button
              type="button"
              disabled={pendente}
              onClick={() => startTransition(async () => void (await marcarTodosAvisosLidos()))}
              aria-label="Marcar todos como lidos"
              title="Marcar todos como lidos"
              className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--card)] text-[var(--primary)] hover:border-[var(--primary)] disabled:opacity-60"
            >
              <CheckCheck aria-hidden className="size-5" />
            </button>
          )}
        </div>
      </div>

      {porDia.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">
          {soNaoLidos ? "Nenhum aviso com esses filtros." : GRUPOS.find((g) => g.chave === grupo)!.vazio}
        </p>
      )}

      {porDia.map((d) => (
        <section key={d.dia}>
          {/* "Domingo" em negrito e a data ao lado, como na Programação. */}
          <h3 className="mb-2 flex items-baseline gap-2">
            <span className="font-bold first-letter:uppercase">{d.texto.split(", ")[0]}</span>
            {d.texto.includes(", ") && <span className="text-sm font-semibold text-[var(--muted-foreground)]">{d.texto.split(", ").slice(1).join(", ")}</span>}
          </h3>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {d.avisos.map((a) => (
              <LinhaDoAviso key={a.id} aviso={a} />
            ))}
          </ul>
        </section>
      ))}

      {visiveis.length > limite && (
        <button
          type="button"
          onClick={() => setLimite((l) => l + AVISOS_POR_VEZ)}
          className="h-10 w-full rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--primary)]"
        >
          Mostrar mais {Math.min(AVISOS_POR_VEZ, visiveis.length - limite)} avisos
        </button>
      )}
    </div>
  );
}

/**
 * O título numa linha só: "entregou o pedido #91 com 6 diferenças" vira
 * "Pedido #91 · 6 diferenças". O texto gravado continua a frase inteira,
 * que é a que vai na notificação do celular.
 */
function tituloCurto(titulo: string): string {
  const m = /^entregou o pedido #(\d+)(?: com | — )(.+)$/.exec(titulo);
  return m ? `Pedido #${m[1]} · ${m[2]}` : titulo;
}

/**
 * O detalhe sem repetir o título: no item em falta, o título já diz "não tem
 * Hashi bambu…" e o detalhe dizia "1 PCT de Hashi bambu…" logo embaixo. Fica
 * só "1 PCT".
 */
function detalheSemRepetir(a: AvisoNaTela): string | null {
  if (!a.detalhe) return null;
  if (a.itens.length === 1) {
    const fim = ` de ${a.itens[0].nome}`;
    if (a.detalhe.endsWith(fim) && a.titulo.includes(a.itens[0].nome)) return a.detalhe.slice(0, -fim.length);
  }
  return a.detalhe;
}

const BOTAO_CHEIO =
  "inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--botao)] px-3 text-sm font-semibold text-[var(--botao-texto)] hover:opacity-90";
const BOTAO_CONTORNO =
  "inline-flex h-10 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-semibold text-[var(--primary)] hover:border-[var(--primary)]";

/**
 * Um aviso: quem e quando em cima, o que aconteceu embaixo, e as ações em
 * botões. Era tudo uma frase corrida, com as ações em links miúdos na linha
 * da hora, quebrando no meio.
 */
function LinhaDoAviso({ aviso: a }: { aviso: AvisoNaTela }) {
  const href = destino(a);
  const [, startTransition] = useTransition();
  const [dispensando, startDispensa] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  // Tocar numa ação conta como ter visto. Sem esperar: a navegação segue.
  const marcar = () => {
    if (!a.lido) startTransition(async () => void (await marcarAvisoLido(a.id)));
  };
  const detalhe = detalheSemRepetir(a);
  const faltaAberta = a.tipo === "ITEM_EM_FALTA" && !a.resolvido;
  const diferencaAberta = a.tipo === "RECEBIDO_COM_DIFERENCA" && !a.resolvido;

  return (
    <li
      className="px-4 py-3"
      style={a.lido ? undefined : { background: "color-mix(in oklch, var(--primary) 6%, var(--card))" }}
    >
      <div className="min-w-0 space-y-1">
        {/* Sem ícone na frente: a aba de cima já diz o tipo, e o texto ganha a largura toda. */}
        <p className="flex items-center gap-2">
          {!a.lido && <span aria-label="não lido" className="size-2 shrink-0 rounded-full bg-[var(--primary)]" />}
          <span className="min-w-0 flex-1 truncate text-base font-bold">{a.fornecedor ?? "Fornecedor"}</span>
          <span className="shrink-0 rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-xs font-semibold tabular-nums">{a.hora}</span>
        </p>
        <p className="truncate leading-snug first-letter:uppercase">{tituloCurto(a.titulo)}</p>
        {detalhe && <p className="line-clamp-2 text-sm text-[var(--muted-foreground)]">{detalhe}</p>}
        {a.pedeAcao && (
          <span className="selo inline-block" style={{ color: a.resolvido ? "var(--ok-strong)" : "var(--warn)" }}>
            {a.resolvido ? "resolvido" : "esperando você"}
          </span>
        )}
        {(faltaAberta || diferencaAberta || href) && (
          <div className="flex flex-wrap gap-2 pt-1.5">
            {faltaAberta && a.itens.length > 0 && (
              <Link href={comprarDeOutro(a)} onClick={marcar} className={BOTAO_CHEIO}>
                <ShoppingCart aria-hidden className="size-4" />
                Comprar de outro
              </Link>
            )}
            {/* A casa decidiu ficar sem: o aviso sai de "esperando você". */}
            {faltaAberta && (
              <button
                type="button"
                disabled={dispensando}
                onClick={() =>
                  startDispensa(async () => {
                    const r = await resolverAviso(a.id);
                    if (!r.ok) setErro(r.message);
                  })
                }
                aria-label="Não vou comprar"
                title="Não vou comprar"
                className={BOTAO_SIMBOLO}
              >
                <CarrinhoRiscado />
              </button>
            )}
            {diferencaAberta && (
              <Link href="/admin/compras/pendencias" onClick={marcar} className={BOTAO_CHEIO}>
                <Wrench aria-hidden className="size-4" />
                Resolver
              </Link>
            )}
            {href && (
              <Link href={href} onClick={marcar} className={BOTAO_CONTORNO}>
                {a.pedidoId !== null ? <FileText aria-hidden className="size-4" /> : <Scale aria-hidden className="size-4" />}
                {a.pedidoId !== null ? "Ver pedido" : "Comparar preços"}
              </Link>
            )}
          </div>
        )}
        {erro && (
          <p role="alert" className="text-xs font-medium" style={{ color: "var(--destructive)" }}>
            {erro}
          </p>
        )}
      </div>
    </li>
  );
}
