import { guardModule } from "@/lib/auth-guard";

/**
 * A guarda do módulo no layout: cobre por prefixo, e rota nova nasce
 * protegida. Ver e imprimir pede só o módulo; mudar pede "configurar", e
 * quem cobra isso são as ações.
 */
export default async function OperacionalLayout({ children }: LayoutProps<"/admin/operacional">) {
  await guardModule("operacional");
  return children;
}
