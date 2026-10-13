import { guardModule } from "@/lib/auth-guard";

/**
 * A guarda do módulo mora no layout, como em Compras e Eventos: cobre por
 * prefixo, e tela nova dentro de /admin/financeiro nasce protegida.
 */
export default async function FinanceiroLayout({ children }: LayoutProps<"/admin/financeiro">) {
  await guardModule("financeiro");
  return <>{children}</>;
}
