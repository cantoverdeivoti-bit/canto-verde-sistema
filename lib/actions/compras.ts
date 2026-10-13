"use server";

import { revalidatePath } from "next/cache";

import { requireModule } from "@/lib/auth-guard";
import { formatPhone } from "@/lib/format";
import { prisma } from "@/lib/db";
import { limparContadores } from "@/lib/contadores";
import { enviarRelatorioAgora } from "@/lib/relatorio-envio";
import { novoToken } from "@/lib/token";
import {
  categorySchema,
  cotacaoSettingsSchema,
  ofertaAutorizadaSchema,
  produtoNovoSchema,
  productSchema,
  relatorioAgendadoSchema,
  supplierSchema,
} from "@/lib/validations";
import { z } from "zod";

export type ComprasResult = { ok: boolean; message?: string };
/** O `saveProduct` devolve o id quando cria: a tela abre o cadastro completo dele. */
export type ProdutoSalvo = ComprasResult & {
  id?: number;
  /** Os fornecedores vinculados agora, pela categoria. Ausente = nada mudou. */
  vinculados?: number[];
};

/**
 * A primeira reclamação do Zod, com o nome do campo quando ela não o diz.
 *
 * Os `error:` escritos à mão são frases inteiras — "Informe o nome do
 * fornecedor" — e falam por si. Os que o Zod gera sozinho são "Invalid
 * input", que numa tela de doze campos manda a pessoa caçar qual. O `path`
 * sempre esteve ali; só não estava sendo lido.
 */
function firstError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Dados inválidos.";

  const campo = issue.path.join(".");
  const generica = /^invalid/i.test(issue.message);
  return campo && generica ? `${issue.message} (${campo})` : issue.message;
}

/**
 * P2002 é violação de índice único.
 *
 * Checado pelo formato porque o adaptador de driver do Prisma 7 não devolve a
 * classe de erro do Prisma — só um objeto com `code`. Testar por `instanceof`
 * aqui passaria batido e a pessoa veria "erro inesperado" no lugar da causa.
 */
function eDuplicado(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/** Uma lista de ids vinda do cliente, que é palpite até o banco confirmar. */
const listaDeIds = z.array(z.coerce.number().int().positive()).max(500);

// Layout-scoped: as duas telas do módulo mostram contagens uma da outra, e
// o cadastro de produto vai alimentar a cotação. Revalidar a subárvore inteira
// é mais barato que enumerar caminhos que vão mudar.
function revalidateCompras() {
  revalidatePath("/admin/compras", "layout");
  limparContadores();
}

// ---------------------------------------------------------------------------
// Fornecedores
// ---------------------------------------------------------------------------

export async function saveSupplier(
  id: number | null,
  raw: unknown,
): Promise<ComprasResult> {
  await requireModule("compras");

  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  // As categorias não são coluna do fornecedor: são linhas de ligação, e
  // saem do objeto antes dele chegar ao Prisma.
  const { categoryIds, ...dados } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const supplier =
        id === null
          ? await tx.supplier.create({ data: dados, select: { id: true } })
          : await tx.supplier.update({
              where: { id },
              data: dados,
              select: { id: true },
            });

      // Apaga e recria em vez de comparar: a lista tem no máximo algumas
      // dezenas de linhas, e o diff custaria mais leitura do que a escrita
      // inteira. O que a tela mandou é o estado final, ponto.
      await tx.supplierCategory.deleteMany({
        where: { supplierId: supplier.id },
      });
      if (categoryIds.length > 0) {
        await tx.supplierCategory.createMany({
          data: categoryIds.map((categoryId) => ({
            supplierId: supplier.id,
            categoryId,
          })),
          skipDuplicates: true,
        });
      }
    });
  } catch (error) {
    console.error("[saveSupplier] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente novamente." };
  }

  revalidateCompras();
  return { ok: true };
}

/**
 * Um fornecedor inteiro, para um painel de edição fora da tela de cadastro.
 *
 * INTEIRO é o ponto, e não conveniência. `saveSupplier` manda `parsed.data`
 * completo ao Prisma: um painel que conhecesse só metade dos campos apagaria
 * a outra metade — prazo, condição de pagamento — ao salvar o nome.
 * É a mesma armadilha que `produtoParaCorrigir` existe para desarmar do lado
 * dos produtos, e ela é silenciosa: o estrago só aparece semanas depois.
 *
 * Tudo texto, porque campo é texto, e é assim que o formulário do cadastro já
 * segura os mesmos dados.
 */
