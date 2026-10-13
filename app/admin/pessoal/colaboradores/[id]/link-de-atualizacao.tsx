"use client";

import { Copy, MessageCircle, Send } from "lucide-react";
import { useState, useTransition } from "react";

import { BotaoQuadrado } from "@/components/botao-quadrado";
import { Button } from "@/components/ui/button";
import { gerarLinkDeAtualizacao } from "@/lib/actions/pessoal";

/**
 * O link para a própria pessoa atualizar o cadastro (telefone, CPF, endereço,
 * contato de emergência), num quadrado das ações da ficha. O toque gera o link
 * (ou devolve o que ainda está aberto) e abre embaixo o WhatsApp e o copiar. O
 * que ela manda espera a aprovação em Pendências.
 *
 * Quem abre e fecha é a fileira (`AcoesDoColaborador`), para ficar um painel
 * aberto por vez. O link gerado fica guardado aqui: fechar e abrir de novo
 * não pede outro ao servidor.
 */
export function LinkDeAtualizacao({
  colaboradorId,
  nome,
  whatsApp,
  aberto,
  setAberto,
}: {
  colaboradorId: number;
  nome: string;
  whatsApp: string | null;
  aberto: boolean;
  setAberto: (aberto: boolean) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  // O endereço do site na hora do clique: vale em produção e no localhost.
  const endereco = (t: string) => `${window.location.origin}/equipe/${t}`;

  function abrir() {
    if (aberto) return setAberto(false);
    setErro(null);
    setAberto(true);
    if (token) return;
    startTransition(async () => {
      const r = await gerarLinkDeAtualizacao(colaboradorId);
      if (!r.ok) return setErro(r.message);
      setToken(r.data.token);
    });
  }

  function mandar(t: string) {
    const texto = `Oi, ${nome.split(/\s+/)[0]}! Confira e atualize o seu cadastro no Canto Verde por aqui: ${endereco(t)}`;
    // Com o telefone dela, a conversa já abre; sem, o WhatsApp pede o contato.
    const base = whatsApp ?? "https://wa.me/";
    window.open(`${base}?text=${encodeURIComponent(texto)}`, "_blank", "noopener");
  }

  async function copiar(t: string) {
    try {
      await navigator.clipboard.writeText(endereco(t));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErro("Não consegui copiar. Use o botão do WhatsApp.");
    }
  }

  return (
    <>
      <BotaoQuadrado icone={Send} texto="Atualizar cadastro" ativo={aberto} onClick={abrir} dica="Link para a pessoa atualizar o cadastro" />

      {/* O painel ocupa a linha inteira, embaixo dos quadrados, dentro do
          cartão. `order-last` o põe depois de todos eles: sem isso, o quadrado
          que vem depois deste desceria para baixo do painel. */}
      {aberto && (
        <div className="order-last col-span-full basis-full space-y-2 border-t border-[var(--border)] p-3">
          <p className="text-sm">
            <span className="font-semibold">Atualizar cadastro pelo celular.</span>{" "}
            <span className="text-[var(--muted-foreground)]">
              A pessoa confere e corrige os dados; chega em Pendências para você aprovar. Vale 7 dias e serve uma vez.
            </span>
          </p>
          {token ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 basis-full truncate rounded bg-[var(--muted)] px-3 py-2 text-xs sm:flex-1 sm:basis-0">{endereco(token)}</code>
              <Button type="button" className="h-10 gap-1.5" onClick={() => mandar(token)}>
                <MessageCircle aria-hidden className="size-4" />
                Mandar no WhatsApp
              </Button>
              <Button type="button" variant="outline" className="h-10 gap-1.5" onClick={() => copiar(token)}>
                <Copy aria-hidden className="size-4" />
                {copiado ? "Copiado" : "Copiar"}
              </Button>
            </div>
          ) : (
            !erro && <p className="text-sm text-[var(--muted-foreground)]">{pendente ? "Gerando o link…" : ""}</p>
          )}
          {erro && (
            <p role="alert" className="msg-error">
              {erro}
            </p>
          )}
        </div>
      )}
    </>
  );
}
