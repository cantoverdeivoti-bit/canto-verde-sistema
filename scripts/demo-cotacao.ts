import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "../generated/prisma/client";

/**
 * Respostas de fornecedor de MENTIRA numa cotação de verdade.
 *
 * Para ver o comparativo funcionando sem esperar sete fornecedores
 * responderem. Preenche preços verossímeis — ancorados no que a casa pagou da
 * última vez, quando há histórico — e deixa buracos de propósito: fornecedor
 * que não respondeu um item, um "sem estoque", um "não trabalho com isso". O
 * mapa só ensina alguma coisa quando tem falha nele.
 *
 * A marca de demonstração fica no TOKEN do convite, que começa sempre com
 * `dem0dem0`. Já esteve em `observacoes` do preço, e foi erro: aquele campo é
 * a observação que o fornecedor escreveu, e o comparativo a mostra — o mapa
 * inteiro ficou coberto de "DEMONSTRAÇÃO" como se os fornecedores tivessem
 * dito isso. O token não aparece em tela nenhuma, continua sendo um endereço
 * válido de 64 hex, e é por ele que `--limpar` acha o que apagar.
 *
 * Uso:
 *   npx tsx scripts/demo-cotacao.ts 12            preenche
 *   npx tsx scripts/demo-cotacao.ts 12 --limpar   desfaz
 *
 * ATENÇÃO: se estes preços forem aprovados e virarem pedido, eles entram em
 * `historicoPrecosCompra` e passam a ser a "última compra" das rodadas
 * seguintes. Aí a mentira deixa de ser reversível por este script. Use a
 * cotação de demonstração para olhar, não para comprar.
 */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

/** O prefixo que marca o convite de demonstração. Invisível em tela. */
const MARCA = "dem0dem0";

/** Quantos fornecedores respondem. Mais que isso vira tabela ilegível. */
const QUANTOS = 9;

function novoToken(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Mesmos 64 caracteres, com o prefixo por cima: 224 bits de acaso em vez
  // de 256, o que para um link de demonstração é folga de sobra.
  return MARCA + hex.slice(MARCA.length);
}

/**
 * Um gerador com semente: a mesma cotação dá sempre os mesmos preços.
 *
 * Sem isso, rodar duas vezes daria dois mapas diferentes e ninguém saberia se
 * a tela mudou ou se o acaso mudou.
 */
