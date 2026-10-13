/**
 * Configurações gerais. A guarda não mora aqui, mas em cada seção: Usuários
 * exige "configurar" (ver `usuarios/layout.tsx`); a Página inicial e as
 * Minhas notificações são de cada pessoa, então basta estar logado.
 */
export default function SistemaLayout({ children }: LayoutProps<"/admin/sistema">) {
  return <>{children}</>;
}
