/**
 * Lista ou mapa: como a cotação se desenha no desktop.
 *
 * A mesma cotação tem duas leituras, e as duas são legítimas. O MAPA põe
 * fornecedor em coluna e item em linha, e responde "quem está mais barato
 * nesta linha" de uma passada de olho — é o que serve para decidir. A LISTA
 * põe um cartão por item, com só quem respondeu AQUELE item, ordenado do
 * mais barato ao mais caro — é o que serve para ler item a item sem rolar o
 * mapa para os lados.
 *
 * O ajuste existe porque a escolha é de quem olha, e não do tamanho da
 * janela: havia quem abrisse o desktop e quisesse a leitura do celular.
 *
 * Só no desktop. No celular o mapa não é uma opção pior, é uma tela que não
 * funciona — nove colunas de 112px numa janela de 375 —, e oferecer a
 * escolha lá seria oferecer uma delas quebrada.
 *
 * Mora em cookie e não em `localStorage` por causa de uma coisa só: o
 * servidor precisa saber o modo ANTES de pintar. Lido do navegador, a
 * primeira pintura viria no modo errado e trocaria na cara da pessoa — e
 * ler num efeito ainda custaria uma violação de `set-state-in-effect`, que
 * este projeto não acrescenta.
 *
 * Preferência de desenho, nada da casa dentro. É por isso que ele pode
 * durar um ano e viajar em toda requisição sem custo nenhum.
 */

export type VisualDaCotacao = "lista" | "mapa";

export const COOKIE_VISUAL = "cotacao-visual";

/**
 * O que o cookie diz, com o mapa como padrão.
 *
 * Qualquer valor estranho cai no padrão em silêncio: cookie é texto que o
 * navegador guarda e qualquer um edita, e um modo inválido não deve virar
 * tela em branco.
 */
export function lerVisual(valor: string | undefined): VisualDaCotacao {
  return valor === "lista" ? "lista" : "mapa";
}

/**
 * Guardar a escolha para a próxima visita.
 *
 * Mora aqui, e não dentro do componente, por causa da regra de
 * imutabilidade do compilador do React: `document.cookie = …` escrito no
 * corpo de um componente é lido como modificação de um valor que ele não
 * possui, mesmo saindo de um `onClick`. A alternativa seria desligar a regra
 * na linha, e este projeto não desliga regra nenhuma.
 *
 * Um ano, `SameSite=Lax`. É preferência de desenho, nada da casa dentro.
 */
export function gravarVisual(modo: VisualDaCotacao): void {
  document.cookie = `${COOKIE_VISUAL}=${modo}; path=/; max-age=31536000; SameSite=Lax`;
}
