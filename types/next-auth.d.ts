import type { DefaultSession } from "next-auth";

/**
 * O id do usuário precisa atravessar até a sessão para que as permissões
 * possam ser lidas do banco a cada requisição. Antes disto, `authorize`
 * devolvia o id e ele era descartado: o token carregava só o nome.
 *
 * As permissões em si NÃO viajam no token de propósito — a sessão dura 12
 * horas, e tirar o acesso de alguém precisa valer no próximo clique.
 *
 * Só `next-auth` é aumentado aqui: aumentar `next-auth/jwt` não tem efeito
 * nesta versão, então a leitura do token continua com cast, como já era.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

