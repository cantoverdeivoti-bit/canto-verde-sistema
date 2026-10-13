import { EsqueletoDaTela } from "@/components/esqueleto-da-tela";

/**
 * O esqueleto aqui dentro, como em Compras: a troca entre as telas do módulo
 * precisa de um ponto de espera abaixo do layout dele, senão a tela velha
 * fica parada, sem sinal de que o toque pegou, até o servidor responder.
 */
export default function Carregando() {
  return <EsqueletoDaTela />;
}
