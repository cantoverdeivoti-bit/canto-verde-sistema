import { guardModule } from "@/lib/auth-guard";

/**
 * A guarda de Usuários.
 *
 * Exige `configure`, não só acesso, porque aqui não existe "ver sem mexer":
 * a tela é a edição. Quem entra nesta seção está mudando quem entra na casa.
 * A própria leitura já é sensível: a lista diz quem tem conta e o que cada
 * um pode.
 */
export default async function UsuariosLayout({ children }: LayoutProps<"/admin/sistema/usuarios">) {
  await guardModule("sistema", { configure: true });
  return <>{children}</>;
}
