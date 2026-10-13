"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { salvarCliente } from "@/lib/actions/eventos";
import { ORIGEM_CLIENTE, TIPO_CLIENTE, opcoes } from "@/lib/eventos";
import { maskPhoneBR } from "@/lib/phone-mask";
import type { ClienteEventoInput } from "@/lib/validations";

import { useAcao } from "@/lib/use-acao";

export type ClienteNoForm = Required<ClienteEventoInput>;

export const CLIENTE_VAZIO: ClienteNoForm = {
  nome: "",
  tipo: "PESSOA",
  documento: "",
  telefone: "",
  email: "",
  origem: "",
  observacoes: "",
  proximoContato: "",
};

/** Cadastro do cliente. Novo, abre a ficha dele ao salvar. */
export function ClienteForm({ id, inicial, fechar }: { id: number | null; inicial: ClienteNoForm; fechar?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState(inicial);
  const { erro, pendente, rodar } = useAcao();
  const muda = <K extends keyof ClienteNoForm>(k: K, valor: ClienteNoForm[K]) => {
    setV((a) => ({ ...a, [k]: valor }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        rodar(
          () => salvarCliente(id, v),
          (r) => {
            if (id === null && r.ok) router.push(`/admin/eventos/clientes/${r.data.id}`);
          },
          // Novo abre a ficha; mudando um que existe, a faixa diz que salvou.
          id === null ? undefined : { aviso: "Salvo" },
        );
      }}
      className="card space-y-3 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="label">Nome</span>
          <Input value={v.nome} onChange={(e) => muda("nome", e.target.value)} required maxLength={100} />
        </label>
        <fieldset>
          <legend className="label">É</legend>
          <div className="flex gap-1.5">
            {opcoes(TIPO_CLIENTE).map((t) => (
              <button key={t.valor} type="button" aria-pressed={v.tipo === t.valor} onClick={() => muda("tipo", t.valor)} className="chip flex-1">
                {t.texto}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          <span className="label">{v.tipo === "EMPRESA" ? "CNPJ" : "CPF"} (opcional)</span>
          <Input inputMode="numeric" value={v.documento} onChange={(e) => muda("documento", e.target.value)} maxLength={18} />
        </label>
        <label>
          <span className="label">Telefone</span>
          <Input type="tel" inputMode="tel" value={v.telefone} onChange={(e) => muda("telefone", maskPhoneBR(e.target.value))} placeholder="(51) 99999-9999" />
        </label>
        <label>
          <span className="label">E-mail</span>
          <Input type="email" value={v.email} onChange={(e) => muda("email", e.target.value)} />
        </label>
        <label>
          <span className="label">Como chegou</span>
          <select value={v.origem} onChange={(e) => muda("origem", e.target.value as ClienteNoForm["origem"])} className="field">
            <option value="">Não sei</option>
            {opcoes(ORIGEM_CLIENTE).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Retornar em</span>
          <Input type="date" value={v.proximoContato} onChange={(e) => muda("proximoContato", e.target.value)} />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Observações</span>
          <Textarea value={v.observacoes} onChange={(e) => muda("observacoes", e.target.value)} rows={3} maxLength={1000} placeholder="Preferências, quem decide, datas importantes." />
        </label>
      </div>
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : id === null ? "Cadastrar" : "Salvar"}
        </Button>
        {fechar && (
          <Button type="button" variant="ghost" onClick={fechar}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
