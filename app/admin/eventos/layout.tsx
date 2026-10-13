import { guardModule } from "@/lib/auth-guard";

/**
 * A guarda do módulo mora no layout, como em Compras: cobre por prefixo, e
 * tela nova dentro de /admin/eventos nasce protegida.
 */
export default async function EventosLayout({ children }: LayoutProps<"/admin/eventos">) {
  await guardModule("eventos");
  return <>{children}</>;
}
