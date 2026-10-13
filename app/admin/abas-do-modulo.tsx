"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { IconeNav } from "@/components/icone-nav";
import { agruparSecoes, grupoDaTela, moduleForPath, secoesDoMenu, type ModuleSection, type NomeDoIcone } from "@/lib/modules";

import { NumeroDoMenu } from "./contadores-do-menu";

/**
 * O segundo nível da navegação no computador: as telas do módulo numa barra
 * horizontal fixa no alto, como um menu de site, e não mais numa segunda
 * coluna. A coluna comia duzentos e tantos pixels da largura em toda tela.
 *
 * No desenho de botões lado a lado (o mesmo das abas de Cadastros do
 * Financeiro, que o dono escolheu): um trilho branco, que se destaca do
 * fundo cinza da página, com a tela atual em verde claro. Cada aba tem o
 * ícone e o tamanho do nome; quando não cabem todas, o trilho rola de lado.
 * Os grupos ("Cadastros") viram um botão que abre a lista embaixo; fecha ao
 * escolher, ao clicar fora ou com Esc.
 *
 * Só no desktop: no celular as mesmas telas moram no painel do ☰
 * (`sidebar.tsx`). Fora de um módulo, não aparece.
 */
export function AbasDoModulo({ acoes }: { acoes?: ReactNode }) {
  const pathname = usePathname();
  const trilho = useRef<HTMLUListElement>(null);
  const active = moduleForPath(pathname);

  // Trilho rolado de lado: a aba da tela aberta aparece sem procurar.
  useEffect(() => {
    trilho.current?.querySelector('[data-atual="sim"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  if (!active || active.sections.length === 0) return <BarraDoTopo acoes={acoes} />;

  // A raiz do módulo só é a aba ativa no caminho exato; as demais valem por
  // prefixo, para /configuracoes/qualquer-coisa seguir acesa.
  const root = `/admin/${active.slug}`;
  const eAtiva = (href: string) => (href === root ? pathname === href : pathname.startsWith(href));
  const secoes = secoesDoMenu(active);
  const grupoAtual = grupoDaTela(secoes, pathname)?.nome ?? null;
  const itens = agruparSecoes(secoes);

  return (
    <BarraDoTopo acoes={acoes} rotulo={`Telas de ${active.name}`}>
      <ul
        ref={trilho}
        className="mx-auto flex w-fit max-w-full items-stretch gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {itens.map((item) =>
          item.tipo === "secao" ? (
            <li key={item.secao.href} className="shrink-0">
              <Aba secao={item.secao} ativa={eAtiva(item.secao.href)} />
            </li>
          ) : (
            <GrupoDeAbas
              key={item.nome}
              nome={item.nome}
              icone={item.icone}
              secoes={item.secoes}
              ativo={item.nome === grupoAtual || item.secoes.some((s) => eAtiva(s.href))}
              eAtiva={eAtiva}
              caminho={pathname}
            />
          ),
        )}
      </ul>
    </BarraDoTopo>
  );
}

/**
 * A barra verde do alto no computador, a mesma cor da coluna dos módulos e do
 * cabeçalho da tela: as abas do módulo no meio (quando há módulo) e o sino e
 * a conta à direita. Fixa no alto ao rolar.
 */
function BarraDoTopo({ acoes, rotulo, children }: { acoes?: ReactNode; rotulo?: string; children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-30 hidden items-center gap-4 bg-[#00461e] px-5 py-2 print:hidden lg:flex">
      <nav aria-label={rotulo} className="min-w-0 flex-1">
        {children}
      </nav>
      {acoes}
    </div>
  );
}

const ESTILO_DA_ABA = "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm whitespace-nowrap transition-colors";
const ABA_ATUAL = "bg-[var(--primary-soft)] font-semibold text-[var(--primary)]";
const ABA_OUTRA = "font-medium text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]";

function Aba({ secao: s, ativa }: { secao: ModuleSection; ativa: boolean }) {
  return (
    <Link
      href={s.href}
      aria-current={ativa ? "page" : undefined}
      data-atual={ativa ? "sim" : undefined}
      className={`${ESTILO_DA_ABA} ${ativa ? ABA_ATUAL : ABA_OUTRA}`}
    >
      <IconeNav nome={s.icone} />
      {s.label}
      {s.contador && <NumeroDoMenu chave={s.contador} />}
    </Link>
  );
}

function GrupoDeAbas({
  nome,
  icone,
  secoes,
  ativo,
  eAtiva,
  caminho,
}: {
  nome: string;
  icone: NomeDoIcone;
  secoes: ModuleSection[];
  ativo: boolean;
  eAtiva: (href: string) => boolean;
  caminho: string;
}) {
  // Aberto guarda onde a lista aparece: fixa na tela, logo abaixo do botão,
  // para a rolagem do trilho não cortar.
  const [aberto, setAberto] = useState<CSSProperties | null>(null);
  const caixa = useRef<HTMLLIElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const posicao = (): CSSProperties | null => {
    const r = botao.current?.getBoundingClientRect();
    return r ? { top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 232)) } : null;
  };

  // Trocou de tela: fecha. Ajuste durante a renderização, como no menu lateral.
  const [telaAnterior, setTelaAnterior] = useState(caminho);
  if (caminho !== telaAnterior) {
    setTelaAnterior(caminho);
    setAberto(null);
  }

  // Aberto, fecha ao clicar fora e com Esc; rolando o trilho ou mudando a
  // janela, a lista acompanha o botão.
  const estaAberto = aberto !== null;
  useEffect(() => {
    if (!estaAberto) return;
    const fechar = () => setAberto(null);
    const acompanhar = () => setAberto(posicao());
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && fechar();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("click", fora);
    window.addEventListener("keydown", tecla);
    window.addEventListener("resize", acompanhar);
    window.addEventListener("scroll", acompanhar, true);
    return () => {
      document.removeEventListener("click", fora);
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("resize", acompanhar);
      window.removeEventListener("scroll", acompanhar, true);
    };
  }, [estaAberto]);

  const atual = secoes.find((s) => eAtiva(s.href));

  return (
    <li ref={caixa} className="shrink-0">
      <button
        ref={botao}
        type="button"
        aria-expanded={estaAberto}
        data-atual={ativo ? "sim" : undefined}
        onClick={() => setAberto(estaAberto ? null : posicao())}
        className={`${ESTILO_DA_ABA} ${ativo ? ABA_ATUAL : ABA_OUTRA}`}
      >
        {/* Dentro do grupo, a aba diz a tela em que você está; fora, o nome do grupo. */}
        <IconeNav nome={atual?.icone ?? icone} />
        {atual?.label ?? nome}
        <ChevronDown aria-hidden className={`size-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>
      {aberto && (
        <ul style={aberto} className="fixed z-40 min-w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg">
          {secoes.map((s) => (
            <li key={s.href}>
              <Link
                href={s.href}
                aria-current={eAtiva(s.href) ? "page" : undefined}
                className={`flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap hover:bg-[var(--muted)] ${
                  eAtiva(s.href) ? "font-semibold text-[var(--primary)]" : ""
                }`}
              >
                <IconeNav nome={s.icone} />
                {s.label}
                {s.contador && <NumeroDoMenu chave={s.contador} />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