export type FornecedorParaEditar = {
  name: string;
  /** Como a casa chama ele. Vazio = as telas de compra usam a razão social. */
  apelido: string;
  contactName: string;
  phone: string;
  deliveryDays: string;
  deliveryWeekdays: string;
  paymentTerms: string;
  minOrder: string;
  notes: string;
  isActive: boolean;
  categoryIds: number[];
};

export async function fornecedorParaEditar(
  supplierId: number,
): Promise<
  | { ok: true; data: FornecedorParaEditar }
  | { ok: false; message: string }
> {
  await requireModule("compras");

  const s = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: { categories: { select: { categoryId: true } } },
  });

  if (!s) return { ok: false, message: "Fornecedor não encontrado." };

  return {
    ok: true,
    data: {
      name: s.name,
      apelido: s.apelido ?? "",
      contactName: s.contactName ?? "",
      // Formatado como o cadastro formata, e não o "+5551…" cru do banco:
      // o painel é para ler e corrigir, e `normalizePhone` aceita os dois de
      // volta. Duas grafias do mesmo telefone nas duas telas seriam duas
      // formas de ele achar que o número está errado.
      phone: s.phone ? formatPhone(s.phone) : "",
      deliveryDays: s.deliveryDays === null ? "" : String(s.deliveryDays),
      deliveryWeekdays: s.deliveryWeekdays ?? "",
      paymentTerms: s.paymentTerms ?? "",
      // Vírgula, como ele digita e como o resto das telas mostram.
      minOrder: s.minOrder === null ? "" : String(s.minOrder).replace(".", ","),
      notes: s.notes ?? "",
      isActive: s.isActive,
      categoryIds: s.categories.map((c) => c.categoryId),
    },
  };
}

/**
 * Desativa em vez de apagar. Um fornecedor some da lista de cotação mas
 * continua existindo — a cotação do mês passado precisa saber de quem era
 * aquele preço, e apagar reescreveria o histórico.
 */
