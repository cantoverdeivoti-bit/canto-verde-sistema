import { createHash } from "node:crypto";

import { prisma } from "@/lib/db";
import type { CurrentUser } from "@/lib/roles";

/**
 * O acesso do Claude (MCP): um token por pessoa, criado em Configurações
 * gerais → Acesso do Claude. Vale como a pessoa que o criou, com as mesmas
 * permissões, e só para ler.
 *
 * Guardamos o sha256, nunca o token: quem lê o banco não ganha acesso. A
 * conta desligada e o token revogado param no próximo pedido, porque tudo é
 * conferido no banco a cada chamada.
 */

export const hashDoToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Formato do token: 64 caracteres hexadecimais (`novoToken`). */
export const pareceToken = (t: string | undefined | null): t is string => typeof t === "string" && /^[0-9a-f]{64}$/.test(t);

/** Gravar o último uso no máximo a cada 5 minutos: o Claude faz várias chamadas seguidas. */
const INTERVALO_DO_USO_MS = 5 * 60 * 1000;

/** A pessoa dona do token, com as permissões de agora; nulo se não vale. */
export async function usuarioDoToken(token: string | undefined | null, agora = new Date()): Promise<CurrentUser | null> {
  if (!pareceToken(token)) return null;
  const t = await prisma.tokenDeAcesso.findUnique({
    where: { hash: hashDoToken(token) },
    select: {
      id: true,
      revogadoEm: true,
      usadoEm: true,
      user: {
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          isActive: true,
          superusuario: true,
          permissions: { select: { moduleSlug: true, canConfigure: true } },
        },
      },
    },
  });
  if (!t || t.revogadoEm || !t.user.isActive) return null;
  if (!t.usadoEm || agora.getTime() - t.usadoEm.getTime() > INTERVALO_DO_USO_MS) {
    await prisma.tokenDeAcesso.update({ where: { id: t.id }, data: { usadoEm: agora } }).catch(() => {});
  }
  return {
    id: t.user.id,
    username: t.user.username,
    name: t.user.name,
    role: t.user.role,
    grants: t.user.permissions,
    superusuario: t.user.superusuario,
  };
}

/** O token da chamada: no cabeçalho `Authorization: Bearer`, ou no fim do endereço. */
export function tokenDaChamada(req: Request, bearer?: string): string | null {
  if (pareceToken(bearer)) return bearer;
  const ultimo = new URL(req.url).pathname.split("/").filter(Boolean).at(-1);
  return pareceToken(ultimo) ? ultimo : null;
}
