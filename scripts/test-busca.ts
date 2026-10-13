import {
  casaDigitos,
  casaTexto,
  lerTermo,
  melhores,
  POR_GRUPO,
} from "../lib/busca";

/** As regras da lupa do topo, sem banco. */

let falhas = 0;
function igual<T>(nome: string, obtido: T, esperado: T) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a === b) console.log(`ok  ${nome}`);
  else {
    falhas++;
    console.log(`ERRO ${nome}\n     obtido:   ${a}\n     esperado: ${b}`);
  }
}

const t = (q: string) => lerTermo(q)!;

igual("uma letra não busca", lerTermo("a"), null);
igual("só # não busca", lerTermo("#"), null);
igual(
  "sem acento acha com acento",
  casaTexto(t("joao"), "João da Silva"),
  true,
);
igual(
  "com acento acha sem acento",
  casaTexto(t("Feijão"), "feijao carioca"),
  true,
);
igual(
  "todas as palavras, em qualquer ordem",
  casaTexto(t("silva joao"), "João da Silva"),
  true,
);
igual(
  "uma palavra que falta não casa",
  casaTexto(t("joao souza"), "João da Silva"),
  false,
);
igual(
  "palavras em campos diferentes casam",
  casaTexto(t("264c arroz"), "264C", "Arroz Branco"),
  true,
);
igual("#23 é o pedido 23", t("#23").numero, 23);
igual("23 sozinho também", t("23").numero, 23);
igual("texto não é número", t("arroz").numero, null);
igual("#23 busca só pedido", t("#23").soPedido, true);
igual("23 sem # busca em tudo", t("23").soPedido, false);
igual(
  "telefone pelos dígitos, com máscara",
  casaDigitos(t("(51) 9999"), "51999998888"),
  true,
);
igual(
  "menos de 4 dígitos não casa telefone",
  casaDigitos(t("51"), "51999998888"),
  false,
);
igual(
  "campo nulo (CPF escondido) não casa",
  casaDigitos(t("12345678"), null),
  false,
);

const nomes = [
  "Feijão com arroz",
  "Arroz Branco",
  "Arroz integral",
  "Bolo",
].map((nome, i) => ({ nome, ativo: i !== 2 }));
igual(
  "quem começa com a busca vem antes; desativado por último",
  melhores(
    nomes,
    (n) => casaTexto(t("arroz"), n.nome),
    (n) => n.nome,
    t("arroz"),
    (n) => n.ativo,
  ).map((n) => n.nome),
  ["Arroz Branco", "Feijão com arroz", "Arroz integral"],
);
igual(
  "no máximo POR_GRUPO por grupo",
  melhores(
    Array.from({ length: 20 }, (_, i) => `Item ${i}`),
    () => true,
    (n) => n,
    t("item"),
  ).length,
  POR_GRUPO,
);

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
