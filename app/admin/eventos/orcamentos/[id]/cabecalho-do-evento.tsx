"use client";

import { Copy, FileText, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BotaoQuadrado, CartaoDeBotoes } from "@/components/botao-quadrado";
import { CabecalhoDaPagina } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { duplicarEvento, mudarStatus } from "@/lib/actions/eventos";
import { corDoTom } from "@/lib/cotacao-labels";
import { FORMATO_EVENTO, MOTIVO_PERDA, STATUS_EVENTO, TIPO_EVENTO, opcoes } from "@/lib/eventos";
import { formatDateString, formatDiaCurtoString } from "@/lib/format";
import type { FormatoEvento, MotivoPerda, StatusEvento, TipoEvento } from "@/generated/prisma/client";

import { useAcao } from "@/lib/use-acao";
import { pdfDe } from "@/lib/pdf-da-pagina";

type Evento = {
  id: number;
  titulo: string;
  status: StatusEvento;
  tipo: TipoEvento;
  data: string;
  horaInicio: string | null;
  horaFim: string | null;
  convidados: number;
  formato: FormatoEvento;
  validoAte: string | null;
  motivoPerda: MotivoPerda | null;
  motivoPerdaTexto: string | null;
  cliente: { id: number; nome: string };
};

/** Os botões de cada situação: o passo seguinte em destaque, os outros ao lado. */
const BOTOES: Record<StatusEvento, { para: StatusEvento; texto: string; principal?: boolean }[]> = {
  RASCUNHO: [
    { para: "ENVIADO", texto: "Marcar como enviado", principal: true },
    { para: "CONFIRMADO", texto: "Cliente fechou" },
    { para: "PERDIDO", texto: "Perdido" },
  ],
  ENVIADO: [
    { para: "CONFIRMADO", texto: "Cliente fechou", principal: true },
    { para: "PERDIDO", texto: "Perdido" },
    { para: "RASCUNHO", texto: "Voltar para rascunho" },
  ],
  CONFIRMADO: [
    { para: "REALIZADO", texto: "Evento realizado", principal: true },
    { para: "CANCELADO", texto: "Cancelado" },
    { para: "ENVIADO", texto: "Desfazer confirmação" },
  ],
  REALIZADO: [{ para: "CONFIRMADO", texto: "Desfazer: não aconteceu ainda" }],
  PERDIDO: [{ para: "RASCUNHO", texto: "Reabrir orçamento" }],
  CANCELADO: [
    { para: "CONFIRMADO", texto: "Voltou a confirmar" },
    { para: "RASCUNHO", texto: "Reabrir como orçamento" },
  ],
};

export function CabecalhoDoEvento({ evento: e, avisos, whatsapp }: { evento: Evento; avisos: string[]; whatsapp: string | null }) {
  const router = useRouter();
  const [encerrando, setEncerrando] = useState<StatusEvento | null>(null);
  const [motivo, setMotivo] = useState<MotivoPerda>("PRECO");
  const [texto, setTexto] = useState("");
  const { erro, pendente, rodar } = useAcao();
  const s = STATUS_EVENTO[e.status];

  return (
    <div className="space-y-4">
      <div>
        <CabecalhoDaPagina
          voltar={{ href: "/admin/eventos/orcamentos", texto: "Orçamentos" }}
          titulo={e.titulo}
          acoes={
            <>
              <span className="selo" style={{ color: corDoTom(s.tom) }}>
                {s.texto}
              </span>
              <span className="text-xs text-[var(--muted-foreground)]">#{e.id}</span>
            </>
          }
          subtitulo={
            <>
              <Link href={`/admin/eventos/clientes/${e.cliente.id}`} className="font-medium text-[var(--foreground)] underline-offset-4 hover:underline">
                {e.cliente.nome}
              </Link>
              {" · "}
              {TIPO_EVENTO[e.tipo]} · {formatDateString(e.data)}
              {e.horaInicio && `, ${e.horaInicio}${e.horaFim ? ` às ${e.horaFim}` : ""}`} · {e.convidados} convidados ·{" "}
              {FORMATO_EVENTO[e.formato].toLowerCase()}
              {e.validoAte && e.status === "ENVIADO" && ` · vale até ${formatDiaCurtoString(e.validoAte)}`}
            </>
          }
        />
        {e.motivoPerda && (
          <p className="mt-1 text-sm">
            Motivo: {MOTIVO_PERDA[e.motivoPerda]}
            {e.motivoPerdaTexto && `. ${e.motivoPerdaTexto}`}
          </p>
        )}
      </div>

      {avisos.length > 0 && (
        <ul className="msg-warn list-disc space-y-1 pl-8">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {BOTOES[e.status].map((b) =>
          b.principal ? (
            <Button key={b.para} type="button" disabled={pendente} onClick={() => rodar(() => mudarStatus(e.id, b.para))}>
              {b.texto}
            </Button>
          ) : (
            <button
              key={b.para}
              type="button"
              className="btn-ghost"
              disabled={pendente}
              onClick={() => (b.para === "PERDIDO" || b.para === "CANCELADO" ? setEncerrando(b.para) : rodar(() => mudarStatus(e.id, b.para)))}
            >
              {b.texto}
            </button>
          ),
        )}
      </div>

      {encerrando && (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            rodar(() => mudarStatus(e.id, encerrando, { motivo, texto }), () => setEncerrando(null));
          }}
          className="card-alerta flex flex-wrap items-end gap-2 p-3"
        >
          <label>
            <span className="label">Por quê?</span>
            <select value={motivo} onChange={(ev) => setMotivo(ev.target.value as MotivoPerda)} className="field h-10 py-0">
              {opcoes(MOTIVO_PERDA).map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.texto}
                </option>
              ))}
            </select>
          </label>
          <Input value={texto} onChange={(ev) => setTexto(ev.target.value)} placeholder="Detalhe (opcional)" maxLength={500} aria-label="Detalhe do motivo" className="h-10 min-w-48 flex-1" />
          <Button type="submit" variant="destructive" className="h-10" disabled={pendente}>
            Marcar como {encerrando === "PERDIDO" ? "perdido" : "cancelado"}
          </Button>
          <Button type="button" variant="ghost" className="h-10" onClick={() => setEncerrando(null)}>
            voltar
          </Button>
        </form>
      )}

      <CartaoDeBotoes>
        <BotaoQuadrado icone={FileText} texto="Proposta para o cliente" href={pdfDe(`/imprimir/proposta/${e.id}`)} baixar />
        {whatsapp && <BotaoQuadrado icone={MessageCircle} texto="WhatsApp" href={whatsapp} externo />}
        <BotaoQuadrado
          icone={Copy}
          texto="Duplicar"
          desligado={pendente}
          onClick={() => rodar(() => duplicarEvento(e.id), (r) => r.ok && router.push(`/admin/eventos/orcamentos/${r.data.id}`))}
        />
      </CartaoDeBotoes>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </div>
  );
}
