import { timingSafeEqual } from "node:crypto";

import { unstable_cache, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { cache } from "react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { atalhoVencido, type CurrentUser } from "@/lib/roles";

/**
 * A permissão do lado do servidor: quem é a pessoa da requisição.
 *
 * A lógica pura de papéis mora em `lib/roles.ts` e é reexportada aqui, para
 * nenhum import existente quebrar. A separação existe porque este arquivo
 * importa `auth` e `prisma`, e a tela de permissões precisa dos presets
 * dentro de um componente cliente.
 */
export type { ModuleGrant, CurrentUser } from "@/lib/roles";
export {
  ROLE_PRESETS,
  ROLE_LABEL,
  ROLES,
  rolePresetMatches,
  can,
  visibleModules,
} from "@/lib/roles";

/**
 * O usuário da requisição, com as permissões lidas do banco.
 *
 * Do banco, não do cookie, de propósito: tirar o acesso de alguém precisa valer
 * no próximo clique, não no próximo login — a sessão dura 12 horas. O `cache()`
 * do React garante uma consulta por requisição, mesmo que o layout, a página e
 * uma ação perguntem separadamente.
 */
const lerUsuario = (id: number) =>
  prisma.adminUser.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      superusuario: true,
      paginaInicial: true,
      permissions: { select: { moduleSlug: true, canConfigure: true } },
    },
  });

export const TAG_USUARIOS = "usuarios";

/**
 * A conta guardada por até 30 segundos entre um toque e outro: era uma ida ao
 * banco antes de qualquer outra consulta, em toda tela. Quem muda conta
 * (Usuários, Página inicial) chama `limparUsuarios`, e desativar alguém ou
 * trocar a permissão continua valendo no clique seguinte. Mudança feita
 * direto no banco vale em até 30 segundos.
 */
const usuarioGuardado = unstable_cache(lerUsuario, ["usuario-da-sessao"], { tags: [TAG_USUARIOS], revalidate: 30 });

/** Limpa as contas guardadas: chamada por toda ação que muda conta ou permissão. */
export function limparUsuarios() {
  try {
    updateTag(TAG_USUARIOS);
  } catch {}
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = Number(session?.user?.id);
  if (!id || Number.isNaN(id)) return usuarioDoAtalho();

  // Fora do Next (scripts), o guardado não existe: direto do banco.
  const user = await usuarioGuardado(id).catch(() => lerUsuario(id));

  // Desativado depois de logar continua com cookie válido — a checagem aqui é
  // o que efetivamente o expulsa.
  if (!user || !user.isActive) return null;

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    grants: user.permissions,
    superusuario: user.superusuario,
    paginaInicial: user.paginaInicial,
  };
});

/** O nome do cookie que o link de atalhos grava. */
export const COOKIE_ATALHO = "atalho";

/**
 * Quem entrou pelo link de atalhos, sem login.
 *
 * O cookie guarda o código do link; vale enquanto for IGUAL ao gravado em
 * `CotacaoSettings.atalhoToken` — trocar ou desligar o link corta o acesso no
 * próximo clique, porque a conferência é no banco, a cada requisição.
 *
 * Age em nome de quem gerou o link (`atalhoCriadoPorId`): o que precisa de
 * autor fica com ele, e se essa pessoa for desativada o link morre junto. Só
 * com Compras, sem configurar, e marcado `atalho` — o que faz `can()`
 * recusar tudo o que não foi liberado de propósito.
 */
/** Compara os códigos sem que o tempo da resposta conte quantas letras bateram. */
function mesmoCodigo(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function usuarioDoAtalho(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(COOKIE_ATALHO)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;

  const config = await prisma.cotacaoSettings.findUnique({
    where: { id: 1 },
    select: { atalhoToken: true, atalhoCriadoPorId: true, atalhoCriadoEm: true },
  });
  if (!config?.atalhoToken || !config.atalhoCriadoPorId || !mesmoCodigo(config.atalhoToken, token)) return null;
  // Trinta dias depois de gerado, o link para sozinho: um link que vazou não
  // fica aberto para sempre.
  if (atalhoVencido(config.atalhoCriadoEm)) return null;

  const dono = await prisma.adminUser.findUnique({
    where: { id: config.atalhoCriadoPorId },
    select: { id: true, role: true, isActive: true },
  });
  if (!dono || !dono.isActive) return null;

  return {
    id: dono.id,
    username: "atalho",
    name: "Atalhos",
    role: dono.role,
    grants: [{ moduleSlug: "compras", canConfigure: false }],
    atalho: true,
  };
}