export async function setSupplierActive(
  id: number,
  isActive: boolean,
): Promise<ComprasResult> {
  await requireModule("compras");
  await prisma.supplier.update({ where: { id }, data: { isActive } });
  revalidateCompras();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------

/**
 * `estoqueLido`: o estoque que a tela tinha quando o produto foi aberto.
 * Igual ao que chega, ninguém mexeu no número, e ele NÃO é gravado — a tela
 * pode estar aberta há horas, e nesse meio tempo um recebimento ou uma
 * contagem mudou o estoque de verdade. Gravar o número velho por cima apagava
 * essa entrada a cada nome ou marca editados. Mexido, grava: é decisão de
 * quem corrigiu.
 */
export async function saveProduct(
  id: number | null,
  raw: unknown,
  estoqueLido?: string,
  /**
   * Falso na gravação automática da lista de Produtos: a linha já está na
   * tela como a pessoa digitou, e revalidar devolvia o catálogo inteiro a
   * cada pausa na digitação. As outras telas buscam de novo ao abrir.
   */
  atualizarTela = true,
): Promise<ProdutoSalvo> {
  await requireModule("compras");

  const parsed = productSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const lido = estoqueLido === undefined ? NaN : Number(estoqueLido.replace(",", ".") || "0");
  const { currentStock, ...resto } = parsed.data;
  const intocado = id !== null && lido === currentStock;

  let criado: number | undefined;
  let vinculados: number[] | undefined;
  try {
    // A categoria de antes, para saber se ela mudou agora (ver `vincularPelaCategoria`).
    const antes =
      id !== null && parsed.data.categoryId != null
        ? await prisma.product.findUnique({ where: { id }, select: { categoryId: true } })
        : null;
    if (id === null) criado = (await prisma.product.create({ data: parsed.data, select: { id: true } })).id;
    else await prisma.product.update({ where: { id }, data: intocado ? resto : parsed.data });
    const produtoId = criado ?? id!;
    const categoria = parsed.data.categoryId ?? null;
    if (categoria !== null && (criado !== undefined || antes?.categoryId !== categoria)) {
      vinculados = await vincularPelaCategoria(produtoId, categoria);
    }
  } catch (error) {
    // Aqui só há um índice único: o código. Dizer qual campo é o problema
    // poupa a pessoa de adivinhar olhando sete campos.
    if (eDuplicado(error)) {
      return { ok: false, message: "Já existe um produto com esse código." };
    }
    console.error("[saveProduct] falha:", error);
    return { ok: false, message: "Não foi possível salvar. Tente novamente." };
  }

  if (atualizarTela || id === null) revalidateCompras();
  return { ok: true, id: criado, vinculados };
}

/**
 * Produto que ganhou categoria (ao nascer, ou trocando de uma para outra) e
 * não tem fornecedor nenhum: passa a ter todos os da categoria, vinculados de
 * verdade, a pedido do dono. Ficam à vista em "Fornecedores vinculados", e
 * cada um pode sair depois.
 *
 * Só quando não há vínculo nem exclusivo: quem já escolheu à mão não perde a
 * escolha por trocar a categoria. E só na troca, nunca a cada gravação: os
 * produtos antigos sem vínculo continuam como estavam até alguém mexer na
 * categoria deles. Devolve os ids vinculados, ou nada quando não mexeu.
 */
async function vincularPelaCategoria(produtoId: number, categoryId: number): Promise<number[] | undefined> {
  const produto = await prisma.product.findUnique({
    where: { id: produtoId },
    select: { exclusiveSupplierId: true, _count: { select: { suppliers: true } } },
  });
  if (!produto || produto.exclusiveSupplierId !== null || produto._count.suppliers > 0) return undefined;
  const daCategoria = await prisma.supplierCategory.findMany({
    where: { categoryId, supplier: { isActive: true } },
    select: { supplierId: true },
  });
  if (daCategoria.length === 0) return undefined;
  await prisma.productSupplier.createMany({
    data: daCategoria.map((c) => ({ productId: produtoId, supplierId: c.supplierId })),
    skipDuplicates: true,
  });
  return daCategoria.map((c) => c.supplierId);
}

/** Mesma razão do fornecedor: o histórico de cotação referencia o produto. */
export async function setProductActive(
  id: number,
  isActive: boolean,
): Promise<ComprasResult> {
  await requireModule("compras");
  await prisma.product.update({ where: { id }, data: { isActive } });
  revalidateCompras();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Ações em massa
//
// A grade edita um item. Estas edita os marcados, que é o que a lista nova do
// fornecedor pede: chegou a tabela do mês, vinte itens saíram de linha, e
// desativar um por um é o que faz ninguém manter o cadastro.
// ---------------------------------------------------------------------------

export async function setProductsActive(
  ids: number[],
  isActive: boolean,
): Promise<ComprasResult> {
  await requireModule("compras");

  const parsed = listaDeIds.safeParse(ids);
  if (!parsed.success || parsed.data.length === 0) {
    return { ok: false, message: "Selecione ao menos um produto." };
  }

  await prisma.product.updateMany({
    where: { id: { in: parsed.data } },
    data: { isActive },
  });

  revalidateCompras();
  return { ok: true };
}

/**
 * Joga os marcados numa categoria de uma vez.
 *
 * É o caminho rápido de arrumar o catálogo depois de uma importação, onde os
 * itens chegam sem categoria: marca os dez que são carne, escolhe carne,
 * pronto. `null` tira a categoria em vez de trocar.
 */
export async function setProductsCategory(
  ids: number[],
  categoryId: number | null,
): Promise<ComprasResult> {
  await requireModule("compras");

  const parsed = listaDeIds.safeParse(ids);
  if (!parsed.success || parsed.data.length === 0) {
    return { ok: false, message: "Selecione ao menos um produto." };
  }

  try {
    await prisma.product.updateMany({
      where: { id: { in: parsed.data } },
      data: { categoryId },
    });
  } catch (error) {
    console.error("[setProductsCategory] falha:", error);
    return { ok: false, message: "Não consegui mudar a categoria." };
  }

  revalidateCompras();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Quem vende cada item
// ---------------------------------------------------------------------------

/**
 * Substitui a lista de fornecedores de um produto pela que a tela mandou.
 *
 * Complementa a categoria, não a substitui: a categoria já responde "quem
 * vende hortifrúti", e este vínculo é para o caso em que ela erra — o item
 * que só uma distribuidora tem, ou o que aquele fornecedor não trabalha
 * apesar de atender a categoria.
 */
export async function setProductSuppliers(
  productId: number,
  supplierIds: number[],
): Promise<ComprasResult> {
  await requireModule("compras");

  const ids = listaDeIds.safeParse(supplierIds);
  if (!ids.success) return { ok: false, message: "Seleção inválida." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.productSupplier.deleteMany({ where: { productId } });
      if (ids.data.length > 0) {
        await tx.productSupplier.createMany({
          data: ids.data.map((supplierId) => ({ productId, supplierId })),
          skipDuplicates: true,
        });
      }
    });
  } catch (error) {
    console.error("[setProductSuppliers] falha:", error);
    return { ok: false, message: "Não consegui salvar os fornecedores." };
  }

  revalidateCompras();
  return { ok: true };
}

/**
 * Liga ou desliga UM produto de UM fornecedor — o mesmo vínculo de
 * `setProductSuppliers`, visto do lado do fornecedor.
 *
 * Produto exclusivo de outro fornecedor não aceita vínculo: exclusivo quer
 * dizer que só aquele vende, e o vínculo largo ao lado dele seria mentira.
 * A saída é mudar o exclusivo no cadastro do produto.
 */
export async function vincularProdutoAoFornecedor(
  supplierId: number,
  productId: number,
  vincular: boolean,
): Promise<ComprasResult> {
  await requireModule("compras");
  if (!Number.isInteger(supplierId) || !Number.isInteger(productId)) {
    return { ok: false, message: "Seleção inválida." };
  }

  try {
    if (vincular) {
      const produto = await prisma.product.findUnique({
        where: { id: productId },
        select: { exclusiveSupplier: { select: { id: true, name: true, apelido: true } } },
      });
      if (!produto) return { ok: false, message: "Produto não encontrado." };
      const exclusivo = produto.exclusiveSupplier;
      if (exclusivo && exclusivo.id !== supplierId) {
        return {
          ok: false,
          message: `Este produto é exclusivo de ${exclusivo.apelido ?? exclusivo.name}. Para vincular outro fornecedor, tire o exclusivo em Produtos.`,
        };
      }
      await prisma.productSupplier.createMany({
        data: [{ productId, supplierId }],
        skipDuplicates: true,
      });
    } else {
      await prisma.productSupplier.deleteMany({ where: { productId, supplierId } });
    }
  } catch (error) {
    console.error("[vincularProdutoAoFornecedor] falha:", error);
    return { ok: false, message: "Não consegui salvar o vínculo." };
  }

  revalidateCompras();
  return { ok: true };
}

/**
 * Marcar (ou desmarcar) de quem este produto é exclusivo.
 *
 * Só pode haver um: marcar substitui o que já estava vinculado, porque o
 * vínculo largo de `setProductSuppliers` ("quem mais vende isso") não faz
 * sentido ao lado de um único fornecedor obrigatório. Desmarcar não traz os
 * vínculos antigos de volta — a lista some, e quem quiser vincula de novo.
 */
export async function setExclusiveSupplier(
  productId: number,
  supplierId: number | null,
): Promise<ComprasResult> {
  await requireModule("compras");

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { exclusiveSupplierId: supplierId },
      });
      if (supplierId !== null) {
        await tx.productSupplier.deleteMany({ where: { productId } });
      }
    });
  } catch (error) {
    console.error("[setExclusiveSupplier] falha:", error);
    return { ok: false, message: "Não consegui salvar o fornecedor exclusivo." };
  }

  revalidateCompras();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export async function saveCategory(
  id: number | null,
  raw: unknown,
): Promise<ComprasResult> {
  await requireModule("compras");

  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  try {
    if (id === null) await prisma.category.create({ data: parsed.data });
    else await prisma.category.update({ where: { id }, data: parsed.data });
  } catch (error) {
    if (eDuplicado(error)) {
      return { ok: false, message: "Já existe uma categoria com esse nome." };
    }
    console.error("[saveCategory] falha:", error);
    return { ok: false, message: "Não foi possível salvar a categoria." };
  }

  revalidateCompras();
  return { ok: true };
}

