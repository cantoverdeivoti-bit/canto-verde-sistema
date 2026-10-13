import { prisma } from "@/lib/db";
import { whatsappNumberLink } from "@/lib/whatsapp";

import type { CotacaoFornecedorStatus } from "@/generated/prisma/client";

/**
 * Quem pode vender o que esta cotação está comprando.
 *
 * Mora aqui porque DUAS telas fazem a mesma pergunta desde que chamar
 * fornecedor saiu de dentro da cotação e virou página própria: a de
 * fornecedores, para mandar os links, e a da cotação, que precisa das mesmas
 * colunas no mapa e do aviso de item órfão. Escrever a consulta duas vezes é
 * como as duas passam a discordar sobre quem está na rodada.
 *
 * Os candidatos vêm de duas redes, a larga e a fina: quem atende alguma
 * categoria dos itens, mais quem está vinculado item a item. E quem já foi
 * chamado nesta cotação entra mesmo que tenha sido desativado depois — o
 * preço que ele deu continua valendo para comparar.
 */

export type FornecedorDaCotacao = {
  id: number;
  /** A razão social. É o que a tela de cadastro mostra. */
  nome: string;
  /**
   * Como a casa chama ele: "Himalaia", e não "Himalaia Com. de Prod.
   * Alimentares Ltda". Nulo = nunca foi apelidado, e vale a razão social.
   *
   * A regra de onde cada um aparece: quem está COMPRANDO vê o apelido, que é
   * o que cabe numa coluna de 96px; quem está mexendo no CADASTRO vê a razão
   * social, senão não tem como conferir se é a empresa certa.
   */
  apelido: string | null;
  /** `wa.me` já montado no servidor. Nulo = fornecedor sem telefone. */
  wa: string | null;
  /** Abaixo disto ele não entrega. Nulo = nunca perguntamos. */
  minOrder: number | null;
  categorias: string[];
  chamado: {
    id: number;
    token: string;
    estatus: CotacaoFornecedorStatus;
  } | null;
  /** O pedido que a compra dele nesta cotação já virou. Nulo = ainda não. */
  pedidoId: number | null;
  /** Quantos itens desta cotação ele alcança, pela categoria ou por vínculo. */
  cobre: number;
};

/** Fornecedor ativo que nenhuma das duas redes trouxe para esta rodada. */
export type ForaDaRede = {
  id: number;
  nome: string;
  apelido: string | null;
  categorias: string[];
};

