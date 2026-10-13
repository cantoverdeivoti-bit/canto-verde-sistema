"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireModule } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { limparUsuarios } from "@/lib/permissions";
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  userGrantsSchema,
} from "@/lib/validations";

export type UsuariosResult = { ok: boolean; message?: string };

/** Mesmo custo do resto do projeto: seed e script de terminal usam 12. */
const CUSTO_BCRYPT = 12;

function primeiroErro(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}

/**
 * P2002 por forma, não por `instanceof`: o driver adapter do Prisma 7 não
 * devolve a classe de erro real, só um objeto com `.code`.
 */
function eDuplicado(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

function revalidarSistema() {
  revalidatePath("/admin/sistema", "layout");
  // A conta guardada de quem mudou (ver `getCurrentUser`) sai na hora.
  limparUsuarios();
}

/**
 * Cria a conta com as permissões que vieram da tela, numa transação só.
 *
 * As permissões são as escolhidas à mão, não as do papel. O papel diz quem a
 * pessoa é na casa; quem decide o que ela alcança é quem está criando a
 * conta, e o preset é só um botão de preencher rápido no formulário.
 *
 * Se a gravação das permissões falhasse sozinha, sobraria uma conta que
 * entra e não vê nada — sem erro nenhum, porque a conta existe e a senha
 * funciona. Ou nasce inteira, ou não nasce.
 */
export async function createUser(raw: unknown): Promise<UsuariosResult> {
  await requireModule("sistema", { configure: true });

  const parsed = createUserSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const { username, name, role, password, grants } = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(password, CUSTO_BCRYPT);
    await prisma.$transaction(async (tx) => {
      const user = await tx.adminUser.create({
        data: { username, name: name ?? null, role, passwordHash },
        select: { id: true },
      });
      if (grants.length > 0) {
        await tx.userModulePermission.createMany({
          data: grants.map((g) => ({
            userId: user.id,
            moduleSlug: g.moduleSlug,
            canConfigure: g.canConfigure,
          })),
        });
      }
    });
  } catch (error) {
    if (eDuplicado(error)) {
      return { ok: false, message: "Já existe alguém com esse usuário." };
    }
    console.error("[createUser] falha:", error);
    return { ok: false, message: "Não foi possível criar. Tente novamente." };
  }

  revalidarSistema();
  return { ok: true };
}

/**
 * O nome, o login e o papel.
 *
 * O login muda quando o dono pede ("joel" virou "joel.silva"). A sessão é
 * presa ao id, então quem está dentro continua dentro; a pessoa só passa a
 * entrar com o login novo. As permissões têm ação própria. Superusuário muda
 * nome e login, mas não o papel.
 */
export async function updateUser(id: number, raw: unknown): Promise<UsuariosResult> {
  await requireModule("sistema", { configure: true });

  const parsed = updateUserSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };
  const { name, username } = parsed.data;

  const atual = await prisma.adminUser.findUnique({
    where: { id },
    select: { role: true, superusuario: true },
  });
  if (!atual) return { ok: false, message: "Usuário não encontrado." };
  // Sem papel na chamada, fica o que era (é o caso do superusuário).
  const role = parsed.data.role ?? atual.role;

  // Superusuário não muda de papel pela tela: é a conta que não pode ser
  // trancada por um clique errado.
  if (atual.superusuario && role !== atual.role) {
    return { ok: false, message: "Superusuário não muda de papel pela tela." };
  }

  // Trava 1: o último Dono ativo não se rebaixa sozinho. Sem isto, um clique
  // errado deixa o painel de permissões sem ninguém que possa abri-lo, e a
  // única saída seria o script de terminal.
  if (atual.role === "DONO" && role !== "DONO") {
    const donos = await prisma.adminUser.count({
      where: { role: "DONO", isActive: true },
    });
    if (donos <= 1) {
      return {
        ok: false,
        message: "Este é o único Dono ativo. Promova outra pessoa antes de mudar este papel.",
      };
    }
  }

  // Só nome e papel. As permissões têm ação própria (`saveUserGrants`) e
  // nunca mudam por tabela: trocar o papel aqui não pode reescrever o que
  // alguém escolheu na tela, porque quem escolhe é a pessoa, não o rótulo.
  try {
    await prisma.adminUser.update({
      where: { id },
      data: {
        role,
        ...(name !== undefined ? { name } : {}),
        // O login muda quando o dono pede: a sessão é presa ao id, não ao
        // login, então ninguém é derrubado — só passa a entrar com o novo.
        ...(username !== undefined ? { username } : {}),
      },
    });
  } catch (error) {
    if (eDuplicado(error)) {
      return { ok: false, message: "Já existe alguém com esse usuário." };
    }
    console.error("[updateUser] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente novamente." };
  }

  revalidarSistema();
  return { ok: true };
}

