import { guardModule } from "@/lib/auth-guard";

/** A guarda do módulo no layout: tela nova dentro de /admin/buffet nasce protegida. */
export default async function BuffetLayout({ children }: LayoutProps<"/admin/buffet">) {
  await guardModule("buffet");
  return <>{children}</>;
}
