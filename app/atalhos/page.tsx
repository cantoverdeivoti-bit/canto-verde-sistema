import { Zap } from "lucide-react";

import { CartoesDeAtalho } from "@/components/cartoes-de-atalho";
import { MolduraDeLink } from "@/components/pagina/moldura-de-link";
import { getSettings } from "@/lib/availability";
import { getCurrentUser } from "@/lib/permissions";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Atalhos",
  robots: { index: false, follow: false },
};

/**
 * A página que o estoquista e o recebedor abrem pelo link: as funções do dia
 * a dia, em cartões grandes, sem o resto do painel.
 *
 * Vale também para quem está logado com Compras — é o mesmo atalho. Sem
 * nenhum dos dois (link trocado, desligado, ou o cookie venceu), diz o que
 * fazer em vez de mandar para o login, que essa pessoa não tem.
 */
export default async function AtalhosPage() {
  const [user, { capacity }] = await Promise.all([getCurrentUser(), getSettings()]);
  // `can`, e não a lista de permissões direto: o superusuário entra em tudo
  // sem permissão gravada, e via aqui "Este link não vale mais".
  const entra = user !== null && can(user, "compras", { atalho: true });

  if (!entra) {
    return (
      <MolduraDeLink
        largura="atalhos"
        rotulo={capacity.name}
        titulo="Este link não vale mais"
        subtitulo="Peça um link novo a quem cuida das compras."
      >
        <SairDoAtalho />
      </MolduraDeLink>
    );
  }

  return (
    <MolduraDeLink
      largura="atalhos"
      rotulo={capacity.name}
      titulo={
        <span className="flex items-center gap-2">
          <Zap aria-hidden className="size-6 shrink-0 text-[var(--primary)]" />
          Olá{user.atalho ? "" : `, ${user.name ?? user.username}`}!
        </span>
      }
      subtitulo="O que vamos fazer agora?"
      // Logado com senha: a volta para o painel inteiro.
      voltar={user.atalho ? undefined : { href: "/admin", texto: "Central" }}
    >
      <CartoesDeAtalho comCadastros={!user.atalho} peloLink={user.atalho} />
      {user.atalho && <SairDoAtalho />}
    </MolduraDeLink>
  );
}

/**
 * A saída de quem entrou pelo link mas é da casa: apaga o cookie do link e
 * abre o login. Formulário, e não `Link`: é uma rota que grava cookie, e tem
 * de ir de verdade ao servidor.
 */
function SairDoAtalho() {
  return (
    <form action="/atalhos/sair" className="text-center text-sm text-[var(--muted-foreground)]">
      É da casa?{" "}
      <button type="submit" className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">
        Entrar com senha
      </button>
    </form>
  );
}
