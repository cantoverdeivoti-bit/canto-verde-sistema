"use server";

import { z } from "zod";

import { enviarAosAparelhos } from "@/lib/celular";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/permissions";

type Resultado = { ok: true } | { ok: false; message: string };

/** O que o navegador entrega ao aceitar notificações (`PushSubscription.toJSON()`). */
const inscricaoSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

const PRONTO = {
  titulo: "Avisos ligados neste celular",
  corpo: "Os avisos que você escolher em Minhas notificações aparecem aqui.",
  url: "/admin/sistema/notificacoes",
  etiqueta: "teste",
};

/** Quem está logado com conta: pelo link de atalhos não há pessoa para avisar. */
async function pessoaLogada() {
  const user = await getCurrentUser();
  if (!user || user.atalho) throw new Error("Não autorizado.");
  return user;
}

/**
 * Guarda este aparelho para receber os avisos que a pessoa escolheu (Minhas
 * notificações), e manda um de teste na hora, para ela ver que funcionou.
 *
 * Qualquer conta com login: cada um recebe só os avisos dos módulos em que
 * entra (`lib/notificar.ts`). Pelo link de atalhos não há pessoa para avisar.
 */
export async function ligarCelular(inscricao: unknown, aparelho: string): Promise<Resultado> {
  const user = await pessoaLogada();

  const parsed = inscricaoSchema.safeParse(inscricao);
  if (!parsed.success) return { ok: false, message: "O navegador mandou uma inscrição inválida." };
  const { endpoint, keys } = parsed.data;

  try {
    // Pelo endpoint: o mesmo aparelho ligado de novo, ou passado para outra
    // conta, atualiza a linha em vez de duplicar o aviso.
    await prisma.celularDeAviso.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: user.id, aparelho: aparelho.slice(0, 200) },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: user.id, aparelho: aparelho.slice(0, 200) },
    });
  } catch (err) {
    console.error("[ligarCelular] falha:", err);
    return { ok: false, message: "Não consegui guardar este celular. Tente de novo." };
  }

  const entregues = await enviarAosAparelhos([{ endpoint, ...keys }], PRONTO);
  if (entregues === 0) {
    return { ok: false, message: "Guardei o celular, mas o aviso de teste não saiu. Tente desligar e ligar de novo." };
  }
  return { ok: true };
}

/** Para de avisar neste aparelho. Só apaga se ele for de quem pede. */
export async function desligarCelular(endpoint: string): Promise<Resultado> {
  const user = await pessoaLogada();
  await prisma.celularDeAviso.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true };
}

/** Manda um aviso de teste para este aparelho, já ligado. */
export async function testarCelular(endpoint: string): Promise<Resultado> {
  const user = await pessoaLogada();
  const aparelho = await prisma.celularDeAviso.findFirst({
    where: { endpoint, userId: user.id },
    select: { endpoint: true, p256dh: true, auth: true },
  });
  if (!aparelho) return { ok: false, message: "Este celular não está ligado. Ligue de novo." };
  const entregues = await enviarAosAparelhos([aparelho], { ...PRONTO, titulo: "Teste dos avisos" });
  return entregues > 0 ? { ok: true } : { ok: false, message: "O aviso de teste não saiu." };
}