/**
 * Apaga de verdade — e é a única coisa deste módulo que se apaga.
 *
 * Produto e fornecedor são desativados porque a cotação de ontem precisa
 * saber de quem era aquele preço. Categoria não entra nessa conta: ela é o
 * rótulo da gaveta, não o que estava dentro. Quem apaga fica com os produtos
 * sem categoria, e a chave estrangeira cuida disso sozinha — os itens
 * continuam lá, esperando ser guardados de novo.
 */
export async function deleteCategory(id: number): Promise<ComprasResult> {
  await requireModule("compras");

  // Categoria com produto não se apaga: os produtos ficariam sem categoria,
  // fora da ordem da lista de compras e sem fornecedor que os cote. Primeiro
  // migra, depois apaga. A regra mora aqui, e não só na tela, porque ação de
  // servidor é endpoint — a tela esconder o botão não impede nada.
  const produtos = await prisma.product.count({ where: { categoryId: id } });
  if (produtos > 0) {
    return {
      ok: false,
      message: `Esta categoria tem ${produtos === 1 ? "1 produto" : `${produtos} produtos`}. Migre os produtos para outra categoria antes de apagar.`,
    };
  }

  try {
    await prisma.category.delete({ where: { id } });
  } catch (error) {
    console.error("[deleteCategory] falha:", error);
    return { ok: false, message: "Não consegui apagar a categoria." };
  }

  revalidateCompras();
  return { ok: true };
}

