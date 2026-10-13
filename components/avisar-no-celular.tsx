"use client";

import { BellOff, BellRing } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { desligarCelular, ligarCelular, testarCelular } from "@/lib/actions/celular";

const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type Estado =
  | "carregando"
  | "sem-chave"
  | "sem-suporte"
  | "iphone-instalar"
  | "bloqueado"
  | "desligado"
  | "ligado";

/** A chave pública vem em base64 de URL; o navegador quer os bytes. */
function bytesDaChave(base64: string): Uint8Array<ArrayBuffer> {
  const preenchido = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(preenchido);
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length));
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
  return bytes;
}

/** "Chrome no Android", para a pessoa reconhecer o aparelho depois. */
function nomeDoAparelho(): string {
  const ua = navigator.userAgent;
  const sistema = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : "outro";
  const navegador = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "navegador";
  return `${navegador} no ${sistema}`;
}

/**
 * Liga e desliga o pop-up dos avisos neste aparelho.
 *
 * Cada celular liga o seu: a permissão é do navegador daquele aparelho, e o
 * Android pergunta "Permitir notificações?" uma vez. No iPhone só funciona
 * com o painel adicionado à tela de início (regra da Apple), e a tela diz isso.
 */
export function AvisarNoCelular({
  soSeDesligado = false,
}: {
  /**
   * Em Avisos: ligado, não aparece (o cartão completo mora em Minhas
   * notificações); desligado, vira uma faixa fina com o convite. Ocupava meia
   * tela do celular antes do primeiro aviso.
   */
  soSeDesligado?: boolean;
} = {}) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [inscricao, setInscricao] = useState<PushSubscription | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [ocupado, startTransition] = useTransition();

  useEffect(() => {
    let vivo = true;
    (async () => {
      const iphone = /iPhone|iPad/.test(navigator.userAgent);
      const instalado = window.matchMedia("(display-mode: standalone)").matches;
      const suporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

      let proximo: Estado;
      let atual: PushSubscription | null = null;
      if (CHAVE_PUBLICA === "") proximo = "sem-chave";
      else if (!suporta) proximo = iphone && !instalado ? "iphone-instalar" : "sem-suporte";
      else {
        const registro = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        atual = await registro.pushManager.getSubscription();
        proximo = atual ? "ligado" : Notification.permission === "denied" ? "bloqueado" : "desligado";
      }
      if (!vivo) return;
      setInscricao(atual);
      setEstado(proximo);
    })().catch(() => vivo && setEstado("sem-suporte"));
    return () => {
      vivo = false;
    };
  }, []);

  function ligar() {
    setRecado(null);
    startTransition(async () => {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "bloqueado" : "desligado");
        return;
      }
      try {
        const registro = await navigator.serviceWorker.ready;
        // Com prazo: sem rede até o serviço de notificações do aparelho, o
        // navegador fica esperando para sempre e o botão nunca volta.
        const nova = await Promise.race([
          registro.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: bytesDaChave(CHAVE_PUBLICA),
          }),
          new Promise<never>((_, falha) => setTimeout(() => falha(new Error("prazo")), 20_000)),
        ]);
        const r = await ligarCelular(nova.toJSON(), nomeDoAparelho());
        setInscricao(nova);
        setEstado("ligado");
        if (!r.ok) setRecado(r.message);
      } catch {
        setRecado("O navegador não conseguiu ligar as notificações. Confira a internet e tente de novo.");
      }
    });
  }

  function desligar() {
    setRecado(null);
    startTransition(async () => {
      if (inscricao) {
        await desligarCelular(inscricao.endpoint);
        await inscricao.unsubscribe().catch(() => {});
      }
      setInscricao(null);
      setEstado("desligado");
    });
  }

  function testar() {
    if (!inscricao) return;
    setRecado(null);
    startTransition(async () => {
      const r = await testarCelular(inscricao.endpoint);
      setRecado(r.ok ? "Enviado. Deve aparecer em alguns segundos." : r.message);
    });
  }

  if (estado === "carregando") return null;
  if (soSeDesligado && (estado === "ligado" || estado === "sem-chave" || estado === "sem-suporte")) return null;
  if (soSeDesligado && estado === "desligado") {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-2 rounded-lg bg-[var(--surface)] px-3 py-1.5 text-sm" aria-live="polite">
        <BellRing aria-hidden className="size-4 shrink-0 text-[var(--primary)]" />
        <span className="min-w-0 flex-1 text-[var(--muted-foreground)]">Receber estes avisos no celular?</span>
        <button
          type="button"
          onClick={ligar}
          disabled={ocupado}
          className="h-9 shrink-0 rounded-lg px-2 font-semibold text-[var(--primary)] hover:bg-[var(--muted)] disabled:opacity-60"
        >
          Ligar
        </button>
        {recado && (
          <p className="w-full pb-1 text-xs" style={{ color: "var(--warn)" }}>
            {recado}
          </p>
        )}
      </div>
    );
  }

  const botao =
    "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-semibold hover:border-[var(--primary)] disabled:opacity-60";

  return (
    <section className="mt-4 rounded-xl border border-[var(--border)] px-4 py-3" aria-live="polite">
      {estado === "ligado" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="flex flex-1 items-center gap-2 text-sm">
            <BellRing aria-hidden className="size-4 shrink-0 text-[var(--primary)]" />
            Este aparelho recebe os avisos como notificação.
          </p>
          <button type="button" onClick={testar} disabled={ocupado} className={botao}>
            Testar
          </button>
          <button type="button" onClick={desligar} disabled={ocupado} className={botao}>
            <BellOff aria-hidden className="size-4" />
            Parar
          </button>
        </div>
      ) : estado === "desligado" ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="flex-1 text-sm text-[var(--muted-foreground)]">
            Receba cada aviso como notificação neste aparelho, mesmo com o painel fechado.
          </p>
          <button
            type="button"
            onClick={ligar}
            disabled={ocupado}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--botao)] px-4 py-2.5 text-sm font-semibold text-[var(--botao-texto)] hover:opacity-90 disabled:opacity-60"
          >
            <BellRing aria-hidden className="size-4" />
            Avisar neste celular
          </button>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">
          {estado === "bloqueado" &&
            "As notificações deste site estão bloqueadas no navegador. Libere em Configurações do site → Notificações e volte aqui."}
          {estado === "iphone-instalar" &&
            "No iPhone, os avisos só chegam com o painel na tela de início: toque em Compartilhar → Adicionar à Tela de Início, abra por lá e volte aqui."}
          {estado === "sem-suporte" && "Este navegador não recebe notificações. No Android, use o Chrome."}
          {estado === "sem-chave" && "As notificações no celular ainda não foram configuradas no servidor."}
        </p>
      )}
      {recado && <p className="mt-2 text-sm" style={{ color: "var(--warn)" }}>{recado}</p>}
    </section>
  );
}
