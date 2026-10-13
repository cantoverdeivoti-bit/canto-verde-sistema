import { Pagina } from "@/components/pagina";
import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { formatInTimeZone } from "date-fns-tz";
import { getCurrentUser } from "@/lib/permissions";

import { UsersList } from "./users-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usuários — Configurações gerais" };

/**
 * Quem entra no painel.
 *
 * A data do último acesso é formatada aqui, no fuso da casa, e não no
 * navegador: o painel é usado no balcão e no celular, e a data tem que ser
 * a mesma nos dois — a do restaurante, não a do aparelho.
 */
export default async function UsuariosPage() {
  const [eu, usuarios, { capacity }] = await Promise.all([
    getCurrentUser(),
    prisma.adminUser.findMany({
      orderBy: [{ isActive: "desc" }, { username: "asc" }],
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        superusuario: true,
        permissions: { select: { moduleSlug: true, canConfigure: true } },
      },
    }),
    getSettings(),
  ]);

  return (
    <Pagina largura="media">
      <UsersList
        meuId={eu?.id ?? null}
        items={usuarios.map((u) => ({
          id: u.id,
          username: u.username,
          name: u.name,
          role: u.role,
          isActive: u.isActive,
          ultimoAcesso: u.lastLoginAt
            ? formatInTimeZone(u.lastLoginAt, capacity.timezone, "dd/MM 'às' HH:mm")
            : null,
          grants: u.permissions,
          superusuario: u.superusuario,
        }))}
      />
    </Pagina>
  );
}
