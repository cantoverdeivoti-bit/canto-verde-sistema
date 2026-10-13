"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

/**
 * As duas colunas da esquerda: recolhem ao clicar fora, voltam ao passar o
 * mouse.
 *
 * Elas são componentes irmãos dentro de um layout de servidor, então o estado
 * não pode morar em nenhuma das duas: a lateral precisa saber para se
 * desenhar, e a trilha precisa saber para sumir. Um contexto aqui é o menor
 * lugar que as duas alcançam.
 *
 * Três estados, e não dois:
 *
 * `recolhido` é a escolha, e ela gruda. Sai clicando na seta ou em qualquer
 * lugar fora das colunas — ou seja, sempre que a pessoa vai fazer outra coisa.
 *
 * `sobrevoando` é passageiro: o mouse em cima abre, o mouse fora fecha, e a
 * escolha continua a mesma embaixo. É consulta, não decisão.
 *
 * `aberto` é a soma dos dois, e é o que as colunas leem.
 *
 * Não guarda em `localStorage` de propósito. O provedor vive no layout, então
 * o estado atravessa a navegação entre telas — que é quando ele importa.
 * Sobreviver a um recarregar custaria ler o armazenamento durante a
 * renderização, que é o caminho conhecido para o servidor desenhar aberto e o
 * navegador corrigir para fechado, piscando na cara de quem abre.
 *
 * Só vale a partir de `lg`. Abaixo disso as colunas não existem: a mesma
 * navegação vira o cabeçalho com Menu e a faixa horizontal de abas.
 */
const Contexto = createContext<{
  recolhido: boolean;
  aberto: boolean;
  alternar: () => void;
}>({ recolhido: false, aberto: true, alternar: () => {} });

export function useColunas() {
  return useContext(Contexto);
}

export function NavColunas({ children }: { children: React.ReactNode }) {
  const [recolhido, setRecolhido] = useState(false);
  const [sobrevoando, setSobrevoando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  const flutuando = recolhido && sobrevoando;
  const aberto = !recolhido || sobrevoando;

  /**
   * Clicar fora recolhe.
   *
   * No `click`, e não no `pointerdown`: recolher no apertar mexia a tela
   * antes de o botão soltar, e o clique caía fora do que a pessoa apertou.
   * O "Salvar" e o "Recusar" pareciam não funcionar no computador. Agora o
   * clique chega no botão e só depois a coluna sai da frente.
   *
   * Só quando está aberto e grudado — enquanto ela está apenas sobrevoando,
   * quem fecha é tirar o mouse, e recolher aqui gravaria uma escolha que
   * ninguém fez.
   *
   * O ouvinte só existe enquanto precisa: sem a guarda, seria um ouvinte de
   * documento vivo em toda tela do painel para não fazer nada.
   */
  useEffect(() => {
    if (recolhido) return;

    function foraDaqui(e: MouseEvent) {
      if (caixa.current?.contains(e.target as Node)) return;
      setRecolhido(true);
    }

    document.addEventListener("click", foraDaqui);
    return () => document.removeEventListener("click", foraDaqui);
  }, [recolhido]);

  return (
    <Contexto.Provider
      value={{ recolhido, aberto, alternar: () => setRecolhido((v) => !v) }}
    >
      {/* No celular, esta caixa é que fica presa ao topo: ela só tem a altura
          do cabeçalho com o ☰, e um `sticky` lá dentro não tinha por onde
          correr — subia junto com a página e o ☰ sumia na primeira rolagem.
          No desktop continua `relative`, que é o que ancora as colunas
          flutuantes. */}
      <div
        ref={caixa}
        className="sticky top-0 z-30 lg:relative lg:z-auto lg:flex"
        // Sobrevoar é coisa de desktop, onde as colunas existem. No celular o
        // painel do ☰ mora nesta mesma caixa, e ligar o sobrevoo ao encostar
        // nele fazia o embrulho trocar de forma no meio do toque — o grupo
        // "Cadastros" não abria, porque o clique caía no desenho que sumia.
        onMouseEnter={() => {
          if (window.matchMedia("(min-width: 1024px)").matches) setSobrevoando(true);
        }}
        onMouseLeave={() => setSobrevoando(false)}
      >
        {/* A faixa com a seta, em fluxo sempre que está recolhido — inclusive
            enquanto os painéis flutuam por cima. É ela que segura os 40px e
            impede o conteúdo de pular para os lados toda vez que o mouse passa
            perto da borda esquerda. */}
        {recolhido && (
          <div className="hidden w-10 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:block">
            <div className="sticky top-0 flex min-h-screen justify-center px-2 py-5">
              <SetaDasColunas />
            </div>
          </div>
        )}

        {/* Sobrevoando, as colunas saem do fluxo e flutuam sobre o conteúdo.
            Empurrar seria o texto da tela reescrevendo a largura a cada
            passada do mouse — e passar o mouse é justamente o gesto que não
            deveria mudar nada de lugar.

            `contents` quando não flutua: o embrulho desaparece do layout e as
            duas colunas voltam a ser filhas diretas da linha flex. */}
        <div
          className={
            // Só flutua do `lg` para cima; abaixo disso é sempre `contents`,
            // para nunca esconder o cabeçalho e o painel do celular.
            flutuando
              ? "contents lg:absolute lg:inset-y-0 lg:left-10 lg:z-40 lg:flex lg:shadow-xl"
              : "contents"
          }
        >
          {children}
        </div>
      </div>
    </Contexto.Provider>
  );
}

/**
 * A seta, escrita uma vez porque aparece em dois desenhos.
 *
 * Aponta para onde a coisa vai: para a esquerda quando há o que recolher, para
 * a direita quando há o que trazer de volta. Gira em vez de trocar de glifo —
 * dois caracteres diferentes saltam de largura e a coluna treme.
 */
export function SetaDasColunas({ className = "" }: { className?: string }) {
  const { recolhido, alternar } = useColunas();

  return (
    <button
      type="button"
      onClick={alternar}
      aria-expanded={!recolhido}
      aria-label={recolhido ? "Fixar o menu lateral aberto" : "Recolher o menu lateral"}
      title={recolhido ? "Fixar o menu lateral aberto" : "Recolher o menu lateral"}
      /* Alvo de 32px e não o tamanho da seta. Recolhida, ela é o único
         controle que sobrou na coluna, e um glifo de dez pixels é um botão que
         se acha por sorte. */
      className={`flex h-8 w-8 items-center justify-center rounded text-xs text-[var(--muted-foreground)] transition hover:bg-[var(--muted)] hover:text-[var(--foreground)] ${className}`}
    >
      <span
        aria-hidden
        className={`inline-block transition-transform ${recolhido ? "" : "rotate-180"}`}
      >
        ▶
      </span>
    </button>
  );
}
