"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { ATALHOS_DA_BARRA, MAXIMO_NA_BARRA } from "@/lib/barra-de-baixo";
import { ATALHOS_DA_INICIAL, NUMEROS } from "@/lib/pagina-inicial";
import { getCurrentUser, limparUsuarios } from "@/lib/permissions";
import { Prisma } from "@/generated/prisma/client";

const chavesDe = (catalogo: readonly { chave: string }[]) => catalogo.map((i) => i.chave) as [string, ...string[]];

const preferenciaSchema = z.object({
  numeros: z.array(z.enum(chavesDe(NUMEROS))).max(NUMEROS.length),
  atalhos: z.array(z.enum(chavesDe(ATALHOS_DA_INICIAL))).max(ATALHOS_DA_INICIAL.length),
  // A barra de baixo do celular mora no mesmo campo e salva junto.
  barra: z.array(z.enum(chavesDe(ATALHOS_DA_BARRA))).max(MAXIMO_NA_BARRA),
});

type Escolha = { numeros: string[]; atalhos: string[]; barra: string[] };

/**
 * Grava a página inicial e a barra de baixo de quem está logado. Nulo volta
 * as duas ao padrão. Cada um só mexe na sua: o id vem da sessão, nunca do
 * formulário.
 */
export async function salvarPaginaInicial(dados: Escolha | null) {
  const user = await getCurrentUser();
  // Quem entrou pelo link de atalhos não tem conta para guardar a escolha.
  if (!user || user.atalho) return { ok: false, message: "Entre com a sua conta para editar a página inicial." };
  let valor: Escolha | null = null;
  if (dados !== null) {
    const parsed = preferenciaSchema.safeParse({ ...dados, barra: [...new Set(dados.barra)] });
    if (!parsed.success) {
      const naBarra = parsed.error.issues.some((i) => i.path[0] === "barra");
      return { ok: false, message: naBarra ? `Na barra de baixo cabem ${MAXIMO_NA_BARRA} atalhos.` : "Escolha inválida. Recarregue a página." };
    }
    valor = { numeros: [...new Set(parsed.data.numeros)], atalhos: [...new Set(parsed.data.atalhos)], barra: parsed.data.barra };
  }
  await prisma.adminUser.update({
    where: { id: user.id },
    data: { paginaInicial: valor === null ? Prisma.DbNull : valor },
  });
  // A barra aparece em toda tela: o layout inteiro do painel lê de novo.
  revalidatePath("/admin", "layout");
  limparUsuarios();
  return { ok: true };
}
