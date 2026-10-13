"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apagarEvento, mudarValidade, salvarEvento } from "@/lib/actions/eventos";
import { FORMATO_EVENTO, TIPO_EVENTO, opcoes } from "@/lib/eventos";
import type { EventoInput } from "@/lib/validations";

import { useAcao } from "@/lib/use-acao";

type NoForm = Required<{ [K in keyof EventoInput]: EventoInput[K] }>;

/** Os dados do evento e as anotações. Fica embaixo: muda pouco depois de criado. */
export function DadosDoEvento({
  eventoId,
  inicial,
  validoAte,
  podeApagar,
}: {
  eventoId: number;
  inicial: NoForm;
  validoAte: string;
  podeApagar: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(inicial);
  const [validade, setValidade] = useState(validoAte);
  const [apagando, setApagando] = useState(false);
  const { erro, pendente, rodar } = useAcao();
  const muda = <K extends keyof NoForm>(k: K, valor: NoForm[K]) => {
    setV((a) => ({ ...a, [k]: valor }));
  };

  return (
    <section>
      <h2 className="section-label mb-2">Dados do evento</h2>
      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          rodar(() => salvarEvento(eventoId, v), undefined, { aviso: "Salvo" });
        }}
        className="card space-y-3 p-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="label">Nome do evento</span>
            <Input value={v.titulo} onChange={(ev) => muda("titulo", ev.target.value)} maxLength={120} />
          </label>
          <label>
            <span className="label">Tipo</span>
            <select value={v.tipo} onChange={(ev) => muda("tipo", ev.target.value as NoForm["tipo"])} className="field">
              {opcoes(TIPO_EVENTO).map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.texto}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Data</span>
            <Input type="date" value={v.data} onChange={(ev) => muda("data", ev.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="label">Começa</span>
              <Input type="time" value={v.horaInicio} onChange={(ev) => muda("horaInicio", ev.target.value)} />
            </label>
            <label>
              <span className="label">Termina</span>
              <Input type="time" value={v.horaFim} onChange={(ev) => muda("horaFim", ev.target.value)} />
            </label>
          </div>
          <label>
            <span className="label">Convidados</span>
            <Input inputMode="numeric" value={String(v.convidados)} onChange={(ev) => muda("convidados", ev.target.value.replace(/\D/g, ""))} />
          </label>
          <label>
            <span className="label">Formato</span>
            <select value={v.formato} onChange={(ev) => muda("formato", ev.target.value as NoForm["formato"])} className="field">
              {opcoes(FORMATO_EVENTO).map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.texto}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="label">Taxa de serviço %</span>
              <Input inputMode="decimal" value={v.taxaServicoPct} onChange={(ev) => muda("taxaServicoPct", ev.target.value)} />
            </label>
            <label>
              <span className="label">Imposto %</span>
              <Input inputMode="decimal" value={v.impostoPct} onChange={(ev) => muda("impostoPct", ev.target.value)} />
            </label>
          </div>
          <label className="sm:col-span-2">
            <span className="label">Texto para o cliente</span>
            <Textarea value={v.observacoesCliente} onChange={(ev) => muda("observacoesCliente", ev.target.value)} rows={3} maxLength={3000} placeholder="Sai na proposta: o que está incluso, como funciona o bolo, a música." />
          </label>
          <label className="sm:col-span-2">
            <span className="label">Anotações internas</span>
            <Textarea value={v.observacoesInternas} onChange={(ev) => muda("observacoesInternas", ev.target.value)} rows={3} maxLength={3000} placeholder="Só a casa vê." />
          </label>
        </div>
        <p className="hint">Mudar o número de convidados atualiza as linhas marcadas como por convidado.</p>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={pendente}>
            Salvar
          </Button>
        </div>
      </form>

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          rodar(() => mudarValidade(eventoId, validade));
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label>
          <span className="label">Orçamento vale até</span>
          <Input type="date" value={validade} onChange={(ev) => setValidade(ev.target.value)} className="w-44" />
        </label>
        <Button type="submit" variant="outline" className="h-11" disabled={pendente || validade === validoAte}>
          Salvar validade
        </Button>
      </form>

      {erro && (
        <p role="alert" className="msg-error mt-2">
          {erro}
        </p>
      )}

      {podeApagar && (
        <div className="mt-6">
          {apagando ? (
            <div className="flex gap-2">
              <Button type="button" variant="destructive" disabled={pendente} onClick={() => rodar(() => apagarEvento(eventoId), () => router.push("/admin/eventos/orcamentos"))}>
                Apagar de vez
              </Button>
              <Button type="button" variant="ghost" onClick={() => setApagando(false)}>
                voltar
              </Button>
            </div>
          ) : (
            <button type="button" className="text-sm text-[var(--muted-foreground)] underline" onClick={() => setApagando(true)}>
              Apagar este orçamento
            </button>
          )}
        </div>
      )}
    </section>
  );
}
