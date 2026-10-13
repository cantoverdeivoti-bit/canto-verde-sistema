"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Lista, Vazio } from "@/components/pagina";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ORIGEM_CLIENTE } from "@/lib/eventos";
import { chave, formatDiaCurtoString, formatMoney, formatPhone, plural } from "@/lib/format";
import type { OrigemCliente, TipoCliente } from "@/generated/prisma/client";

import { CLIENTE_VAZIO, ClienteForm } from "./cliente-form";

type Cliente = {
  id: number;
  nome: string;
  tipo: TipoCliente;
  telefone: string | null;
  origem: OrigemCliente | null;
  proximoContato: string | null;
  eventos: number;
  fechados: number;
  emAberto: number;
  totalFechado: number;
  ultimo: { titulo: string; data: string } | null;
};

export function ListaDeClientes({ itens, hoje }: { itens: Cliente[]; hoje: string }) {
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);
  const [soRetornar, setSoRetornar] = useState(false);

  const retornar = (c: Cliente) => c.proximoContato !== null && c.proximoContato <= hoje;
  const q = chave(busca);
  const digitos = busca.replace(/\D/g, "");
  const visiveis = itens
    .filter((c) => chave(c.nome).includes(q) || (digitos.length >= 3 && (c.telefone ?? "").includes(digitos)))
    .filter((c) => !soRetornar || retornar(c))
    // Quem está para retornar vem primeiro, do mais atrasado ao de hoje.
    .sort((a, b) => Number(retornar(b)) - Number(retornar(a)) || (retornar(a) ? a.proximoContato!.localeCompare(b.proximoContato!) : 0));
  const quantosRetornar = itens.filter(retornar).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" aria-label="Buscar cliente" className="min-w-48 flex-1" />
        <Button type="button" className="h-11 shrink-0 gap-1.5" onClick={() => setNovo(!novo)}>
          <Plus aria-hidden className="size-4" />
          Novo cliente
        </Button>
      </div>
      {quantosRetornar > 0 && (
        <button type="button" aria-pressed={soRetornar} onClick={() => setSoRetornar(!soRetornar)} className="chip text-sm">
          {plural(quantosRetornar, "cliente para retornar", "clientes para retornar")}
        </button>
      )}

      {novo && <ClienteForm id={null} inicial={CLIENTE_VAZIO} fechar={() => setNovo(false)} />}

      {visiveis.length === 0 ? (
        <Vazio>{itens.length === 0 ? "Nenhum cliente ainda." : "Ninguém com esse nome."}</Vazio>
      ) : (
        <Lista>
          {visiveis.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/eventos/clientes/${c.id}`} className="flex min-h-16 items-center gap-3 px-3 py-2 hover:bg-[var(--muted)]">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {c.nome}
                    {c.tipo === "EMPRESA" && <span className="ml-1.5 text-xs font-normal text-[var(--muted-foreground)]">empresa</span>}
                  </p>
                  <p className="truncate text-xs text-[var(--muted-foreground)]">
                    {[
                      c.telefone ? formatPhone(c.telefone) : null,
                      c.origem ? ORIGEM_CLIENTE[c.origem] : null,
                      c.eventos === 0 ? "sem evento" : plural(c.eventos, "orçamento"),
                      c.emAberto > 0 ? `${c.emAberto} em aberto` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {c.proximoContato && (
                    <span className="selo" style={{ color: retornar(c) ? "var(--warn)" : "var(--muted-foreground)" }}>
                      {retornar(c) ? "retornar" : "retornar em"} {formatDiaCurtoString(c.proximoContato)}
                    </span>
                  )}
                  {c.fechados > 0 && <p className="num-display mt-1 text-sm">{formatMoney(c.totalFechado)}</p>}
                </div>
              </Link>
            </li>
          ))}
        </Lista>
      )}
    </div>
  );
}
