import webpush, { WebPushError } from "web-push";

import { prisma } from "@/lib/db";

/**
 * Notificação no celular: o pop-up que aparece mesmo com o painel fechado.
 *
 * Usa o Web Push do próprio navegador, sem serviço pago no meio. O servidor
 * assina cada mensagem com o par de chaves VAPID (as variáveis abaixo); sem
 * elas, nada é enviado e o botão de ligar explica que falta configurar.
 *
 * O envio nunca derruba quem o chamou: notificação que falhou é um aviso a
 * menos no bolso, e o aviso continua na aba Avisos.
 */

const CHAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const CHAVE_PRIVADA = process.env.VAPID_PRIVATE_KEY ?? "";

/** Quem assina: o serviço de notificação pede um contato do remetente. */
const REMETENTE = process.env.VAPID_SUBJECT ?? "https://canto-verde.vercel.app";

export function notificacoesConfiguradas(): boolean {
  return CHAVE_PUBLICA !== "" && CHAVE_PRIVADA !== "";
}

let configurado = false;
function configurar(): boolean {
  if (!notificacoesConfiguradas()) return false;
  if (!configurado) {
    webpush.setVapidDetails(REMETENTE, CHAVE_PUBLICA, CHAVE_PRIVADA);
    configurado = true;
  }
  return true;
}

export type Notificacao = {
  titulo: string;
  corpo: string;
  /** A tela que abre ao tocar na notificação. */
  url: string;
  /** Mesma etiqueta substitui a anterior em vez de empilhar. */
  etiqueta?: string;
};

type Aparelho = { endpoint: string; p256dh: string; auth: string };

/**
 * Manda a mesma notificação a vários aparelhos. O aparelho que o serviço diz
 * não existir mais (desinstalou, limpou os dados, recusou depois) sai da
 * lista, para não ser tentado de novo a cada aviso.
 */
export async function enviarAosAparelhos(aparelhos: Aparelho[], n: Notificacao): Promise<number> {
  if (aparelhos.length === 0 || !configurar()) return 0;

  const corpo = JSON.stringify(n);
  const resultados = await Promise.allSettled(
    aparelhos.map((a) =>
      webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, corpo, {
        // Um dia: aviso de ontem que chega hoje ainda serve; de semana passada, não.
        TTL: 60 * 60 * 24,
        urgency: "high",
      }),
    ),
  );

  const mortos: string[] = [];
  let entregues = 0;
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") entregues++;
    else if (r.reason instanceof WebPushError && (r.reason.statusCode === 404 || r.reason.statusCode === 410)) {
      mortos.push(aparelhos[i].endpoint);
    } else {
      console.error("[celular] falha ao enviar:", r.reason);
    }
  });
  if (mortos.length > 0) {
    await prisma.celularDeAviso.deleteMany({ where: { endpoint: { in: mortos } } }).catch(() => {});
  }
  return entregues;
}
