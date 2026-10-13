"use client";

import { Check, Copy, Link2, MessageCircle, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cancelarConviteColaborador, gerarConviteColaborador } from "@/lib/actions/pessoal";
import { TIPO, type TipoContrato } from "@/lib/tipos-de-contrato";

import { EscolhaDeContrato } from "../escolha-de-contrato";

export type LinkAberto = {
  id: number;
  token: string;
  tipo: TipoContrato;
  paraQuem: string | null;
  /** "segunda-feira, 12/10", já no fuso da casa. */
  vence: string;
};

/**
 * O link para a pessoa preencher o próprio cadastro. Um por pessoa: a casa
 * escolhe CLT, fixo ou free, gera, manda no WhatsApp. Quem preenche cai em
 * Pendências, esperando a aprovação.
 *
 * O botão e o painel saem juntos daqui. O pai é `flex-wrap`: o painel, com
 * `w-full order-last`, ocupa a linha de baixo, embaixo de todos os botões.
 */
export function LinkDeCadastro({ abertos, inicialAberto = false }: { abertos: LinkAberto[]; inicialAberto?: boolean }) {
  const [aberto, setAberto] = useState(inicialAberto);
  const [tipo, setTipo] = useState<TipoContrato>("CLT");
  const [paraQuem, setParaQuem] = useState("");
  const [novo, setNovo] = useState<{ token: string; tipo: TipoContrato; paraQuem: string } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [apagando, setApagando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  // O endereço do site na hora do clique, não fixo: vale em produção e no localhost.
  const endereco = (token: string) => `${window.location.origin}/equipe/${token}`;

  function gerar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await gerarConviteColaborador(tipo, paraQuem);
      if (!r.ok) return setErro(r.message);
      setNovo({ token: r.data.token, tipo, paraQuem: paraQuem.trim() });
      setParaQuem("");
    });
  }

  function whatsApp(token: string, quem: string | null) {
    const oi = quem ? `Oi, ${quem.split(/[\s,]+/)[0]}!` : "Oi!";
    const texto = `${oi} Preencha o seu cadastro no Canto Verde por aqui: ${endereco(token)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  async function copiar(token: string) {
    try {
      await navigator.clipboard.writeText(endereco(token));
      setCopiado(token);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro("Não consegui copiar. Use o botão do WhatsApp.");
    }
  }

  // O recém-gerado aparece em destaque em cima; a lista mostra os outros.
  const outros = abertos.filter((l) => l.token !== novo?.token);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10 gap-1.5"
        aria-expanded={aberto}
        onClick={() => {
          setAberto((a) => !a);
          setErro(null);
        }}
      >
        <Link2 aria-hidden className="size-4" />
        Link de cadastro
      </Button>

      {aberto && (
        <div className="order-last w-full space-y-4 rounded-xl border border-[var(--primary)]/40 bg-[var(--card)] p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm">
              A pessoa preenche nome, telefone, CPF, nascimento, endereço e contato de emergência. O cadastro chega em
              Pendências para você aprovar.
            </p>
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>

          {novo ? (
            <div className="space-y-2 rounded-lg bg-[var(--primary-soft)] p-3">
              <p className="text-sm font-semibold">
                Link de {TIPO[novo.tipo].longo.toLowerCase()}
                {novo.paraQuem ? ` para ${novo.paraQuem}` : ""} pronto
              </p>
              <code className="block truncate rounded bg-[var(--card)] px-2 py-1.5 text-xs">{endereco(novo.token)}</code>
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="h-10 gap-1.5" onClick={() => whatsApp(novo.token, novo.paraQuem || null)}>
                  <MessageCircle aria-hidden className="size-4" />
                  Mandar no WhatsApp
                </Button>
                <Button type="button" variant="outline" className="h-10 gap-1.5" onClick={() => copiar(novo.token)}>
                  <Copy aria-hidden className="size-4" />
                  {copiado === novo.token ? "Copiado" : "Copiar"}
                </Button>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">Serve uma vez e vence em 7 dias.</p>
              <button
                type="button"
                onClick={() => setNovo(null)}
                className="text-sm text-[var(--primary)] underline underline-offset-4"
              >
                Gerar outro
              </button>
            </div>
          ) : (
            <form onSubmit={gerar} className="space-y-3">
              <EscolhaDeContrato valor={tipo} onChange={setTipo} />
              <label className="block">
                <span className="mb-1 block text-sm font-medium">
                  Para quem <span className="font-normal text-[var(--muted-foreground)]">(opcional)</span>
                </span>
                <Input
                  value={paraQuem}
                  onChange={(e) => setParaQuem(e.target.value)}
                  maxLength={80}
                  placeholder="ex.: Maria, garçonete"
                />
              </label>
              <Button type="submit" className="h-11 w-full gap-1.5" disabled={pendente}>
                <Link2 aria-hidden className="size-4" />
                {pendente ? "Gerando…" : "Gerar link"}
              </Button>
            </form>
          )}

          {erro && (
            <p role="alert" className="msg-error">
              {erro}
            </p>
          )}

          {outros.length > 0 && (
            <div>
              <p className="section-label mb-1.5">Links abertos · {outros.length}</p>
              <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
                {outros.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold">{l.paraQuem ?? "Sem nome"}</span>
                        <span
                          className="selo shrink-0"
                          style={TIPO[l.tipo].selo}
                        >
                          {TIPO[l.tipo].curto}
                        </span>
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">vence {l.vence}</p>
                    </div>
                    {apagando === l.id ? (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={pendente}
                          onClick={() =>
                            startTransition(async () => {
                              await cancelarConviteColaborador(l.id);
                              setApagando(null);
                            })
                          }
                        >
                          Cancelar link
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setApagando(null)}>
                          voltar
                        </Button>
                      </div>
                    ) : (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => whatsApp(l.token, l.paraQuem)}
                          aria-label={`Mandar o link${l.paraQuem ? ` de ${l.paraQuem}` : ""} no WhatsApp`}
                          title="WhatsApp"
                          className="flex size-9 items-center justify-center rounded-full bg-[var(--ok-soft)] text-[var(--ok-strong)] hover:opacity-80"
                        >
                          <MessageCircle aria-hidden className="size-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={() => copiar(l.token)}
                          aria-label="Copiar o link"
                          title={copiado === l.token ? "Copiado" : "Copiar"}
                          className="flex size-9 items-center justify-center rounded-full border border-[var(--border)] hover:bg-[var(--muted)]"
                        >
                          {copiado === l.token ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setApagando(l.id)}
                          aria-label="Cancelar o link"
                          title="Cancelar"
                          className="flex size-9 items-center justify-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--danger-soft)] hover:text-[var(--destructive)]"
                        >
                          <Trash2 aria-hidden className="size-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}
