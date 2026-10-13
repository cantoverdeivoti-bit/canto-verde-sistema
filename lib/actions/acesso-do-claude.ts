"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { hashDoToken } from "@/lib/mcp/acesso";
import { getCurrentUser } from "@/lib/permissions";
import { novoToken } from "@/lib/token";

/** Cada um cria e revoga só os seus: o id vem da sessão. */
async function pessoaLogada() {
  const user = await getCurrentUser();
  return user && !user.atalho ? user : null;
}

const feito = () => revalidatePath("/admin/sistema/acesso-do-claude");

/** No máximo isso de tokens ativos por pessoa: um por aparelho ou assistente basta. */
const LIMITE = 10;

/**
 * Cria um token para o Claude, em nome de quem está logado. O token volta
 * uma vez só: no banco fica o sha256 dele.
 */
export async function criarTokenDeAcesso(
  nome: string,
): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  const user = await pessoaLogada();
  if (!user) return { ok: false, message: "Entre com a sua conta." };
  const limpo = nome.trim().slice(0, 60);
  if (limpo.length < 2) return { ok: false, message: "Dê um nome, ex.: Claude do celular." };
  const ativos = await prisma.tokenDeAcesso.count({ where: { userId: user.id, revogadoEm: null } });
  if (ativos >= LIMITE) return { ok: false, message: `Você já tem ${LIMITE} acessos ativos. Revogue um antes.` };
  const token = novoToken();
  await prisma.tokenDeAcesso.create({ data: { userId: user.id, nome: limpo, hash: hashDoToken(token) } });
  feito();
  return { ok: true, token };
}

/** Revoga um token da própria pessoa. O Claude para de entrar no próximo pedido. */
export async function revogarTokenDeAcesso(id: number): Promise<{ ok: boolean; message?: string }> {
  const user = await pessoaLogada();
  if (!user) return { ok: false, message: "Entre com a sua conta." };
  await prisma.tokenDeAcesso.updateMany({
    where: { id, userId: user.id, revogadoEm: null },
    data: { revogadoEm: new Date() },
  });
  feito();
  return { ok: true };
}
