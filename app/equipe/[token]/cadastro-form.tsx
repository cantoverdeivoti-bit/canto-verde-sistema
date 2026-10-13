"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { enviarAtualizacaoPeloLink, enviarCadastroPeloLink } from "@/lib/actions/pessoal";
import { mascaraCpf } from "@/lib/pessoal";
import { maskPhoneBR } from "@/lib/phone-mask";
import type { CadastroPeloLinkInput } from "@/lib/validations";

const VAZIO: CadastroPeloLinkInput = {
  nome: "",
  telefone: "",
  cpf: "",
  nascimento: "",
  endereco: "",
  emergenciaNome: "",
  emergenciaTelefone: "",
};

const opcional = <span className="font-normal text-[var(--muted-foreground)]">(opcional)</span>;

/**
 * O que a pessoa preenche. Nome, telefone e CPF são obrigatórios; o resto
 * ajuda, mas não trava o envio. Tipo, função e valores quem decide é a casa,
 * na hora de aprovar.
 */
export function CadastroForm({ token, inicial }: { token: string; inicial?: CadastroPeloLinkInput }) {
  // Com `inicial`, é quem já é da equipe atualizando: o CPF pode ficar em branco.
  const atualizando = inicial !== undefined;
  const [v, setV] = useState(inicial ?? VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [pendente, startTransition] = useTransition();
  const muda = (k: keyof CadastroPeloLinkInput, valor: string) => setV((a) => ({ ...a, [k]: valor }));

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = atualizando ? await enviarAtualizacaoPeloLink(token, v) : await enviarCadastroPeloLink(token, v);
      if (r.ok) setPronto(true);
      else setErro(r.message ?? "Não deu certo. Tente de novo.");
    });
  }

  if (pronto) {
    return (
      <div className="space-y-4">
        <p className="phrase">Recebido, {v.nome.trim().split(/\s+/)[0]}!</p>
        <p className="text-[var(--muted-foreground)]">
          {atualizando ? "O restaurante vai conferir a atualização." : "O restaurante vai conferir o seu cadastro."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <div>
        <label className="label" htmlFor="nome">
          Nome completo
        </label>
        <Input id="nome" value={v.nome} onChange={(e) => muda("nome", e.target.value)} autoComplete="name" maxLength={80} required />
      </div>

      <div>
        <label className="label" htmlFor="telefone">
          Telefone
        </label>
        <Input
          id="telefone"
          value={v.telefone}
          onChange={(e) => muda("telefone", maskPhoneBR(e.target.value))}
          inputMode="tel"
          autoComplete="tel"
          placeholder="(51) 99999-9999"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="cpf">
          CPF
        </label>
        {atualizando && <p className="hint -mt-1 mb-1.5">Deixe em branco para manter o que já está no cadastro.</p>}
        <Input
          id="cpf"
          value={v.cpf}
          onChange={(e) => muda("cpf", mascaraCpf(e.target.value))}
          inputMode="numeric"
          placeholder="000.000.000-00"
          required={!atualizando}
          className="w-48"
        />
      </div>

      <div>
        <label className="label" htmlFor="nascimento">
          Data de nascimento {opcional}
        </label>
        <Input
          id="nascimento"
          type="date"
          value={v.nascimento}
          onChange={(e) => muda("nascimento", e.target.value)}
          autoComplete="bday"
          className="w-48"
        />
      </div>

      <div>
        <label className="label" htmlFor="endereco">
          Endereço {opcional}
        </label>
        <Input
          id="endereco"
          value={v.endereco}
          onChange={(e) => muda("endereco", e.target.value)}
          autoComplete="street-address"
          placeholder="Rua, número, bairro, cidade"
          maxLength={200}
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="label">Contato de emergência {opcional}</legend>
        <p className="hint -mt-1">Quem avisamos se acontecer alguma coisa com você no trabalho.</p>
        <Input
          aria-label="Nome do contato de emergência"
          value={v.emergenciaNome}
          onChange={(e) => muda("emergenciaNome", e.target.value)}
          placeholder="Nome"
          maxLength={80}
        />
        <Input
          aria-label="Telefone do contato de emergência"
          value={v.emergenciaTelefone}
          onChange={(e) => muda("emergenciaTelefone", maskPhoneBR(e.target.value))}
          inputMode="tel"
          placeholder="(51) 99999-9999"
        />
      </fieldset>

      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pendente}>
        {pendente ? "Enviando…" : atualizando ? "Enviar atualização" : "Enviar cadastro"}
      </Button>
    </form>
  );
}
