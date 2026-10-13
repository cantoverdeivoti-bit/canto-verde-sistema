import type { ReactNode } from "react";

import { CabecalhoDaPagina } from "@/components/pagina";
import { cn } from "@/lib/utils";

/**
 * A largura de cada página de link. As classes ficam escritas inteiras, e não
 * montadas com a medida no meio: o Tailwind só gera a classe que acha escrita
 * no código.
 *
 * Cada linha diz a mesma medida duas vezes: o `max-w-*` é a largura do
 * `main`, e o `--largura-do-main` é o que o `.cabecalho-verde`
 * (app/globals.css) usa para saber quanto falta até a borda da tela. Se as
 * duas não baterem, o verde e a folha cinza param antes da borda ou passam
 * dela.
 */
const LARGURAS = {
  /** Formulário de quem é de fora: cadastro do fornecedor e da equipe, preço. */
  form: "max-w-xl [--largura-do-main:36rem]",
  /** A contagem do estoquista, com a lista inteira. */
  estreita: "max-w-2xl [--largura-do-main:42rem]",
  /** Os cartões de atalho do celular. */
  atalhos: "max-w-md [--largura-do-main:28rem]",
} as const;

/**
 * A página de link (sem login, sem a barra do painel) com a cara das telas do
 * painel: o verde do alto com o nome da casa, o título e uma frase, e o
 * conteúdo na folha cinza que sobe por cima.
 *
 * O desenho do verde mora no `.cabecalho-verde` e depende de medidas que
 * esta moldura tem de repetir igual, porque o CSS não tem como lê-las:
 *  - o `@container` em volta: o verde vai de ponta a ponta medindo `100cqw`,
 *    e sem contêiner essa medida não existe;
 *  - o `px-5` do `main`: é o 1.25rem fixo do `--recuo`;
 *  - o `pt-6` do `main`: é o `--respiro-topo` que o cabeçalho sobe para
 *    encostar no alto da tela;
 *  - a largura, que vem de `LARGURAS` com a mesma medida nos dois lados.
 * O cabeçalho é o primeiro do `main` pelo mesmo motivo, e o `space-y-4` dá o
 * respiro entre o resto: quem vem dentro não precisa de `mt-*`.
 */
export function MolduraDeLink({
  rotulo,
  titulo,
  subtitulo,
  ajuda,
  voltar,
  largura,
  children,
}: {
  /** A linha pequena acima do título: o nome da casa, já que não há a barra do alto. */
  rotulo: ReactNode;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** O resto da explicação, atrás do "?". Só aparece com `subtitulo`. */
  ajuda?: ReactNode;
  voltar?: { href: string; texto: string };
  largura: keyof typeof LARGURAS;
  children?: ReactNode;
}) {
  return (
    <div className="@container min-h-dvh">
      <main className={cn("mx-auto w-full space-y-4 px-5 pt-6 pb-10 [--respiro-topo:1.5rem]", LARGURAS[largura])}>
        <CabecalhoDaPagina rotulo={rotulo} titulo={titulo} subtitulo={subtitulo} ajuda={ajuda} voltar={voltar} />
        {children}
      </main>
    </div>
  );
}