export async function fornecedoresDaCotacao(cotacaoId: number): Promise<{
  fornecedores: FornecedorDaCotacao[];
  foraDaLista: ForaDaRede[];
  categorias: { id: number; name: string }[];
  /** As gavetas dos itens desta rodada, para o painel marcar quais importam. */
  categoriasDaCotacao: number[];
  /** Categorias alcançadas por alguém ativo — a rede larga. */
  categoriasAtendidas: Set<number>;
  /** Produtos alcançados por vínculo direto — a rede fina. */
  produtosVinculados: Set<number>;
}> {
  const [itens, chamados, pedidos, categorias] = await Promise.all([
    prisma.cotacaoItem.findMany({
      where: { cotacaoId },
      select: { produtoId: true, categoryId: true },
    }),
    prisma.cotacaoFornecedor.findMany({
      where: { cotacaoId },
      select: { id: true, token: true, estatus: true, fornecedorId: true },
    }),
    prisma.pedidoCompra.findMany({
      /* Cancelado não conta: a linha continua no banco — cancelar parqueia,
         não apaga — mas o que ela representa deixou de existir. Sem o
         filtro, cancelar o pedido deixava a coluna do fornecedor travada
         para sempre e o rodapé dizendo "pedido #22" de uma compra que não
         existe mais. */
      where: { cotacaoId, estatus: { not: "CANCELADO" } },
      select: { id: true, fornecedorId: true },
    }),
    /* Todas as gavetas, e não só as desta cotação: o fornecedor ofereceu
       justamente o que a casa não estava comprando, e ele pode ser da
       prateleira que ninguém contou hoje. Não depende de nada — vai junto. */
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);

  const categoriasDaCotacao = [
    ...new Set(itens.map((i) => i.categoryId).filter((c): c is number => c !== null)),
  ];
  const productIds = itens.map((i) => i.produtoId);
  const jaChamados = chamados.map((f) => f.fornecedorId);

  /* Uma consulta só para os candidatos E os de fora da lista: todo ativo,
     mais os já chamados (mesmo desativados depois — o preço que deram
     continua valendo). A separação entre os dois grupos é feita aqui, na
     memória, pela mesma regra das duas redes. Só os campos usados. */
  const categoriasDaRodada = new Set(categoriasDaCotacao);
  const todos = await prisma.supplier.findMany({
    where: { OR: [{ id: { in: jaChamados } }, { isActive: true }] },
    select: {
      id: true,
      name: true,
      apelido: true,
      phone: true,
      minOrder: true,
      isActive: true,
      categories: { select: { categoryId: true, category: { select: { name: true } } } },
      products: { where: { productId: { in: productIds } }, select: { productId: true } },
    },
    orderBy: { name: "asc" },
  });
  const chamadosSet = new Set(jaChamados);
  const candidatos = todos.filter(
    (s) =>
      chamadosSet.has(s.id) ||
      (s.isActive &&
        (s.categories.some((c) => categoriasDaRodada.has(c.categoryId)) || s.products.length > 0)),
  );

  /* Um item está coberto se alguém ATIVO o alcança. Item que ninguém alcança
     nunca receberá preço, e dizer isso na tela evita a espera por uma
     resposta que não viria. */
  const categoriasAtendidas = new Set(
    candidatos.filter((s) => s.isActive).flatMap((s) => s.categories.map((c) => c.categoryId)),
  );
  const produtosVinculados = new Set(
    candidatos.filter((s) => s.isActive).flatMap((s) => s.products.map((p) => p.productId)),
  );

  const chamadoPor = new Map(chamados.map((f) => [f.fornecedorId, f]));
  const pedidoPor = new Map(pedidos.map((p) => [p.fornecedorId, p.id]));

  /* Quem o cadastro tem e as duas redes não trouxeram.
     O atacado que vende de tudo um pouco, e o fornecedor novo sem gaveta
     marcada, ficavam invisíveis — a saída era ir ao cadastro marcar uma
     categoria que ele talvez nem atenda, só para ele aparecer. Filtro sobre
     os candidatos, e não uma segunda cópia da regra das redes: quem já está
     na lista é exatamente quem não precisa ser vinculado. */
  const naLista = new Set(candidatos.map((s) => s.id));
  const foraBruta = todos.filter((s) => s.isActive && !naLista.has(s.id));

  return {
    fornecedores: candidatos.map((s) => {
      const chamado = chamadoPor.get(s.id);
      return {
        id: s.id,
        nome: s.name,
        apelido: s.apelido,
        wa: whatsappNumberLink(s.phone),
        minOrder: s.minOrder?.toNumber() ?? null,
        categorias: s.categories.map((c) => c.category.name),
        chamado: chamado
          ? { id: chamado.id, token: chamado.token, estatus: chamado.estatus }
          : null,
        pedidoId: pedidoPor.get(s.id) ?? null,
        cobre: (() => {
          const cats = new Set(s.categories.map((c) => c.categoryId));
          const prods = new Set(s.products.map((p) => p.productId));
          return itens.filter(
            (i) => (i.categoryId !== null && cats.has(i.categoryId)) || prods.has(i.produtoId),
          ).length;
        })(),
      };
    }),
    foraDaLista: foraBruta.map((s) => ({
      id: s.id,
      nome: s.name,
      apelido: s.apelido,
      categorias: s.categories.map((c) => c.category.name),
    })),
    categorias,
    categoriasDaCotacao,
    categoriasAtendidas,
    produtosVinculados,
  };
}
