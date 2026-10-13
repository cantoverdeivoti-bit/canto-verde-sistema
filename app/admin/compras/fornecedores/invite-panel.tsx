"use client";

import { Link2 } from "lucide-react";
import { useState, useTransition } from "react";

import { BotaoQuadrado } from "@/components/botao-quadrado";
import { Button } from "@/components/ui/button";
import { cancelarConvite, criarConvite } from "@/lib/actions/fornecedor-convite";
import { formatDateString, plural } from "@/lib/format";

export type ConviteRow = {
  id: number;
  token: string;
  label: string | null;
  expiresAt: string;
};

/**
 * Cadastro por link: o fornecedor preenche o próprio cadastro.
 *
 * Não pede nome de destinatário. O botão entrega um link pronto — e reaproveita
 * o que já está esperando resposta em vez de criar outro a cada clique, senão
 * uma tarde de cliques vira uma pilha de convites soltos.
 *
 * O link continua servindo uma vez só. Assim que alguém preenche, ele sai da
 * lista de pendentes e o próximo clique gera um novo — que é o que mantém a
 * porta fechada depois que o convidado entrou.
 */
export function InvitePanel({ convites }: { convites: ConviteRow[] }) {
  const [aberto, setAberto] = useState(false);
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  // origin em vez de endereço fixo: funciona em produção e no localhost sem
  // depender de variável de ambiente que alguém esquece de configurar. Guardado
  // no clique, não na renderização — `window` não existe no servidor.
  const [origin, setOrigin] = useState("");

  // Vem ordenado do mais novo para o mais velho: o primeiro é o link corrente.
  const [padrao, ...outros] = convites;

  function abrir() {
    setErro(null);
    setCopiado(false);
    setOrigin(window.location.origin);
    setAberto(true);
    if (padrao) return;
    startTransition(async () => {
      const r = await criarConvite("");
      if (!r.ok) setErro(r.message);
    });
  }

  const link = padrao && origin ? `${origin}/fornecedor/${padrao.token}` : "";

  function abrirWhatsApp() {
    const texto = `Olá! Para começarmos a comprar de vocês, preencha o cadastro por aqui: ${link}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(texto)}`,
      "_blank",
      "noopener",
    );
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não consegui copiar. Selecione o endereço acima e copie à mão.");
    }
  }

  return (
    <>
      <BotaoQuadrado
        icone={Link2}
        texto="Cadastro por link"
        ativo={aberto}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        dica="O fornecedor preenche o próprio cadastro"
      />

      {/* Filho da fileira de quadrados: `col-span-full basis-full` faz o
          painel ocupar a linha inteira, embaixo deles, dentro do cartão. */}
      {aberto && (
        <div className="col-span-full basis-full space-y-3 border-t border-[var(--border)] p-3">
          <p className="text-sm font-medium">
            Mande este link para o fornecedor preencher o cadastro
          </p>

          {link ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <code className="min-w-0 basis-full truncate rounded sm:flex-1 sm:basis-0 bg-[var(--surface)] px-3 py-2 text-sm">
                  {link}
                </code>
                <Button type="button" size="sm" onClick={copiar}>
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={abrirWhatsApp}
                >
                  Enviar no WhatsApp
                </Button>
              </div>

              <p className="hint">
                Serve <strong>uma vez</strong> e vale até{" "}
                {formatDateString(padrao.expiresAt)}. Quem preencher entra
                direto na lista. Mande só para quem você já decidiu que é
                fornecedor. Depois de usado, este botão gera um novo.
              </p>

              {/* Cancela e já repõe, porque quem clica aqui não quer ficar sem
                  link — quer outro, por ter mandado este para a pessoa errada
                  ou por ele ter circulado além de quem devia. */}
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    setCopiado(false);
                    await cancelarConvite(padrao.id);
                    const r = await criarConvite("");
                    if (!r.ok) setErro(r.message);
                  })
                }
                disabled={pendente}
                className="text-xs text-[var(--muted-foreground)] transition hover:text-[var(--destructive)] disabled:opacity-40"
              >
                cancelar este link e gerar outro
              </button>
            </>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              {pendente ? "Gerando o link…" : "Nenhum link disponível."}
            </p>
          )}

          {erro && (
            <p
              role="alert"
              className="text-xs font-medium"
              style={{ color: "var(--destructive)" }}
            >
              {erro}
            </p>
          )}

          {outros.length > 0 && (
            <div className="space-y-2 border-t border-[var(--border)] pt-3">
              <p className="text-sm text-[var(--muted-foreground)]">
                {plural(outros.length, "link")} de antes, ainda esperando
                resposta
              </p>
              <ul className="space-y-1">
                {outros.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
                  >
                    <span className="min-w-40">
                      {c.label ?? "cadastro por link"}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      vence em {formatDateString(c.expiresAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        startTransition(async () => {
                          await cancelarConvite(c.id);
                        })
                      }
                      disabled={pendente}
                      className="ml-auto text-xs text-[var(--muted-foreground)] transition hover:text-[var(--destructive)] disabled:opacity-40"
                    >
                      cancelar
                    </button>
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
