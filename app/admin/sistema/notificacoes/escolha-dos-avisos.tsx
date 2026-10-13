"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarEmail, salvarPreferencia, testarEmail } from "@/lib/actions/notificacoes";
import type { Canal } from "@/lib/notificacoes";

export type GrupoDeAvisos = {
  nome: string;
  /** `secao` separa dentro do módulo: em Compras, com divergência, recebido e outros. */
  eventos: { chave: string; nome: string; detalhe: string; secao: string | null; celular: boolean; email: boolean }[];
};

/** O e-mail da pessoa, com o teste ao lado. */
export function EmailDosAvisos({ email, configurado }: { email: string; configurado: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState(email);
  const [recado, setRecado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  const mudou = texto.trim().toLowerCase() !== email;

  function rodar(acao: () => Promise<{ ok: boolean; message?: string }>, deuCerto: string) {
    setRecado(null);
    startTransition(async () => {
      const r = await acao();
      setRecado(r.ok ? { ok: true, texto: deuCerto } : { ok: false, texto: r.message ?? "Não deu certo." });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="voce@exemplo.com"
          aria-label="Seu e-mail para os avisos"
          className="h-10 min-w-0 flex-1 basis-56"
        />
        {mudou ? (
          <Button type="button" className="h-10" disabled={pendente} onClick={() => rodar(() => salvarEmail(texto), "E-mail salvo.")}>
            Salvar
          </Button>
        ) : (
          email !== "" && (
            <Button
              type="button"
              variant="outline"
              className="h-10"
              disabled={pendente || !configurado}
              onClick={() => rodar(testarEmail, `Enviado para ${email}. Confira também o spam.`)}
            >
              Enviar teste
            </Button>
          )
        )}
      </div>
      {!configurado && (
        <p className="hint">O envio de e-mail ainda não foi configurado no servidor: os avisos por e-mail ficam guardados para quando for.</p>
      )}
      {recado && (
        <p role={recado.ok ? "status" : "alert"} className={recado.ok ? "text-sm text-[var(--ok-strong)]" : "msg-error"}>
          {recado.texto}
        </p>
      )}
    </div>
  );
}

/** Um interruptor, no mesmo desenho dos de encargos e benefícios. */
function Interruptor({
  ligado,
  rotulo,
  disabled,
  aoTrocar,
}: {
  ligado: boolean;
  rotulo: string;
  disabled?: boolean;
  aoTrocar: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={disabled}
      onClick={aoTrocar}
      className={`relative h-6 w-10 shrink-0 rounded-full transition disabled:opacity-40 ${ligado ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
    >
      <span
        aria-hidden
        className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${ligado ? "left-[18px]" : "left-0.5"}`}
      />
    </button>
  );
}

/**
 * Os avisos que a pessoa pode receber, por módulo, cada um com Celular e
 * E-mail. Grava no toque; a tela muda na hora e volta se o servidor recusar.
 */
export function EscolhaDosAvisos({ grupos, temEmail }: { grupos: GrupoDeAvisos[]; temEmail: boolean }) {
  const [estado, setEstado] = useState(() =>
    Object.fromEntries(grupos.flatMap((g) => g.eventos.map((e) => [e.chave, { celular: e.celular, email: e.email }]))),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function trocar(chave: string, canal: Canal) {
    const antes = estado[chave][canal];
    setErro(null);
    setEstado((s) => ({ ...s, [chave]: { ...s[chave], [canal]: !antes } }));
    startTransition(async () => {
      const r = await salvarPreferencia(chave, canal, !antes);
      if (!r.ok) {
        setErro(r.message);
        setEstado((s) => ({ ...s, [chave]: { ...s[chave], [canal]: antes } }));
      }
    });
  }

  return (
    <div className="space-y-4">
      {!temEmail && <p className="hint">Para ligar o e-mail, cadastre o seu e-mail acima.</p>}
      {grupos.map((g) => (
        <section key={g.nome}>
          <h3 className="mb-1.5 text-sm font-semibold">{g.nome}</h3>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
            {g.eventos.map((e, i) => (
              <li key={e.chave}>
                {e.secao && e.secao !== g.eventos[i - 1]?.secao && (
                  <p className="bg-[var(--muted)] px-3 py-1 text-[11px] font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">
                    {e.secao}
                  </p>
                )}
                <div className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{e.nome}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">{e.detalhe}</p>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-0.5">
                  <span className="text-[10px] font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">Celular</span>
                  <Interruptor ligado={estado[e.chave].celular} rotulo={`${e.nome} no celular`} aoTrocar={() => trocar(e.chave, "celular")} />
                </div>
                <div className="flex shrink-0 flex-col items-center gap-0.5">
                  <span className="text-[10px] font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">E-mail</span>
                  <Interruptor
                    ligado={temEmail && estado[e.chave].email}
                    rotulo={`${e.nome} no e-mail`}
                    disabled={!temEmail}
                    aoTrocar={() => trocar(e.chave, "email")}
                  />
                </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {erro && (
        <p role="alert" className="msg-error">
          {erro}
        </p>
      )}
    </div>
  );
}