/**
 * Leva todos os produtos de uma categoria para outra — ativos e desativados.
 *
 * É o que abre caminho para apagar uma categoria, e serve também para juntar
 * duas que eram a mesma coisa ("Mat limpeza" e "Limpeza"). Um `updateMany`
 * só: ou vão todos, ou nenhum.
 */
export async function migrarProdutosDaCategoria(
  origemId: number,
  destinoId: number,
): Promise<ComprasResult> {
  await requireModule("compras");
  if (!Number.isInteger(origemId) || !Number.isInteger(destinoId)) {
    return { ok: false, message: "Escolha a categoria de destino." };
  }
  if (origemId === destinoId) {
    return { ok: false, message: "Escolha uma categoria diferente desta." };
  }
  const destino = await prisma.category.findUnique({ where: { id: destinoId }, select: { id: true } });
  if (!destino) return { ok: false, message: "A categoria de destino não existe mais." };

  try {
    const r = await prisma.product.updateMany({
      where: { categoryId: origemId },
      data: { categoryId: destinoId },
    });
    revalidateCompras();
    return {
      ok: true,
      message: r.count === 1 ? "1 produto migrado." : `${r.count} produtos migrados.`,
    };
  } catch (error) {
    console.error("[migrarProdutosDaCategoria] falha:", error);
    return { ok: false, message: "Não consegui migrar os produtos." };
  }
}

// ---------------------------------------------------------------------------
// Produtos novos vindos da contagem
// ---------------------------------------------------------------------------

/**
 * `requireModule("compras")` e não `{ configure: true }`.
 *
 * Neste módulo `configure` guarda uma coisa só — o que a casa fala com o
 * fornecedor — e o comentário de `updateCotacaoSettings` diz por quê: é
 * configuração, não cadastro. Autorizar cria um produto, e criar produto na
 * grade (`saveProduct`) pede só o módulo. Exigir mais aqui deixaria alguém
 * podendo cadastrar à mão o mesmo item que não pode aprovar.
 */

/**
 * O dono autoriza, e o produto nasce.
 *
 * A trava é a própria escrita, como em `finalizarContagem`: marca a sugestão
 * como decidida ANTES de criar o produto. Na ordem contrária, duas abas
 * criariam dois produtos e só a segunda perderia a corrida — tarde demais,
 * porque o primeiro já existe.
 *
 * O que vai para o banco passa por `productSchema`, e não pelos campos soltos:
 * a regra do que é um produto válido tem um dono só, do mesmo jeito que a
 * importação de planilha faz.
 */