/**
 * Desativa em vez de apagar, como fornecedor e produto: o histórico aponta
 * para quem fez cada coisa, e apagar a pessoa deixaria a ação órfã.
 */
export async function setUserActive(
  id: number,
  isActive: boolean,
): Promise<UsuariosResult> {
  const autor = await requireModule("sistema", { configure: true });

  // Trava 2: ninguém desativa a própria conta. O efeito seria imediato —
  // `getCurrentUser` recusa quem está inativo no clique seguinte.
  if (autor.id === id && !isActive) {
    return { ok: false, message: "Você não pode desativar a própria conta." };
  }

  if (!isActive) {
    const alvo = await prisma.adminUser.findUnique({
      where: { id },
      select: { role: true, superusuario: true },
    });
    if (alvo?.superusuario) {
      return { ok: false, message: "Superusuário não pode ser desativado pela tela." };
    }
    if (alvo?.role === "DONO") {
      const donos = await prisma.adminUser.count({
        where: { role: "DONO", isActive: true },
      });
      if (donos <= 1) {
        return { ok: false, message: "Este é o único Dono ativo. A casa ficaria sem dono." };
      }
    }
  }

  try {
    await prisma.adminUser.update({ where: { id }, data: { isActive } });
  } catch (error) {
    console.error("[setUserActive] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente novamente." };
  }

  revalidarSistema();
  return { ok: true };
}

/** Redefine a senha de outra pessoa. A própria continua pelo terminal. */
export async function resetUserPassword(
  id: number,
  raw: unknown,
): Promise<UsuariosResult> {
  await requireModule("sistema", { configure: true });

  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };

  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, CUSTO_BCRYPT);
    await prisma.adminUser.update({ where: { id }, data: { passwordHash } });
  } catch (error) {
    console.error("[resetUserPassword] falha:", error);
    return { ok: false, message: "Não foi possível trocar a senha. Tente de novo." };
  }

  // Sem revalidar: nada na tela depende do hash, e limpar o cache à toa é
  // trabalho que ninguém vê.
  return { ok: true };
}

/**
 * Substitui o conjunto inteiro de permissões, como `setProductSuppliers`.
 *
 * Apagar e recriar em vez de conciliar linha a linha: o cliente manda o
 * estado final que a pessoa vê na tela, e conciliar seria inventar uma
 * diferença que a tela não mostrou.
 */
export async function saveUserGrants(
  userId: number,
  raw: unknown,
): Promise<UsuariosResult> {
  const autor = await requireModule("sistema", { configure: true });

  const parsed = userGrantsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: primeiroErro(parsed.error) };

  // Superusuário alcança tudo por definição: as permissões por módulo não
  // valem para ele, e mexer nelas só confundiria quem lê a tela.
  const alvo = await prisma.adminUser.findUnique({ where: { id: userId }, select: { superusuario: true } });
  if (alvo?.superusuario) {
    return { ok: false, message: "Superusuário já alcança todos os módulos." };
  }

  // Trava 3: ninguém remove o próprio acesso a Configurações gerais. Seria
  // o único erro desta tela sem desfazer — o controle para consertar está
  // atrás da permissão que a pessoa acabou de tirar de si mesma.
  if (autor.id === userId) {
    const mantem = parsed.data.grants.some(
      (g) => g.moduleSlug === "sistema" && g.canConfigure,
    );
    if (!mantem) {
      return {
        ok: false,
        message: "Você não pode tirar o próprio acesso a Configurações gerais — ficaria sem como voltar.",
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.userModulePermission.deleteMany({ where: { userId } });
      if (parsed.data.grants.length > 0) {
        await tx.userModulePermission.createMany({
          data: parsed.data.grants.map((g) => ({
            userId,
            moduleSlug: g.moduleSlug,
            canConfigure: g.canConfigure,
          })),
        });
      }
    });
  } catch (error) {
    console.error("[saveUserGrants] falha:", error);
    return { ok: false, message: "Não foi possível salvar as permissões." };
  }

  revalidarSistema();
  return { ok: true };
}

