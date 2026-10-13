import { guardModule } from "@/lib/auth-guard";

/** A guarda do módulo no layout: tela nova dentro de /admin/receituario nasce protegida. */
export default async function ReceituarioLayout({ children }: LayoutProps<"/admin/receituario">) {
  await guardModule("receituario");
  return <>{children}</>;
}
