import type { Viewport } from "next";
import Link from "next/link";

import { AvisoDoTopo } from "@/components/aviso-do-topo";
import { logout } from "@/lib/actions/auth";
import { lerBarra, montarBarra } from "@/lib/barra-de-baixo";
import { getSettings } from "@/lib/availability";
import { getCurrentUser } from "@/lib/permissions";
import { contadoresDaCasa } from "@/lib/contadores";
import { can, ROLE_LABEL, visibleModules } from "@/lib/roles";

import { AbasDoModulo } from "./abas-do-modulo";
import { AcoesDoTopo } from "./acoes-do-topo";
import { ContadoresDoMenu, type Contadores } from "./contadores-do-menu";
import { NavColunas } from "./nav-colunas";
import { Sidebar } from "./sidebar";

/**
 * A barra do navegador no celular, no verde-escuro do topo do painel.
 * `cover`: a tela vai até a borda do iPhone, e `env(safe-area-inset-*)` passa
 * a dar a medida da área do gesto, que a barra de baixo usa para não ficar
 * embaixo dela.
 */
export const viewport: Viewport = { themeColor: "#00461e", viewportFit: "cover" };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // `getCurrentUser`, não `auth`: além da sessão, ele confere no banco se a
  // conta continua ativa. Quem foi desativado no meio do expediente perde a
  // shell no clique seguinte, sem esperar o token de doze horas vencer.
  // As configurações vêm junto, e não depois: só o nome da casa sai delas, e
  // esperar o usuário para só então pedi-las era uma ida ao banco a mais.
  const [user, { capacity }] = await Promise.all([getCurrentUser(), getSettings()]);

  // A tela de login usa este mesmo layout, mas sem a shell do ecossistema.
  if (!user) {
    return <div className="tema-painel min-h-full">{children}</div>;
  }

  // Pelo link de atalhos: sem a lateral dos módulos (ele só enxerga as telas
  // do dia a dia), com uma faixa que volta para a página dos atalhos.
  if (user.atalho) {
    return (
      /* `--topo-fixo`: a altura da faixa presa no alto, para o que também
         gruda no alto (a barra do orçamento da cotação) grudar logo abaixo. */
      <AvisoDoTopo>
      <div className="tema-painel min-h-full [--topo-fixo:45px]">
        <header className="faixa-escura sticky top-0 z-30 flex items-center gap-3 bg-[var(--background)] px-5 py-3 print:hidden">
          <Link href="/atalhos" className="text-sm font-semibold text-[var(--primary)]">
            ← Atalhos
          </Link>
          <span className="ml-auto truncate text-sm text-[var(--muted-foreground)]">{capacity.name}</span>
          {/* Quem é da casa e caiu aqui pelo link (a sessão venceu com o
              cookie do link valendo) sai por aqui para o login. */}
          <form action="/atalhos/sair" className="shrink-0">
            <button type="submit" className="text-sm font-semibold text-[var(--primary)] underline-offset-4 hover:underline">
              Entrar com senha
            </button>
          </form>
        </header>
        <div className="@container min-w-0">
          <main className="mx-auto w-full max-w-4xl px-5 py-6 [--respiro-topo:1.5rem]">{children}</main>
        </div>
      </div>
      </AvisoDoTopo>
    );
  }

  // O número de Pendências no menu: só o que pede decisão, e só para quem
  // entra em Compras (o link de atalhos não vê a seção). Sem `await`: a tela
  // não espera a conta, o número chega depois (ver `ContadoresDoMenu`).
  // `cadastrosPendentes` é o mesmo número no Departamento pessoal: quem mandou o
  // cadastro pelo link e espera a aprovação.
  // Os números vêm guardados por alguns segundos (`lib/contadores.ts`): o
  // menu aparece em toda tela, e contar a cada toque eram nove consultas.
  const contadores: Promise<Contadores> = contadoresDaCasa()
    .then((c) => ({
      pendencias: can(user, "compras") ? c.decisoes : undefined,
      cadastrosPendentes: can(user, "pessoal") ? c.cadastrosPendentes : undefined,
      // As sugestões do buffet só contam para quem aprova.
      sugestoesBuffet: can(user, "buffet", { configure: true }) ? c.sugestoesBuffet : undefined,
      treinamentosPendentes: can(user, "operacional") ? c.treinamentosPendentes : undefined,
    }))
    .catch(() => ({}));

  // O sino e a conta, no canto direito do topo: no celular na barra do ☰, no
  // computador na barra das abas.
  const acoes = <AcoesDoTopo nome={user.name || user.username} papel={ROLE_LABEL[user.role]} logout={logout} />;

  // Os atalhos da barra de baixo do celular: a escolha da pessoa, só com o
  // que ela abre (módulo pronto e com permissão, como o menu).
  const modulos = visibleModules(user);
  const abre = new Set(modulos.map((m) => m.slug));
  const barra = montarBarra(lerBarra(user.paginaInicial), (m) => abre.has(m));

  return (
    // flex, não grade: a lateral recolhe, e uma grade de trilhas fixas
    // deixaria o buraco dela no lugar.
    <AvisoDoTopo>
    {/* As margens da área segura: com o celular deitado, o entalhe do iPhone
        fica de lado, e o `cover` acima deixaria o conteúdo embaixo dele. */}
    <div className="tema-painel min-h-full pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] [--topo-fixo:53px] lg:flex lg:[--topo-fixo:0px]">
      {/* A lateral é componente cliente e não busca sozinha quem está logado.
          O layout resolve os módulos permitidos aqui e entrega a lista pronta.

          As duas colunas recolhem juntas, e o estado mora aqui porque é o
          menor lugar que as duas alcançam. Vivendo no layout, ele atravessa a
          navegação entre telas do painel — que é quando ele importa. */}
      {/* `contents` na tela, para não mexer no flex; some na impressão, e a
          folha impressa (a lista de compra) sai só com o conteúdo. */}
      <div className="contents print:hidden">
        <ContadoresDoMenu valor={contadores}>
        <NavColunas>
          <Sidebar
            restaurantName={capacity.name}
            logout={logout}
            modules={modulos}
            acoes={acoes}
            barra={barra}
          />
        </NavColunas>
        </ContadoresDoMenu>
      </div>
      {/* `@container` para quem precisa medir a área de conteúdo.
          O `main` é `max-w-4xl` de propósito — texto em linha de 150
          caracteres não se lê —, mas o mapa da cotação não é texto: ele quer
          todas as colunas de fornecedor à vista. Marcando esta div como
          contêiner, o mapa consegue perguntar "quanto sobra aqui de verdade"
          em `cqw` e sair da coluna de leitura pelo tanto certo.

          Tinha de ser AQUI, e não no `main`: o que varia é justamente o que
          está fora dele — a lateral recolhe e devolve duzentos e tantos
          pixels, e margem negativa de número fixo ou desperdiça o espaço ou
          estoura por cima da lateral.

          O `container-type` prende o `position: fixed` neste contêiner. Por
          isso o que precisa ficar preso à tela (a barra de baixo, o menu do
          celular) mora fora dele, na lateral, e o "+ Nova tarefa" sai por um
          portal. */}
      {/* No computador, o que gruda no alto fica abaixo da barra das telas do
          módulo (49 px); fora de um módulo ninguém aqui dentro gruda. */}
      <div className="@container min-w-0 flex-1 lg:[--topo-fixo:63px]">
        {/* As telas do módulo numa barra fixa no alto (só no computador). */}
        <ContadoresDoMenu valor={contadores}>
          <AbasDoModulo acoes={acoes} />
        </ContadoresDoMenu>
        <main className="mx-auto w-full max-w-4xl px-5 pt-8 pb-[calc(2rem+var(--barra-de-baixo))] [--respiro-topo:2rem]">{children}</main>
      </div>
    </div>
    </AvisoDoTopo>
  );
}
