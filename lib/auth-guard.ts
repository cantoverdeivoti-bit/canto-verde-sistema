import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { can, getCurrentUser, type CurrentUser } from "@/lib/permissions";
import type { OpcoesDaTrava } from "@/lib/roles";

/**
 * As guardas do painel, num lugar só.
 *
 * Antes disto, `requireAdmin()` existia duplicado literalmente em
 * lib/actions/settings.ts e lib/actions/reservations.ts, e perguntava apenas
 * "existe sessão?" — nunca "quem?".
 *
 * O middleware não pode fazer esta checagem: ele roda na borda e não alcança o
 * Prisma. Por isso a autorização por módulo mora aqui, no servidor, chamada
 * pelos layouts de cada módulo e por cada ação que escreve.
 */

/** Para AÇÕES: lança. Ação de servidor é endpoint HTTP — recusar é obrigatório. */
export async function requireModule(
  moduleSlug: string,
  options?: OpcoesDaTrava,
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!can(user, moduleSlug, options)) throw new Error("Não autorizado");
  return user!;
}

/** Para PÁGINAS e LAYOUTS: redireciona em vez de estourar uma tela de erro. */
export async function guardModule(
  moduleSlug: string,
  options?: OpcoesDaTrava,
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // Sem ninguém, mas com o cookie do link de atalhos: o link foi trocado,
  // desligado ou venceu. A página dos atalhos diz isso; o login não serviria
  // a quem nunca teve senha.
  if (!user) redirect((await cookies()).has("atalho") ? "/atalhos" : "/admin/login");
  // Quem entrou pelo link de atalhos volta para a página dos atalhos, e não
  // para o painel, que ele não enxerga.
  if (!can(user, moduleSlug, options)) redirect(user.atalho ? "/atalhos" : "/admin");
  return user;
}
