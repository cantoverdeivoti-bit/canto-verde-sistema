import type { NextAuthConfig } from "next-auth";

/**
 * As telas que o link de atalhos (sem login) alcança: contar o estoque,
 * receber pedidos e a Requisição (decisão do dono). Cotação, conferir,
 * enviar, pedido manual e a lista de pedidos pedem login.
 *
 * A página de UM pedido fica aberta: é nela que o pedido que a Requisição
 * acabou de criar sai pelo WhatsApp. A lista de todos, não.
 *
 * Aqui só se olha se o cookie EXISTE — o proxy não chega no banco; quem
 * confere se o código vale é `getCurrentUser`, e cada página e ação ainda
 * pede `{ atalho: true }` para abrir.
 */
const CAMINHOS_DO_ATALHO = ["/admin/compras/recebimentos", "/admin/compras/contagem", "/admin/compras/listas"];
const PEDIDO_DO_ATALHO = /^\/admin\/compras\/pedidos\/\d+(\/lista)?\/?$/;

/** O endereço abre pelo link de atalhos? */
export function abrePeloAtalho(pathname: string): boolean {
  return (
    CAMINHOS_DO_ATALHO.some((c) => pathname === c || pathname.startsWith(`${c}/`)) || PEDIDO_DO_ATALHO.test(pathname)
  );
}

/**
 * Configuração compartilhada com o middleware.
 *
 * Fica separada de `lib/auth.ts` de propósito: o middleware não pode importar
 * bcrypt nem o Prisma Client. Com a estratégia JWT, validar a sessão é só
 * verificar a assinatura do cookie — nenhuma consulta ao banco necessária.
 */
export const authConfig = {
  pages: {
    signIn: "/admin/login",
  },
  session: {
    strategy: "jwt",
    // Quatro horas, e não doze.
    //
    // O painel vive num aparelho compartilhado no balcão. Com doze horas, um
    // login de manhã deixava a sessão aberta até a noite, e quem passasse pela
    // tela entrava sem senha nenhuma. Quatro horas é meio turno: cobre o
    // almoço inteiro e não atravessa a noite.
    maxAge: 60 * 60 * 4,
    // Renova a cada hora de uso, então quem está trabalhando NÃO é interrompido
    // — o relógio das quatro horas conta a partir da última atividade, não do
    // login. Quem é cortada é a sessão largada.
    updateAge: 60 * 60,
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = Boolean(auth?.user);
      const { pathname } = request.nextUrl;

      if (pathname === "/admin/login") {
        if (isLoggedIn) {
          return Response.redirect(new URL("/admin", request.nextUrl));
        }
        return true;
      }

      if (pathname.startsWith("/admin")) {
        if (isLoggedIn) return true;
        if (request.cookies.has("atalho")) {
          return abrePeloAtalho(pathname) ? true : Response.redirect(new URL("/atalhos", request.nextUrl));
        }
        return false;
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        // O id é o que permite ler as permissões no banco a cada tela. As
        // permissões em si NÃO entram aqui: a sessão dura 12 horas, e tirar
        // o acesso de alguém precisa valer no próximo clique.
        token.uid = user.id;
        token.username = user.name ?? undefined;
      }

      // Sessão aberta antes das permissões existirem não carrega uid, e sem
      // ele não há como saber de quem são as permissões. Invalidar é melhor
      // que o meio-estado em que a pessoa navega mas toda gravação falha.
      if (!token.uid) return null;

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        // O cast é necessário: aumentar `next-auth` funciona (por isso
        // `session.user.id` existe), mas aumentar `next-auth/jwt` não pega
        // nesta versão — o token chega como {}. O código já fazia isso para
        // `username` antes de existir id.
        session.user.id = (token.uid as string | undefined) ?? "";
        session.user.name =
          (token.username as string | undefined) ?? session.user.name;
      }
      return session;
    },
  },
  providers: [], // preenchido em lib/auth.ts
} satisfies NextAuthConfig;
