import { atalhoAtivo, BARRA_PADRAO, lerBarra, montarBarra } from "../lib/barra-de-baixo";
import { lerPreferencia, montarPagina, PADRAO } from "../lib/pagina-inicial";

/**
 * A regra da página inicial editável, sem banco: padrão, escolha com ordem,
 * chave que saiu do catálogo e permissão. Roda com
 * `npx tsx scripts/test-pagina-inicial.ts`.
 */

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

const tudo = () => true;
const chaves = (p: ReturnType<typeof montarPagina>) => ({
  numeros: p.numeros.map((n) => n.chave),
  atalhos: p.atalhos.map((a) => a.chave),
});

igual("padrão", chaves(montarPagina(null, tudo)), PADRAO);

const escolha = { numeros: ["notificacoes", "pendencias"], atalhos: ["escala", "agenda", "agenda"] };
igual("escolha: ordem, escondidos e sem repetir", chaves(montarPagina(escolha, tudo)), {
  numeros: ["notificacoes", "pendencias"],
  atalhos: ["escala", "agenda"],
});

igual(
  "chave que saiu do catálogo some",
  chaves(montarPagina({ numeros: ["ajuste", "reservas"], atalhos: ["nao-existe"] }, tudo)),
  { numeros: ["reservas"], atalhos: [] },
);

// Garçom: só Comercial e Departamento pessoal.
const garcom = (m: string) => m === "comercial" || m === "pessoal";
igual("permissão: sem Compras não vê receber nem notificações", chaves(montarPagina(null, garcom)), {
  numeros: ["reservas", "pendencias"],
  atalhos: ["agenda-geral", "agenda"],
});

igual("JSON quebrado vira padrão", lerPreferencia({ numeros: "x" }), null);
igual("JSON certo é lido", lerPreferencia({ numeros: ["reservas"], atalhos: [] }), { numeros: ["reservas"], atalhos: [] });

// ---- Barra de baixo do celular ----
const daBarra = (l: ReturnType<typeof montarBarra>) => l.map((a) => a.chave);
igual("barra: padrão", daBarra(montarBarra(null, tudo)), BARRA_PADRAO);
igual("barra: garçom sem Compras ganha o próximo permitido", daBarra(montarBarra(null, garcom)), [
  "inicio",
  "reservas",
  "escala",
  "programacao",
]);
igual("barra: escolha na ordem, sem repetir e no máximo quatro", daBarra(montarBarra(["tarefas", "inicio", "inicio", "pagar", "fichas", "escala"], tudo)), [
  "tarefas",
  "inicio",
  "pagar",
  "fichas",
]);
igual("barra: escolha com menos de quatro não é completada", daBarra(montarBarra(["escala"], tudo)), ["escala"]);
igual("barra: tira o que a pessoa não abre e o que saiu do catálogo", daBarra(montarBarra(["pendencias", "sumiu", "escala"], garcom)), ["escala"]);
igual("barra: JSON sem barra vira padrão", lerBarra({ numeros: [], atalhos: [] }), null);
igual("barra: JSON com barra é lido", lerBarra({ barra: ["inicio", 3] }), ["inicio"]);

const todos = montarBarra(["inicio", "produtos", "pendencias", "mod-compras"], tudo);
igual("ativo: raiz exata", atalhoAtivo(todos, "/admin", undefined), "inicio");
igual("ativo: Produtos só na raiz de Compras", atalhoAtivo(todos, "/admin/compras", "compras"), "produtos");
igual("ativo: tela de Pendências", atalhoAtivo(todos, "/admin/compras/pendencias", "compras"), "pendencias");
igual("ativo: outra tela de Compras marca o módulo", atalhoAtivo(todos, "/admin/compras/cotacao/1", "compras"), "mod-compras");
igual("ativo: fora de tudo, nenhum", atalhoAtivo(todos, "/admin/pessoal", "pessoal"), null);

if (falhas > 0) {
  console.log(`\n${falhas} falha(s).`);
  process.exit(1);
}
console.log("\nTudo certo.");
