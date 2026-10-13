import { guardModule } from "@/lib/auth-guard";

/**
 * A guarda do módulo mora no layout, não em cada página.
 *
 * Cobre por prefixo, então rota nova dentro de /admin/compras nasce protegida
 * sem ninguém lembrar de nada. O middleware não pode fazer esta checagem: roda
 * na borda e não alcança o Prisma, e a permissão é lida do banco a cada
 * requisição para valer no clique seguinte.
 */
export default async function ComprasLayout({
  children,
}: LayoutProps<"/admin/compras">) {
  await guardModule("compras", { atalho: true });
  return <>{children}</>;
}