export async function autorizarProdutoNovo(
  id: number,
  raw: unknown,
): Promise<ComprasResult> {
  const autor = await requireModule("compras");

  const parsed = produtoNovoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const produto = productSchema.safeParse({
    code: "",
    name: parsed.data.nome,
    description: "",
    preferredBrands: [],
    acceptsSimilarBrand: false,
    currentStock: parsed.data.quantidade,
    unit: parsed.data.unit,
    categoryId: parsed.data.categoryId,
    // Mínimo e ideal ficam vazios: são decisão de compra, e ninguém os
    // descobre olhando a prateleira uma vez. Sem eles o item não gera
    // sugestão de compra, o que é honesto — ele existe, e ainda não se sabe
    // quanto ter.
    minStock: "",
    idealStock: "",
    // Produto que acabou de nascer não tem lote: ninguém sabe ainda de quanto
    // em quanto ele se compra.
    lotSize: "",
    isActive: true,
  });
  if (!produto.success) return { ok: false, message: firstError(produto.error) };

  try {
    await prisma.$transaction(async (tx) => {
      const travou = await tx.contagemProdutoNovo.updateMany({
        where: { id, status: "PENDENTE" },
        data: {
          status: "APROVADO",
          decididoEm: new Date(),
          decididoPorId: autor.id,
        },
      });
      if (travou.count === 0) throw new Error("JA_DECIDIDO");

      const criado = await tx.product.create({ data: produto.data });
      await tx.contagemProdutoNovo.update({
        where: { id },
        data: { produtoId: criado.id },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "JA_DECIDIDO") {
      return { ok: false, message: "Esta sugestão já foi decidida." };
    }
    if (eDuplicado(error)) {
      return { ok: false, message: "Já existe um produto com esse código." };
    }
    console.error("[autorizarProdutoNovo] falha:", error);
    return { ok: false, message: "Não foi possível autorizar. Tente novamente." };
  }

  revalidateCompras();
  return { ok: true };
}

/**
 * Não era produto novo: já existia, e o estoquista não achou.
 *
 * O caso mais comum, e não uma exceção. A contagem só carrega produto ATIVO
 * das gavetas escolhidas — então tudo que foi desativado é invisível para ele,
 * e um item desativado que voltou para a prateleira parece produto novo. Sem
 * esta saída, a única resposta do dono seria recusar, e o item continuaria
 * sem poder ser comprado.
 *
 * Religa o produto e escreve o estoque contado, porque é isso que "está na
 * prateleira, com tanto" quer dizer.
 */
export async function apontarProdutoNovoPara(
  id: number,
  produtoId: number,
  quantidade: number,
): Promise<ComprasResult> {
  const autor = await requireModule("compras");

  if (!Number.isFinite(quantidade) || quantidade < 0) {
    return { ok: false, message: "Quantidade inválida." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const travou = await tx.contagemProdutoNovo.updateMany({
        where: { id, status: "PENDENTE" },
        data: {
          status: "APROVADO",
          produtoId,
          decididoEm: new Date(),
          decididoPorId: autor.id,
        },
      });
      if (travou.count === 0) throw new Error("JA_DECIDIDO");

      await tx.product.update({
        where: { id: produtoId },
        data: { isActive: true, currentStock: quantidade },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "JA_DECIDIDO") {
      return { ok: false, message: "Esta sugestão já foi decidida." };
    }
    console.error("[apontarProdutoNovoPara] falha:", error);
    return { ok: false, message: "Não foi possível apontar. Tente novamente." };
  }

  revalidateCompras();
  return { ok: true };
}

/**
 * O dono recusa.
 *
 * A linha fica, marcada. Apagar levaria junto o registro de que alguém achou
 * aquilo na prateleira — e a próxima contagem sugeriria de novo, sem ninguém
 * lembrar que já foi respondido.
 */
export async function recusarProdutoNovo(id: number): Promise<ComprasResult> {
  const autor = await requireModule("compras");

  const r = await prisma.contagemProdutoNovo.updateMany({
    where: { id, status: "PENDENTE" },
    data: {
      status: "RECUSADO",
      decididoEm: new Date(),
      decididoPorId: autor.id,
    },
  });

  if (r.count === 0) return { ok: false, message: "Esta sugestão já foi decidida." };

  revalidateCompras();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// O que o fornecedor ofereceu por conta própria
// ---------------------------------------------------------------------------

/**
 * O dono aceita a oferta, e o produto nasce já com o fornecedor vinculado.
 *
 * Irmã de `autorizarProdutoNovo`, com a mesma trava pela mesma razão: marca a
 * oferta como decidida ANTES de criar o produto, senão duas abas criam dois
 * cadastros e só a segunda descobre tarde demais.
 *
 * A diferença está no vínculo. Lá o estoquista achou uma coisa na prateleira
 * e ninguém sabe quem vende; aqui quem escreveu foi justamente quem vende, e
 * não guardar isso obrigaria o dono a repetir à mão o que a oferta já dizia.
 *
 * O estoque nasce zerado, e não com o conteúdo da embalagem dele: a casa não
 * comprou nada ainda. O ideal também fica vazio, como em `autorizarProdutoNovo`
 * — quanto ter deste item é decisão que ninguém toma no primeiro dia.
 */
export async function autorizarOfertaNova(
  id: number,
  raw: unknown,
): Promise<ComprasResult> {
  const autor = await requireModule("compras");

  const parsed = ofertaAutorizadaSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const produto = productSchema.safeParse({
    code: "",
    name: parsed.data.nome,
    description: "",
    preferredBrands: [],
    acceptsSimilarBrand: false,
    currentStock: 0,
    unit: parsed.data.unit,
    categoryId: parsed.data.categoryId,
    minStock: "",
    idealStock: "",
    // Produto que acabou de nascer não tem lote: ninguém sabe ainda de quanto
    // em quanto ele se compra.
    lotSize: "",
    isActive: true,
  });
  if (!produto.success) return { ok: false, message: firstError(produto.error) };

  try {
    await prisma.$transaction(async (tx) => {
      const oferta = await tx.cotacaoProdutoNovo.findUnique({
        where: { id },
        select: { cotacaoFornecedor: { select: { fornecedorId: true } } },
      });
      if (!oferta) throw new Error("SUMIU");

      const travou = await tx.cotacaoProdutoNovo.updateMany({
        where: { id, status: "PENDENTE" },
        data: {
          status: "APROVADO",
          decididoEm: new Date(),
          decididoPorId: autor.id,
        },
      });
      if (travou.count === 0) throw new Error("JA_DECIDIDO");

      const criado = await tx.product.create({ data: produto.data });
      await tx.cotacaoProdutoNovo.update({
        where: { id },
        data: { produtoId: criado.id },
      });
      await tx.productSupplier.create({
        data: {
          productId: criado.id,
          supplierId: oferta.cotacaoFornecedor.fornecedorId,
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SUMIU") {
      return { ok: false, message: "Esta oferta não existe mais." };
    }
    if (error instanceof Error && error.message === "JA_DECIDIDO") {
      return { ok: false, message: "Esta oferta já foi decidida." };
    }
    if (eDuplicado(error)) {
      return { ok: false, message: "Já existe um produto com esse código." };
    }
    console.error("[autorizarOfertaNova] falha:", error);
    return { ok: false, message: "Não foi possível autorizar. Tente novamente." };
  }

  revalidateCompras();
  return { ok: true };
}

/**
 * O dono dispensa a oferta.
 *
 * A linha fica, marcada. Apagar levaria junto o registro de que este
 * fornecedor já ofereceu isto — e ele ofereceria de novo na semana seguinte,
 * sem ninguém lembrar que já foi respondido.
 */
export async function recusarOfertaNova(id: number): Promise<ComprasResult> {
  const autor = await requireModule("compras");

  const r = await prisma.cotacaoProdutoNovo.updateMany({
    where: { id, status: "PENDENTE" },
    data: {
      status: "RECUSADO",
      decididoEm: new Date(),
      decididoPorId: autor.id,
    },
  });

  if (r.count === 0) return { ok: false, message: "Esta oferta já foi decidida." };

  revalidateCompras();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Configuração do módulo
// ---------------------------------------------------------------------------

/**
 * A mensagem que o fornecedor lê ao abrir o link de cotação.
 *
 * `upsert`, e não o `update({ where: { id: 1 } })` que as telas de config do
 * comercial usam: a linha é criada pela migration, mas um banco restaurado de
 * backup antigo, ou um `db push` sem a migration, deixaria a tela quebrada com
 * P2025. Criar na hora custa a mesma ida ao banco.
 *
 * `configure: true` porque isto é configuração, não cadastro — quem opera a
 * compra não escreve o que a casa fala com o fornecedor.
 */
export async function updateCotacaoSettings(raw: unknown): Promise<ComprasResult> {
  await requireModule("compras", { configure: true });

  const parsed = cotacaoSettingsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  await prisma.cotacaoSettings.upsert({
    where: { id: 1 },
    update: parsed.data,
    create: { id: 1, ...parsed.data },
  });

  revalidateCompras();
  return { ok: true };
}

/** Liga, desliga e ajusta o relatório de compras por e-mail. */
export async function salvarRelatorioAgendado(raw: unknown): Promise<ComprasResult> {
  await requireModule("compras", { configure: true });

  const parsed = relatorioAgendadoSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  await prisma.relatorioAgendado.upsert({
    where: { id: 1 },
    update: parsed.data,
    create: { id: 1, ...parsed.data },
  });
  revalidatePath("/admin/compras/configuracoes");
  return { ok: true };
}

/** "Enviar agora para testar": manda já, com o que está gravado. */
export async function enviarRelatorioDeTeste(): Promise<ComprasResult & { mensagem?: string }> {
  await requireModule("compras", { configure: true });
  try {
    const r = await enviarRelatorioAgora();
    return r.enviado ? { ok: true, mensagem: r.mensagem } : { ok: false, message: r.mensagem };
  } catch (err) {
    console.error("[enviarRelatorioDeTeste]", err);
    return { ok: false, message: "Não deu para montar o relatório agora. Tente de novo em instantes." };
  }
}

// ---------------------------------------------------------------------------
// Cadastro rápido, de dentro do pedido manual
// ---------------------------------------------------------------------------

type ComId = { ok: true; id: number } | { ok: false; message: string };

/**
 * Um fornecedor com o mínimo — nome e telefone — sem sair do pedido. O resto
 * do cadastro (categorias, prazo) continua em Fornecedores, para completar
 * depois. Passa pelo mesmo schema do cadastro inteiro.
 */
export async function cadastroRapidoFornecedor(nome: string, telefone: string): Promise<ComId> {
  await requireModule("compras", { atalho: true });
  const parsed = supplierSchema.safeParse({
    name: nome,
    apelido: "",
    contactName: "",
    phone: telefone,
    deliveryDays: "",
    deliveryWeekdays: "",
    paymentTerms: "",
    minOrder: "",
    notes: "",
    isActive: true,
    categoryIds: [],
  });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  const { categoryIds: _semGavetas, ...dados } = parsed.data;
  void _semGavetas;
  try {
    const f = await prisma.supplier.create({ data: dados, select: { id: true } });
    revalidateCompras();
    return { ok: true, id: f.id };
  } catch (error) {
    console.error("[cadastroRapidoFornecedor] falha:", error);
    return { ok: false, message: "Não foi possível cadastrar. Tente novamente." };
  }
}

/**
 * Um produto com o mínimo — nome, unidade e categoria — sem sair do pedido.
 * Já nasce ligado ao fornecedor do pedido, para aparecer como "dele" na
 * próxima busca. Estoque ideal, lote e marcas se completam em Produtos.
 */
export async function cadastroRapidoProduto(
  nome: string,
  unidade: string,
  categoriaId: number | null,
  fornecedorId: number | null,
): Promise<ComId> {
  await requireModule("compras", { atalho: true });
  const parsed = productSchema.safeParse({
    code: "",
    name: nome,
    description: "",
    preferredBrands: [],
    acceptsSimilarBrand: true,
    currentStock: 0,
    unit: unidade,
    categoryId: categoriaId,
    minStock: "",
    idealStock: "",
    lotSize: "",
    isActive: true,
  });
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  try {
    const p = await prisma.$transaction(async (tx) => {
      const criado = await tx.product.create({ data: parsed.data, select: { id: true } });
      if (fornecedorId !== null && Number.isInteger(fornecedorId) && fornecedorId > 0) {
        await tx.productSupplier.create({ data: { productId: criado.id, supplierId: fornecedorId } });
      }
      return criado;
    });
    revalidateCompras();
    return { ok: true, id: p.id };
  } catch (error) {
    console.error("[cadastroRapidoProduto] falha:", error);
    return { ok: false, message: "Não foi possível cadastrar. Tente novamente." };
  }
}

// ---------------------------------------------------------------------------
// Link de atalhos (estoquista e recebedor, sem login)
// ---------------------------------------------------------------------------

/**
 * Gera o link de atalhos — ou troca, se já existe: o código antigo para de
 * valer no próximo clique de quem estiver com ele aberto. Só quem configura
 * Compras mexe no link. O que for feito pelo link fica em nome de quem o
 * gerou.
 */
export async function gerarLinkAtalhos(): Promise<ComprasResult & { token?: string }> {
  const autor = await requireModule("compras", { configure: true });
  const token = novoToken();
  try {
    await prisma.cotacaoSettings.upsert({
      where: { id: 1 },
      create: { id: 1, atalhoToken: token, atalhoCriadoPorId: autor.id, atalhoCriadoEm: new Date() },
      update: { atalhoToken: token, atalhoCriadoPorId: autor.id, atalhoCriadoEm: new Date() },
    });
  } catch (error) {
    console.error("[gerarLinkAtalhos] falha:", error);
    return { ok: false, message: "Não foi possível gerar o link." };
  }
  revalidateCompras();
  return { ok: true, token };
}

/** Desliga o link: ninguém mais entra por ele até gerar outro. */
export async function desligarLinkAtalhos(): Promise<ComprasResult> {
  await requireModule("compras", { configure: true });
  try {
    await prisma.cotacaoSettings.updateMany({
      where: { id: 1 },
      data: { atalhoToken: null, atalhoCriadoPorId: null, atalhoCriadoEm: null },
    });
  } catch (error) {
    console.error("[desligarLinkAtalhos] falha:", error);
    return { ok: false, message: "Não foi possível desligar o link." };
  }
  revalidateCompras();
  return { ok: true };
}
