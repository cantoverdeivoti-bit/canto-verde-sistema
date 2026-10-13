"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { criarEvento } from "@/lib/actions/eventos";
import { FORMATO_EVENTO, TIPO_EVENTO, opcoes } from "@/lib/eventos";
import { chave, formatMoney } from "@/lib/format";
import { maskPhoneBR } from "@/lib/phone-mask";
import type { NovoEventoInput } from "@/lib/validations";
import type { FormatoEvento } from "@/generated/prisma/client";

import { useAcao } from "@/lib/use-acao";

type Cliente = { id: number; nome: string; telefone: string | null };
type Cardapio = { id: number; nome: string; precoPorPessoa: number | null; custoPorPessoa: number };

export function NovoOrcamentoForm({
  clienteId,
  clientes,
  cardapios,
  capacidade,
  temLocacao,
}: {
  clienteId: string;
  clientes: Cliente[];
  cardapios: Cardapio[];
  capacidade: Record<FormatoEvento, number | null>;
  temLocacao: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<Required<NovoEventoInput>>({
    clienteId,
    clienteNome: "",
    clienteTelefone: "",
    titulo: "",
    tipo: "ANIVERSARIO",
    data: "",
    horaInicio: "19:30",
    horaFim: "23:30",
    convidados: "",
    formato: "SENTADO",
    cardapioId: "",
  });
  const [busca, setBusca] = useState("");
  const { erro, pendente, rodar } = useAcao();
  const muda = <K extends keyof typeof v>(k: K, valor: (typeof v)[K]) => setV((a) => ({ ...a, [k]: valor }));

  const escolhido = clientes.find((c) => String(c.id) === v.clienteId);
  const achados = busca.trim().length >= 2 ? clientes.filter((c) => chave(c.nome).includes(chave(busca))).slice(0, 6) : [];
  const convidados = Number(v.convidados) || 0;
  const limite = capacidade[v.formato];
  const cardapio = cardapios.find((c) => String(c.id) === v.cardapioId);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => criarEvento(v), (r) => r.ok && router.push(`/admin/eventos/orcamentos/${r.data.id}`));
      }}
      className="space-y-6"
    >
      <fieldset className="space-y-2">
        <legend className="label">Cliente</legend>
        {escolhido ? (
          <div className="card flex items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{escolhido.nome}</p>
              {escolhido.telefone && <p className="text-xs text-[var(--muted-foreground)]">{escolhido.telefone}</p>}
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => muda("clienteId", "")}>
              trocar
            </Button>
          </div>
        ) : (
          <>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente já cadastrado" aria-label="Buscar cliente" />
            {achados.length > 0 && (
              <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
                {achados.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => muda("clienteId", String(c.id))} className="w-full px-3 py-2 text-left hover:bg-[var(--muted)]">
                      <span className="font-semibold">{c.nome}</span>
                      {c.telefone && <span className="ml-2 text-xs text-[var(--muted-foreground)]">{c.telefone}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="hint">Ou cadastre agora, só com o básico:</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={v.clienteNome} onChange={(e) => muda("clienteNome", e.target.value)} placeholder="Nome do cliente novo" aria-label="Nome do cliente novo" maxLength={100} />
              <Input type="tel" inputMode="tel" value={v.clienteTelefone} onChange={(e) => muda("clienteTelefone", maskPhoneBR(e.target.value))} placeholder="(51) 99999-9999" aria-label="Telefone do cliente novo" />
            </div>
          </>
        )}
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Nome do evento</span>
          <Input value={v.titulo} onChange={(e) => muda("titulo", e.target.value)} required maxLength={120} placeholder="Ex.: Aniversário de 40 anos da Ana" />
        </label>
        <label>
          <span className="label">Tipo</span>
          <select value={v.tipo} onChange={(e) => muda("tipo", e.target.value as typeof v.tipo)} className="field">
            {opcoes(TIPO_EVENTO).map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.texto}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Data</span>
          <Input type="date" value={v.data} onChange={(e) => muda("data", e.target.value)} required />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label>
            <span className="label">Começa</span>
            <Input type="time" value={v.horaInicio} onChange={(e) => muda("horaInicio", e.target.value)} />
          </label>
          <label>
            <span className="label">Termina</span>
            <Input type="time" value={v.horaFim} onChange={(e) => muda("horaFim", e.target.value)} />
          </label>
        </div>
        <label>
          <span className="label">Convidados</span>
          <Input inputMode="numeric" value={String(v.convidados)} onChange={(e) => muda("convidados", e.target.value.replace(/\D/g, ""))} required />
        </label>
        <fieldset className="sm:col-span-2">
          <legend className="label">Formato</legend>
          <div className="grid grid-cols-2 gap-2">
            {opcoes(FORMATO_EVENTO).map((f) => (
              <button key={f.valor} type="button" aria-pressed={v.formato === f.valor} onClick={() => muda("formato", f.valor)} className="chip">
                {f.texto}
              </button>
            ))}
          </div>
          {limite !== null && convidados > limite && (
            <p className="msg-warn mt-2">
              {convidados} convidados passa da lotação de {limite} {v.formato === "SENTADO" ? "lugares sentados" : "pessoas em pé"}.
            </p>
          )}
        </fieldset>
        <div className="sm:col-span-2">
          <label>
            <span className="label">Cardápio</span>
          <select value={v.cardapioId} onChange={(e) => muda("cardapioId", e.target.value)} className="field">
            <option value="">Escolher depois</option>
            {cardapios.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} · {c.precoPorPessoa === null ? "sem preço" : `${formatMoney(c.precoPorPessoa)} por pessoa`}
              </option>
            ))}
          </select>
          </label>
          {cardapio && convidados > 0 && cardapio.precoPorPessoa !== null && (
            <span className="hint block">
              Comida: {formatMoney(cardapio.precoPorPessoa * convidados)} para {convidados} convidados.
            </span>
          )}
        </div>
      </div>

      <p className="hint">
        O orçamento nasce como rascunho{temLocacao ? ", com a locação do espaço" : ""}
        {v.cardapioId ? " e a comida do cardápio" : ""}. Bebida, equipe, decoração e o resto se põem na tela seguinte.
      </p>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pendente}>
        {pendente ? "Criando…" : "Criar orçamento"}
      </Button>
    </form>
  );
}
