"use client";

import { CalendarClock, House, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

import { IconeNav } from "@/components/icone-nav";
import { IndicadorDeLink } from "@/components/indicador-de-link";
import { NUMERO_DO_MODULO, type AtalhoDaBarra } from "@/lib/barra-de-baixo";
import { atalhosDo, grupoDaTela, moduleForPath, secoesDoMenu, type EcosystemModule } from "@/lib/modules";

import { BarraDeBaixo } from "./barra-de-baixo";
import { NumeroDoMenu } from "./contadores-do-menu";
import { ListaDeSecoes } from "./lista-de-secoes";
import { SetaDasColunas, useColunas } from "./nav-colunas";
import { VersaoNoAr } from "./versao-no-ar";

/**
 * O menu do celular aberto ocupa uma entrada no histórico, com esta marca.
 * Assim o voltar do Android fecha primeiro o menu, e só o toque seguinte sai
 * da tela. A entrada copia o estado do Next (`history.state`) para o roteador
 * reconhecer a volta como dele, sem recarregar a página.
 */
const MARCA_DO_MENU = "menuAberto";

/** Fechar pela mão desfaz a entrada do menu; quem fecha de fato é o `popstate`. */
function voltarDoMenu(): boolean {
  if (!window.history.state?.[MARCA_DO_MENU]) return false;
  window.history.back();
  return true;
}

type Props = {
  restaurantName: string;
  /** Server action de logout, passada pelo layout (server component). */
  logout: () => Promise<void>;
  /**
   * Já filtrados por permissão no layout.
   *
   * A lateral é componente cliente e não alcança o banco, então quem decide
   * o que ela mostra é quem sabe quem está logado. Ela só desenha a lista
   * que recebe — e uma lista vazia é uma lateral sem módulo nenhum, que é a
   * resposta certa para quem não tem permissão para nada.
   */
  modules: EcosystemModule[];
  /** O sino e a conta, no canto direito da barra do celular (`acoes-do-topo.tsx`). */
  acoes?: ReactNode;
  /** Os atalhos da barra de baixo do celular, já filtrados (`lib/barra-de-baixo.ts`). */
  barra: AtalhoDaBarra[];
};

/**
 * No desktop, um eixo só: em qual módulo você está. Tocar no módulo abre os
 * atalhos dele, as telas em cartões (`components/atalhos-do-modulo.tsx`), e
 * as seções do módulo ficam na barra do alto (`abas-do-modulo.tsx`). O número
 * do que espera alguém (pendências) fica também ao lado do módulo.
 *
 * Renderiza o que o layout entrega: a lateral não sabe quantos módulos
 * existem, nem quais esta pessoa pode abrir.
 *
 * No celular vira um cabeçalho com o nome da seção atual e, embaixo, a barra
 * de atalhos (`barra-de-baixo.tsx`). O "Menu" dela abre, por cima da tela e
 * entrando pela direita, a mesma coluna do desktop: os módulos e, dentro do
 * módulo atual, as seções com os grupos. Uma coluna fixa não cabe ao lado do
 * conteúdo em 375 px; deslizando por cima, cabe inteira e some quando a
 * pessoa escolhe.
 */
export function Sidebar({ restaurantName, logout, modules, acoes, barra }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Ao abrir, o foco vai para o ✕; ao fechar pela mão, volta para o "Menu".
  const menuRef = useRef<HTMLButtonElement>(null);
  const fecharRef = useRef<HTMLButtonElement>(null);
  const abrir = () => {
    window.history.pushState({ ...window.history.state, [MARCA_DO_MENU]: true }, "");
    setOpen(true);
  };
  const fechar = () => {
    if (!voltarDoMenu()) setOpen(false);
    menuRef.current?.focus();
  };
  const { aberto } = useColunas();
  const active = moduleForPath(pathname);

  const raiz = active ? `/admin/${active.slug}` : undefined;
  const eAtiva = (href: string) => (href === raiz ? pathname === href : pathname.startsWith(href));
  // Tela fora do menu (as abas dos relatórios): mostra o grupo dela.
  const atual =
    active?.sections.find((s) => eAtiva(s.href)) ??
    (active ? grupoDaTela(active.sections, pathname) : null) ??
    null;
  // Nos atalhos do módulo (ou em tela fora do menu), o cabeçalho diz o módulo.
  // A Programação é de todos os módulos, fora de qualquer um: o cabeçalho diz o nome dela.
  const naAgenda = pathname.startsWith("/admin/agenda");
  const rotuloAtual = naAgenda ? "Programação" : atual ? ("label" in atual ? atual.label : atual.nome) : (active?.name ?? null);
  const iconeAtual = naAgenda ? "programacao" : (atual?.icone ?? active?.icone ?? null);

  /* O painel do celular fecha quando a tela troca de fato, e não no toque.
     Fechando no toque, o item sumia junto com o sinal de que pegou, e a tela
     velha ficava parada sem dizer nada. Assim o item tocado pulsa até a tela
     nova chegar — com o esqueleto de `loading.tsx`, quase sempre na hora.
     Ajuste durante a renderização, e não num efeito: é o jeito que o React
     recomenda para estado que acompanha uma prop. */
  const [telaAnterior, setTelaAnterior] = useState(pathname);
  if (pathname !== telaAnterior) {
    setTelaAnterior(pathname);
    setOpen(false);
  }
  /** Tocar na tela em que já se está não troca nada: aí fecha no toque. */
  const fecharSeForAqui = (href: string) => {
    if (href === pathname) setOpen(false);
  };
  /* No menu do celular os links trocam a entrada do menu no histórico
     (`replace`), em vez de empilhar outra: depois de ir a uma tela pelo menu,
     o voltar leva à tela de antes, e não ao menu de novo. Na tela em que já
     se está, o toque só fecha o menu. */
  const tocarNoMenu = (href: string, e: MouseEvent) => {
    if (href !== pathname) return;
    e.preventDefault();
    fechar();
  };

  // Aberto, o painel trava a rolagem da página por baixo e fecha com Esc.
  useEffect(() => {
    if (!open) return;
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (!voltarDoMenu()) setOpen(false);
      menuRef.current?.focus();
    };
    // O voltar do celular (ou do navegador) com o menu aberto: só fecha.
    const aoVoltar = () => setOpen(false);
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("popstate", aoVoltar);
    fecharRef.current?.focus();
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("popstate", aoVoltar);
    };
  }, [open]);

  const nav = (
    <nav className="flex flex-col gap-6">
      <div>
        <ul className="flex flex-col gap-1">
          {/* A página inicial com nome próprio: antes só se chegava a ela
              tocando no nome da casa, e ninguém adivinhava. */}
          <li>
            <Link
              href="/admin"
              className="nav-link flex items-center gap-2 py-1.5"
              aria-current={pathname === "/admin" ? "page" : undefined}
              onClick={() => fecharSeForAqui("/admin")}
            >
              <House aria-hidden className="size-4" />
              Painel central
              <IndicadorDeLink />
            </Link>
          </li>
          {/* A agenda de toda a casa, junto do painel: não é de um módulo só. */}
          <li>
            <Link
              href="/admin/agenda"
              className="nav-link flex items-center gap-2 py-1.5"
              aria-current={naAgenda ? "page" : undefined}
              onClick={() => fecharSeForAqui("/admin/agenda")}
            >
              <CalendarClock aria-hidden className="size-4" />
              Programação
              <IndicadorDeLink />
            </Link>
          </li>
          {modules.map((m) => {
            const isActive = active?.slug === m.slug;
            // O módulo abre nos atalhos dele: as telas em cartões.
            const root = atalhosDo(m.slug);
            return (
              <li key={m.slug}>
                <Link
                  href={root}
                  className="nav-link flex items-center gap-2 py-1.5"
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => fecharSeForAqui(root)}
                >
                  <IconeNav nome={m.icone} />
                  {m.name}
                  <IndicadorDeLink />
                  {NUMERO_DO_MODULO[m.slug] && <NumeroDoMenu chave={NUMERO_DO_MODULO[m.slug]} />}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <form action={logout}>
        <button
          type="submit"
          className="text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
        >
          Sair
        </button>
      </form>
      <VersaoNoAr />
    </nav>
  );

  return (
    <>
      {/* Desktop: coluna fixa à esquerda.

          Recolhida ela some inteira, e quem a traz de volta é a faixa com a
          seta que `nav-colunas.tsx` mantém em fluxo no lugar dela — ou
          simplesmente passar o mouse ali.

          O que recolher devolve é silêncio, e não largura. O conteúdo tem
          `max-w-4xl` no layout, então isto não alarga tela nenhuma: só tira da
          frente duas listas de links de quem já sabe onde está. Quem quiser
          que o comparativo use o espaço que sobra precisa mexer naquele teto,
          que é outra decisão — é ele que segura a largura de linha em toda
          tela de texto do painel. */}
      {aberto && (
        <aside className="faixa-escura hidden w-56 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:block">
          <div className="sticky top-0 flex min-h-screen flex-col gap-8 p-5">
            <div className="flex items-center justify-between gap-2">
              <Link href="/admin" className="font-semibold leading-tight">
                {restaurantName}
              </Link>
              <SetaDasColunas className="-mr-1.5 shrink-0" />
            </div>
            {nav}
          </div>
        </aside>
      )}

      {/* Celular: onde você está, o sino e a conta à direita. O menu abre
          pelo "Menu" da barra de baixo. Sem fio embaixo: a barra emenda no
          cabeçalho verde da tela. A altura (53 px, `--topo-fixo` no layout)
          vem dos botões do sino e da conta. */}
      <div className="faixa-escura sticky top-0 z-30 bg-[var(--surface)] lg:hidden">
        <div className="flex min-h-[53px] items-center gap-2 py-1.5 pr-3 pl-5">
          {rotuloAtual && iconeAtual ? (
            <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--primary)]">
              <IconeNav nome={iconeAtual} />
              <span className="truncate">{rotuloAtual}</span>
            </span>
          ) : (
            <Link href="/admin" className="min-w-0 truncate font-semibold">
              {restaurantName}
            </Link>
          )}
          {acoes && <div className="ml-auto">{acoes}</div>}
        </div>
      </div>

      <BarraDeBaixo
        atalhos={barra}
        caminho={pathname}
        moduloAtual={active?.slug}
        menuAberto={open}
        aoAbrirMenu={abrir}
        menuRef={menuRef}
      />

      {/* O painel que desliza: a coluna do desktop, por cima da tela,
          entrando pela direita (do lado do "Menu" e do polegar). */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            aria-label="Fechar o menu"
            tabIndex={-1}
            onClick={fechar}
            className="absolute inset-0 animate-[escurecer_200ms_ease-out] bg-black/40"
          />
          <aside className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] animate-[entrar-da-direita_200ms_ease-out] flex-col gap-6 overflow-y-auto bg-[var(--surface)] px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl">
            <div className="flex items-center gap-2">
              <button
                ref={fecharRef}
                type="button"
                onClick={fechar}
                aria-label="Fechar o menu"
                className="-ml-1.5 rounded-md p-1.5 hover:bg-[var(--muted)]"
              >
                <X aria-hidden className="size-5" />
              </button>
              <Link href="/admin" replace onClick={(e) => tocarNoMenu("/admin", e)} className="min-w-0 truncate font-semibold leading-tight">
                {restaurantName}
              </Link>
            </div>
            <nav className="flex flex-col gap-6">
              <ul className="flex flex-col gap-1">
                <li>
                  <Link
                    href="/admin"
                    replace
                    className="nav-link flex items-center gap-2 py-2"
                    aria-current={pathname === "/admin" ? "page" : undefined}
                    onClick={(e) => tocarNoMenu("/admin", e)}
                  >
                    <House aria-hidden className="size-4" />
                    Painel central
                    <IndicadorDeLink />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/admin/agenda"
                    replace
                    className="nav-link flex items-center gap-2 py-2"
                    aria-current={naAgenda ? "page" : undefined}
                    onClick={(e) => tocarNoMenu("/admin/agenda", e)}
                  >
                    <CalendarClock aria-hidden className="size-4" />
                    Programação
                    <IndicadorDeLink />
                  </Link>
                </li>
                {modules.map((m) => {
                  const isActive = active?.slug === m.slug;
                  // O módulo abre nos atalhos dele; as seções viraram os cartões de lá.
                  const root = atalhosDo(m.slug);
                  return (
                    <li key={m.slug}>
                      <Link
                        href={root}
                        replace
                        className="nav-link flex items-center gap-2 py-2"
                        aria-current={isActive ? "true" : undefined}
                        onClick={(e) => tocarNoMenu(root, e)}
                      >
                        <IconeNav nome={m.icone} />
                        {m.name}
                        <IndicadorDeLink />
                        {NUMERO_DO_MODULO[m.slug] && <NumeroDoMenu chave={NUMERO_DO_MODULO[m.slug]} />}
                      </Link>
                      {/* As seções do módulo em que você está, logo abaixo
                          dele: os dois níveis do desktop numa coluna só. */}
                      {isActive && (
                        <div className="mt-1 mb-2 ml-3.5 border-l border-[var(--border)] pl-2">
                          <ListaDeSecoes
                            caminho={pathname}
                            secoes={secoesDoMenu(m)}
                            eAtiva={eAtiva}
                            aoNavegar={tocarNoMenu}
                            substituir
                            linkClassName="nav-link flex items-center gap-2.5 px-2 py-2"
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <form action={logout}>
                <button
                  type="submit"
                  className="text-sm text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
                >
                  Sair
                </button>
              </form>
              <VersaoNoAr />
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
