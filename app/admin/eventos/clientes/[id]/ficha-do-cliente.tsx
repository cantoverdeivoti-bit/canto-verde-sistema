"use client";

import { MessageCircle, PhoneCall, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apagarCliente, apagarInteracao, limparProximoContato, registrarInteracao } from "@/lib/actions/eventos";
import { corDoTom } from "@/lib/cotacao-labels";
import { STATUS_EVENTO, TIPO_INTERACAO, opcoes } from "@/lib/eventos";
import type { EventoResumido } from "@/lib/eventos-dados";
import { formatDateTime, formatDiaCurtoString, formatMoney, FUSO_DA_CASA } from "@/lib/format";
import type { TipoInteracao } from "@/generated/prisma/client";

import { useAcao } from "@/lib/use-acao";

type Interacao = { id: number; tipo: TipoInteracao; texto: string; em: string; autor: string | null; evento: { id: number; titulo: string } | null };

/** O que se faz com o cliente: falar, anotar, marcar o retorno e abrir orçamento. */
export function FichaDoCliente({
  cliente,
  eventos,
  interacoes,
}: {
  cliente: { id: number; nome: string; whatsapp: string | null; proximoContato: string | null };
  eventos: EventoResumido[];
  interacoes: Interacao[];
}) {
  const router = useRouter();
  const [nota, setNota] = useState({ tipo: "WHATSAPP" as TipoInteracao, texto: "", proximoContato: "" });
  const [eventoId, setEventoId] = useState("");
  const [apagando, setApagando] = useState(false);
  const { erro, pendente, rodar } = useAcao();

  return (
    <div className="space-y-6">
      <CartaoDeBotoes>
        <BotaoQuadrado icone={Plus} texto="Novo orçamento" tom="primario" href={`/admin/eventos/orcamentos/novo?cliente=${cliente.id}`} />
        {cliente.whatsapp && <BotaoQuadrado icone={MessageCircle} texto="WhatsApp" href={cliente.whatsapp} externo />}
        {cliente.proximoContato && (
          <BotaoQuadrado
            icone={PhoneCall}
            texto={`Já retornei (${formatDiaCurtoString(cliente.proximoContato)})`}
            desligado={pendente}
            onClick={() => rodar(() => limparProximoContato(cliente.id))}
          />
        )}
      </CartaoDeBotoes>

      <section>
        <h2 className="section-label mb-2">Eventos</h2>
        {eventos.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Nenhum ainda.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {eventos.map((e) => (
              <li key={e.id}>
                <Link href={`/admin/eventos/orcamentos/${e.id}`} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-[var(--muted)]">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{e.titulo}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {formatDiaCurtoString(e.data)} · {e.convidados} convidados
                    </p>
                  </div>
                  <span className="selo" style={{ color: corDoTom(STATUS_EVENTO[e.status].tom) }}>
                    {STATUS_EVENTO[e.status].texto}
                  </span>
                  <span className="num-display w-24 text-right text-sm">{formatMoney(e.totalCliente)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="section-label mb-2">Conversas</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            rodar(() => registrarInteracao(cliente.id, Number(eventoId) || null, nota), () =>
              setNota((n) => ({ ...n, texto: "", proximoContato: "" })),
            );
          }}
          className="card space-y-3 p-3"
        >
          <div className="flex flex-wrap gap-1.5">
            {opcoes(TIPO_INTERACAO).map((t) => (
              <button key={t.valor} type="button" aria-pressed={nota.tipo === t.valor} onClick={() => setNota((n) => ({ ...n, tipo: t.valor }))} className="chip px-2.5 py-1 text-xs">
                {t.texto}
              </button>
            ))}
          </div>
          <Textarea value={nota.texto} onChange={(e) => setNota((n) => ({ ...n, texto: e.target.value }))} rows={2} maxLength={2000} placeholder="O que foi conversado" aria-label="O que foi conversado" />
          <div className="flex flex-wrap items-end gap-2">
            {eventos.length > 0 && (
              <label>
                <span className="label">Sobre</span>
                <select value={eventoId} onChange={(e) => setEventoId(e.target.value)} className="field h-10 py-0">
                  <option value="">Nenhum evento</option>
                  {eventos.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.titulo}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span className="label">Retornar em</span>
              <Input type="date" value={nota.proximoContato} onChange={(e) => setNota((n) => ({ ...n, proximoContato: e.target.value }))} className="h-10 w-44" />
            </label>
            <Button type="submit" className="h-10" disabled={pendente || nota.texto.trim().length < 2}>
              Anotar
            </Button>
          </div>
        </form>
        {erro && (
          <p role="alert" className="msg-error mt-2">
            {erro}
          </p>
        )}
        <ol className="mt-3 space-y-2">
          {interacoes.map((i) => (
            <li key={i.id} className="flex gap-2 border-l-2 border-[var(--border)] pl-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[var(--muted-foreground)]">
                  {TIPO_INTERACAO[i.tipo]} · {formatDateTime(new Date(i.em), FUSO_DA_CASA)}
                  {i.autor && ` · ${i.autor}`}
                  {i.evento && ` · ${i.evento.titulo}`}
                </p>
                <p className="text-sm whitespace-pre-line">{i.texto}</p>
              </div>
              <button type="button" disabled={pendente} onClick={() => rodar(() => apagarInteracao(i.id))} aria-label="Apagar anotação" title="Apagar" className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]">
                <Trash2 aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ol>
      </section>

      {eventos.length === 0 && (
        <div>
          {apagando ? (
            <div className="flex gap-2">
              <Button type="button" variant="destructive" disabled={pendente} onClick={() => rodar(() => apagarCliente(cliente.id), () => router.push("/admin/eventos/clientes"))}>
                Apagar {cliente.nome}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setApagando(false)}>
                voltar
              </Button>
            </div>
          ) : (
            <button type="button" className="text-sm text-[var(--muted-foreground)] underline" onClick={() => setApagando(true)}>
              Apagar este cliente
            </button>
          )}
        </div>
      )}
    </div>
  );
}