function aleatorio(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/** Embalagens plausíveis por unidade, para o "vendo em" não sair genérico. */
const EMBALAGEM: Record<string, { nome: string; conteudo: number }[]> = {
  UN: [
    { nome: "fardo", conteudo: 12 },
    { nome: "caixa", conteudo: 24 },
    { nome: "unidade", conteudo: 1 },
  ],
  KG: [
    { nome: "caixa", conteudo: 10 },
    { nome: "saco", conteudo: 5 },
    { nome: "quilo", conteudo: 1 },
  ],
  G: [
    { nome: "pacote", conteudo: 500 },
    { nome: "pacote", conteudo: 1000 },
  ],
  L: [
    { nome: "galão", conteudo: 5 },
    { nome: "caixa", conteudo: 12 },
  ],
  ML: [{ nome: "caixa", conteudo: 12 }],
  CX: [{ nome: "caixa", conteudo: 1 }],
  PCT: [{ nome: "fardo", conteudo: 10 }],
  MACO: [{ nome: "maço", conteudo: 1 }],
  DZ: [{ nome: "dúzia", conteudo: 1 }],
  FD: [{ nome: "fardo", conteudo: 1 }],
};

const MARCAS = ["Aurora", "Bom Sabor", "Primor", "Serrana", "Vale Verde", "Del Campo"];

/**
 * O que o fornecedor escreve na observação, quando escreve.
 *
 * Poucas linhas, e de propósito: a observação vira uma nota numerada no mapa
 * e o texto inteiro fica no rodapé. Se todo preço tivesse uma, o rodapé
 * viraria uma parede e a nota deixaria de chamar atenção — que é exatamente o
 * trabalho dela.
 */
const OBSERVACOES = [
  "Preço válido até sexta.",
  "Só entrego acima de 10 caixas deste item.",
  "Posso trocar a marca se faltar, me avise antes.",
  "Este lote vence em 60 dias.",
  "Frete por nossa conta acima de R$ 400,00.",
];

async function limpar(cotacaoId: number) {
  /* Só os convites de demonstração, achados pelo prefixo do token.
     Apagar o convite leva os preços junto, por `onDelete: Cascade` no schema
     — e leva SÓ os dele. Um fornecedor que respondeu de verdade nesta mesma
     cotação tem token sem prefixo e não é tocado. */
  const chamados = await prisma.cotacaoFornecedor.findMany({
    where: { cotacaoId, token: { startsWith: MARCA } },
    select: { id: true, fornecedor: { select: { name: true } } },
  });

  const precos = await prisma.preco.count({
    where: { cotacaoFornecedorId: { in: chamados.map((c) => c.id) } },
  });

  const apagados = await prisma.cotacaoFornecedor.deleteMany({
    where: { id: { in: chamados.map((c) => c.id) } },
  });
  const convites = apagados.count;

  const sobrou = await prisma.preco.count({
    where: { cotacaoItem: { cotacaoId } },
  });
  await prisma.cotacao.update({
    where: { id: cotacaoId },
    data: { estatus: sobrou > 0 ? "RESPONDENDO" : "ABERTA" },
  });

  console.log(`Apagados ${precos} preços de demonstração e ${convites} convites.`);
  console.log(`A cotação #${cotacaoId} voltou para ${sobrou > 0 ? "RESPONDENDO" : "ABERTA"}.`);
}

async function preencher(cotacaoId: number) {
  const cotacao = await prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    include: {
      cotacaoItens: {
        include: { produto: { select: { name: true, unit: true } } },
      },
      cotacaoFornecedores: { select: { fornecedorId: true } },
    },
  });

  if (!cotacao) throw new Error(`Cotação #${cotacaoId} não existe.`);
  if (cotacao.estatus === "APROVADA") {
    throw new Error("Esta cotação já virou pedido — não mexa nela.");
  }
  if (cotacao.cotacaoItens.length === 0) {
    throw new Error("Esta cotação não tem itens.");
  }

  const categorias = [
    ...new Set(cotacao.cotacaoItens.map((i) => i.categoryId).filter((c): c is number => c !== null)),
  ];

  /* Quem responde: os que alcançam mais ITENS desta lista, e não os que
     atendem mais gavetas.

     Ordenar por gavetas parecia certo e deu um mapa vazio: os cinco primeiros
     foram fornecedores de embalagem, que atendem duas ou três gavetas cada —
     e as gavetas deles somavam oito itens numa cotação de cento e nove. O que
     enche o comparativo é quem cobre a gaveta GRANDE, mesmo que seja uma só. */
  const candidatos = await prisma.supplier.findMany({
    where: {
      isActive: true,
      categories: { some: { categoryId: { in: categorias } } },
    },
    select: {
      id: true,
      name: true,
      deliveryDays: true,
      categories: { select: { categoryId: true } },
    },
  });

  const itensPorGaveta = new Map<number, number>();
  for (const i of cotacao.cotacaoItens) {
    if (i.categoryId === null) continue;
    itensPorGaveta.set(i.categoryId, (itensPorGaveta.get(i.categoryId) ?? 0) + 1);
  }

  /* A escolha precisa de duas coisas ao mesmo tempo, e elas puxam para lados
     opostos:

     LARGURA — alguém em cada gaveta, senão metade da lista fica com "ninguém
     respondeu" e o mapa não tem o que mostrar.

     SOBREPOSIÇÃO — mais de um no MESMO item, senão não há comparação nenhuma,
     só uma coluna por produto. Um comparativo em que cada item tem um
     candidato só não é comparativo.

     Pegar simplesmente os cinco que alcançam mais itens falha nas duas: eles
     se amontoam nas mesmas duas gavetas grandes e Bebidas fica vazia.

     A volta é por gaveta, da maior para a menor, pegando até dois de cada até
     encher a cota. A gaveta grande ganha os dois primeiros — que é onde a
     comparação importa — e as pequenas ganham pelo menos um. */
  const porTamanho = [...itensPorGaveta.entries()].sort((a, b) => b[1] - a[1]);
  const escolhidos: typeof candidatos = [];
  const jaEscolhido = new Set<number>();

  function pegar(gaveta: number, quantos: number) {
    const dessaGaveta = candidatos
      .filter((f) => !jaEscolhido.has(f.id) && f.categories.some((c) => c.categoryId === gaveta))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    for (const f of dessaGaveta.slice(0, quantos)) {
      if (escolhidos.length >= QUANTOS) return;
      escolhidos.push(f);
      jaEscolhido.add(f.id);
    }
  }

  /* Duas voltas, e a ordem entre elas é a decisão.
     Primeiro a SOBREPOSIÇÃO nas três gavetas maiores: dois fornecedores em
     cada, que é onde a comparação vale a pena e onde está a maior parte do
     dinheiro. Depois a LARGURA: um em cada gaveta que sobrou, para nenhuma
     ficar com "ninguém respondeu".

     Ao contrário, a largura come a cota inteira — são dez gavetas — e o mapa
     sai com um candidato por item, que não é comparativo nenhum. */
  for (const [gaveta] of porTamanho.slice(0, 3)) pegar(gaveta, 2);
  for (const [gaveta] of porTamanho) pegar(gaveta, 1);

  if (escolhidos.length === 0) {
    throw new Error("Nenhum fornecedor ativo atende as gavetas desta cotação.");
  }

  // A âncora: o que a casa pagou da última vez. Sem ela, os preços de
  // demonstração seriam números soltos que não dizem nada ao olhar.
  const historico = await prisma.historicoPrecosCompra.findMany({
    where: { produtoId: { in: cotacao.cotacaoItens.map((i) => i.produtoId) } },
    orderBy: { dataCompra: "desc" },
    select: { produtoId: true, precoUnitario: true },
  });
  const ultimoCusto = new Map<number, number>();
  for (const h of historico) {
    if (!ultimoCusto.has(h.produtoId)) ultimoCusto.set(h.produtoId, h.precoUnitario.toNumber());
  }

  const rnd = aleatorio(cotacaoId * 7919);
  let gravados = 0;
  let recusas = 0;

  for (const [ordem, f] of escolhidos.entries()) {
    const gavetasDele = new Set(f.categories.map((c) => c.categoryId));

    const jaChamado = cotacao.cotacaoFornecedores.some((cf) => cf.fornecedorId === f.id);
    if (jaChamado) {
      console.log(`  ${f.name}: já estava chamado, pulando.`);
      continue;
    }

    const chamado = await prisma.cotacaoFornecedor.create({
      data: {
        cotacaoId,
        fornecedorId: f.id,
        token: novoToken(),
        estatus: "RESPONDIDA",
      },
      select: { id: true },
    });

    const dele = cotacao.cotacaoItens.filter(
      (i) => i.categoryId !== null && gavetasDele.has(i.categoryId),
    );

    let doFornecedor = 0;
    for (const item of dele) {
      const sorte = rnd();

      // Um em cada oito ele simplesmente não responde — é o buraco que o
      // comparativo precisa saber desenhar.
      if (sorte < 0.12) continue;

      // Um em cada vinte ele diz por que não vai cotar.
      if (sorte < 0.17) {
        await prisma.preco.create({
          data: {
            cotacaoItemId: item.id,
            cotacaoFornecedorId: chamado.id,
            estatus: sorte < 0.145 ? "SEM_ESTOQUE" : "NAO_TRABALHA",
            precoUnitario: new Prisma.Decimal(0),
            quantidadeSolicitada: item.quantidadeSolicitada,
            subtotal: new Prisma.Decimal(0),
          },
        });
        recusas += 1;
        continue;
      }

      /* O preço, ancorado no histórico quando existe.
         Cada fornecedor tem um "jeito" fixo — o primeiro é o mais caro, o
         último o mais barato —, e por cima disso um ruído por item. Sem o
         jeito fixo, o mapa não teria um vencedor claro para olhar; sem o
         ruído, teria o mesmo vencedor em todas as linhas, o que também não
         ensina nada. */
      const base = ultimoCusto.get(item.produtoId) ?? 2 + rnd() * 28;
      const jeito = 1.12 - ordem * 0.05;
      const ruido = 0.9 + rnd() * 0.22;
      const unitario = Math.max(0.05, base * jeito * ruido);

      const opcoes = EMBALAGEM[item.produto.unit] ?? [{ nome: "unidade", conteudo: 1 }];
      const emb = opcoes[Math.floor(rnd() * opcoes.length)];

      const precoUnitario = new Prisma.Decimal(unitario.toFixed(2));
      const conteudo = new Prisma.Decimal(emb.conteudo);
      // O fornecedor digita o preço da EMBALAGEM; o unitário é conta do
      // sistema. Aqui é ao contrário, então a volta tem que fechar.
      const precoEmbalagem = precoUnitario.times(conteudo).toDecimalPlaces(2);

      await prisma.preco.create({
        data: {
          cotacaoItemId: item.id,
          cotacaoFornecedorId: chamado.id,
          estatus: "OFERTADO",
          precoUnitario,
          embalagem: emb.nome,
          conteudo,
          precoEmbalagem,
          quantidadeSolicitada: item.quantidadeSolicitada,
          subtotal: precoUnitario.times(item.quantidadeSolicitada),
          prazoEntregaDias: f.deliveryDays ?? 1 + Math.floor(rnd() * 5),
          marca: MARCAS[Math.floor(rnd() * MARCAS.length)],
          // Um em cada seis escreve alguma coisa. Ver a nota numerada no mapa
          // e o texto no rodapé é metade do que esta demonstração existe para
          // mostrar; com observação em todos, nenhuma chamaria atenção.
          observacoes:
            rnd() < 0.16 ? OBSERVACOES[Math.floor(rnd() * OBSERVACOES.length)] : null,
        },
      });
      gravados += 1;
      doFornecedor += 1;
    }

    console.log(`  ${f.name}: ${doFornecedor} preços em ${dele.length} itens que ele atende.`);
  }

  await prisma.cotacao.update({
    where: { id: cotacaoId },
    data: { estatus: "RESPONDENDO" },
  });

  console.log(`\n${gravados} preços e ${recusas} recusas de demonstração na cotação #${cotacaoId}.`);
  console.log(`Para desfazer: npx tsx scripts/demo-cotacao.ts ${cotacaoId} --limpar`);
}

async function main() {
  const id = Number(process.argv[2]);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("Diga o número da cotação: npx tsx scripts/demo-cotacao.ts 12");
  }
  if (process.argv.includes("--limpar")) await limpar(id);
  else await preencher(id);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
