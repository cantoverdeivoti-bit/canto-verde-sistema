"use client";

import Link from "next/link";
import { useState } from "react";

import { Lista, Vazio } from "@/components/pagina";
import { Input } from "@/components/ui/input";
import { corDoTom } from "@/lib/cotacao-labels";
import { STATUS_EVENTO, TIPO_EVENTO, type ChaveDaAba } from "@/lib/eventos";
import { formatPct } from "@/lib/eventos-calculo";
import type { EventoResumido } from "@/lib/eventos-dados";
import { chave, formatDiaCurtoString, formatMoney } from "@/lib/format";

const VAZIO: Record<ChaveDaAba, string> = {
  orcamentos: "Nenhum orçamento em aberto.",
  andamento: "Nenhum evento confirmado pela frente.",
  concluidos: "Nenhum evento realizado ainda.",
  perdidos: "Nenhum orçamento perdido. Bom sinal.",
};

export function ListaDeEventos({ eventos, aba, hoje }: { eventos: EventoResumido[]; aba: ChaveDaAba; hoje: string }) {
  const [busca, setBusca] = useState("");
  const q = chave(busca);
  const visiveis = eventos.filter((e) => chave(`${e.titulo} ${e.cliente.nome}`).includes(q));
  const total = visiveis.reduce((s, e) => s + e.totalCliente, 0);
  const aReceber = visiveis.reduce((s, e) => s + e.saldo, 0);

  if (eventos.length === 0) return <Vazio>{VAZIO[aba]}</Vazio>;

  return (
    <div className="space-y-3">
      <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por evento ou cliente" aria-label="Buscar" />
      <Lista>
        {visiveis.map((e) => {
          const vencido = (e.status === "ENVIADO" && e.validoAte !== null && e.validoAte < hoje) || (e.status !== "REALIZADO" && e.status !== "PERDIDO" && e.status !== "CANCELADO" && e.data < hoje);
          return (
            <li key={e.id}>
              <Link href={`/admin/eventos/orcamentos/${e.id}`} className="flex min-h-16 items-center gap-3 px-3 py-2 hover:bg-[var(--muted)]">
                <div className="num-display w-14 shrink-0 text-center text-sm leading-tight">
                  {formatDiaCurtoString(e.data).split(", ")[1]}
                  <span className="block text-[11px] font-normal text-[var(--muted-foreground)]">{formatDiaCurtoString(e.data).split(", ")[0]}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{e.titulo}</p>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">
                    {e.cliente.nome} · {TIPO_EVENTO[e.tipo]} · {e.convidados} convidados
                    {e.horaInicio && ` · ${e.horaInicio}`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="selo" style={{ color: vencido ? "var(--destructive)" : corDoTom(STATUS_EVENTO[e.status].tom) }}>
                    {vencido ? (e.data < hoje ? "data passou" : "validade venceu") : STATUS_EVENTO[e.status].texto}
                  </span>
                  <p className="num-display mt-1 text-sm">{formatMoney(e.totalCliente)}</p>
                  <p className="text-[11px] text-[var(--muted-foreground)]">
                    {e.status === "CONFIRMADO" || e.status === "REALIZADO"
                      ? e.saldo > 0
                        ? `falta ${formatMoney(e.saldo)}`
                        : "pago"
                      : `margem ${formatPct(e.margemPct)}`}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </Lista>
      <p className="text-right text-sm text-[var(--muted-foreground)]">
        Total: <span className="num-display text-[var(--foreground)]">{formatMoney(total)}</span>
        {(aba === "andamento" || aba === "concluidos") && aReceber > 0 && (
          <>
            {" "}
            · a receber: <span className="num-display text-[var(--foreground)]">{formatMoney(aReceber)}</span>
          </>
        )}
      </p>
    </div>
  );
}
