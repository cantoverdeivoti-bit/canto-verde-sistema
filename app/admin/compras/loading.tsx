import { EsqueletoDaTela } from "@/components/esqueleto-da-tela";

/**
 * O mesmo esqueleto, de novo aqui dentro: Compras tem layout com guarda
 * própria, e a troca entre as telas dela precisa de um ponto de espera abaixo
 * desse layout, e não só no do painel.
 */
export default function Carregando() {
  return <EsqueletoDaTela />;
}
