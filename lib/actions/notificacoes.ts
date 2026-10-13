"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { emailConfigurado } from "@/lib/email";
import { comEscolha, emailValido, ehEvento, eventosPermitidos, lerPreferencias, type Canal } from "@/lib/notificacoes";
import { enviarEmailDeAviso } from "@/lib/notificar";
import { getCurrentUser } from "@/lib/permissions";
import { can } from "@/lib/roles";
import { Prisma } from "@/generated/prisma/client";

type Resultado = { ok: true } | { ok: false; message: string };

/** Cada um mexe só na sua: o id vem da sessão, nunca do formulário. */
async function pessoaLogada() {
  const user = await getCurrentUser();
  if (!user || user.atalho) return null;
  return user;
}

const feito = () => revalidatePath("/admin/sistema/notificacoes");

/** O e-mail da pessoa, para os avisos. Vazio apaga (e os avisos por e-mail param). */
export async function salvarEmail(texto: string): Promise<Resultado> {
  const user = await pessoaLogada();
  if (!user) return { ok: false, message: "Entre com a sua conta." };
  const email = texto.trim().toLowerCase();
  if (email !== "" && !emailValido(email)) return { ok: false, message: "E-mail inválido." };
  await prisma.adminUser.update({ where: { id: user.id }, data: { email: email === "" ? null : email } });
  feito();
  return { ok: true };
}

/** Liga ou desliga um canal de um evento, só dos módulos em que a pessoa entra. */
export async function salvarPreferencia(evento: string, canal: Canal, ligado: boolean): Promise<Resultado> {
  const user = await pessoaLogada();
  if (!user) return { ok: false, message: "Entre com a sua conta." };
  if (!ehEvento(evento) || (canal !== "celular" && canal !== "email") || typeof ligado !== "boolean") {
    return { ok: false, message: "Escolha inválida. Recarregue a página." };
  }
  if (!eventosPermitidos((m, configurar) => can(user, m, configurar ? { configure: true } : undefined)).some((e) => e.chave === evento)) {
    return { ok: false, message: "Você não tem acesso a este aviso." };
  }
  // Ler e gravar na mesma transação, com a linha travada: dois toques
  // seguidos em interruptores diferentes não apagam um ao outro.
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "admin_users" WHERE id = ${user.id} FOR UPDATE`;
    const atual = await tx.adminUser.findUnique({ where: { id: user.id }, select: { notificacoes: true } });
    const novas = comEscolha(lerPreferencias(atual?.notificacoes), evento, canal, ligado);
    await tx.adminUser.update({ where: { id: user.id }, data: { notificacoes: novas as Prisma.InputJsonValue } });
  });
  feito();
  return { ok: true };
}

/** Manda um e-mail de teste para o endereço cadastrado. */
export async function testarEmail(): Promise<Resultado> {
  const user = await pessoaLogada();
  if (!user) return { ok: false, message: "Entre com a sua conta." };
  if (!emailConfigurado()) return { ok: false, message: "O envio de e-mail ainda não foi configurado no servidor." };
  const p = await prisma.adminUser.findUnique({ where: { id: user.id }, select: { email: true } });
  if (!p?.email) return { ok: false, message: "Cadastre o seu e-mail primeiro." };
  const ok = await enviarEmailDeAviso(p.email, {
    titulo: "Teste dos avisos do Canto Verde",
    corpo: "Se você recebeu este e-mail, os avisos por e-mail estão funcionando.",
    url: "/admin/sistema/notificacoes",
  });
  return ok ? { ok: true } : { ok: false, message: "O e-mail não saiu. Confira a configuração do Resend." };
}
