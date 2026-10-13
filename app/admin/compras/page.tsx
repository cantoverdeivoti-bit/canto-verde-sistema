import { headers } from "next/headers";

import { CabecalhoDaPagina, Pagina } from "@/components/pagina";
import { guardModule } from "@/lib/auth-guard";
import { getSettings } from "@/lib/availability";
import { prisma } from "@/lib/db";
import { lerEspecificacoes } from "@/lib/especificacao";
import { formatDayMonthTime } from "@/lib/format";
import { ultimoCustoPorProduto } from "@/lib/historico";
import { mediasPorProduto } from "@/lib/qualidade";
import { pareceCelular } from "@/lib/parece-celular";

import { ImportPanel } from "./import-panel";
import { ProductsList } from "./products-list";
import { SugestoesPendentes } from "./sugestoes-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produtos — Compras" };

export default async function ProductsPage() {
  // Cadastro: fora do link de atalhos. Guarda própria, porque o layout de
  // Compras abre para ele.
  await guardModule("compras");
  const [
    products,
    categorias,
    fornecedores,
    custoPorProduto,
    qualidadePorProduto,
    sugestoes,
    settings,
    cabecalhos,
  ] = await Promise.all([
    prisma.product.findMany({
      // Só os ids: a tela desenha os nomes a partir da lista de fornecedores
      // que já vem separada, e trazer o fornecedor inteiro por produto
      // repetiria o mesmo cadastro dezenas de vezes na resposta.
      include: { suppliers: { select: { supplierId: true } } },
      // Categoria primeiro, na ordem do mercado — é como a lista de compras
      // vai sair. Produto sem categoria cai no fim, que é onde ele pede
      // atenção.
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
    }),
    // Só id e nome: o seletor de categoria de cada linha não precisa de mais,
    // e as contagens são assunto da tela de Categorias.
    prisma.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    // Só os ativos: vincular um item a um fornecedor desativado seria
    // cadastrar trabalho para a cotação ignorar depois.
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, compraNoAtacado: true },
    }),
    // O que a casa pagou da última vez, por produto. Sem lista de ids porque
    // esta tela é o catálogo inteiro.
    ultimoCustoPorProduto(),
    // A média das estrelas de qualidade de cada produto avaliado.
    mediasPorProduto(),
    // O que o estoquista achou na prateleira e não estava no cadastro.
    // Só o pendente: recusado fica no banco como registro, não como tela.
    prisma.contagemProdutoNovo.findMany({
      where: { status: "PENDENTE" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        nome: true,
        unit: true,
        categoryId: true,
        quantidade: true,
        createdAt: true,
        contagem: {
          select: { responsavel: { select: { name: true, username: true } } },
        },
      },
    }),
    getSettings(),
    headers(),
  ]);

  return (
    <Pagina largura="larga">
      <CabecalhoDaPagina titulo="Produtos" />

      {/* Antes da grade porque é decisão pendente, e decisão pendente não
          espera embaixo de mil e quinhentas linhas. Some sozinha quando não
          há nada. */}
      {sugestoes.length > 0 && (
        <SugestoesPendentes
          categorias={categorias}
          // A página já carrega o catálogo inteiro: o cotejo de nome parecido
          // não custa consulta nova. Vai com `isActive` porque o parecido que
          // mais importa é justamente o desativado.
          catalogo={products.map((p) => ({
            id: p.id,
            name: p.name,
            isActive: p.isActive,
          }))}
          sugestoes={sugestoes.map((s) => ({
            id: s.id,
            nome: s.nome,
            unit: s.unit,
            categoryId: s.categoryId,
            quantidade: s.quantidade.toNumber(),
            // Formatado aqui, com o fuso da casa, pela mesma razão da lista de
            // contagens: o relógio do navegador do dono não é o do servidor.
            contadoEmTexto: formatDayMonthTime(
              s.createdAt,
              settings.capacity.timezone,
            ),
            responsavel:
              s.contagem.responsavel?.name ??
              s.contagem.responsavel?.username ??
              null,
          }))}
        />
      )}

      {/* Decimal do Prisma não atravessa a fronteira do servidor para o
          cliente: vira número aqui, campo a campo, como as outras telas de
          configuração já fazem em vez de espalhar a linha inteira. */}
      <ProductsList
        telaGrandeNoServidor={!pareceCelular(cabecalhos)}
        categorias={categorias}
        // O atacado leva a marca no nome: nos selects de exclusivo e de
        // vínculo, é o que diz que ali ninguém vai digitar preço.
        fornecedores={fornecedores.map((f) => ({
          id: f.id,
          name: f.compraNoAtacado ? `${f.name} (atacado)` : f.name,
        }))}
        planilha={<ImportPanel />}
        items={products.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          preferredBrands: p.preferredBrands,
          acceptsSimilarBrand: p.acceptsSimilarBrand,
          avaliarQualidade: p.avaliarQualidade,
          qualidade: qualidadePorProduto.get(p.id) ?? null,
          especificacoes: lerEspecificacoes(p.especificacoes),
          categoryId: p.categoryId,
          unit: p.unit,
          currentStock: p.currentStock.toNumber(),
          minStock: p.minStock === null ? null : p.minStock.toNumber(),
          idealStock: p.idealStock === null ? null : p.idealStock.toNumber(),
          lotSize: p.lotSize === null ? null : p.lotSize.toNumber(),
          isActive: p.isActive,
          supplierIds: p.suppliers.map((s) => s.supplierId),
          exclusiveSupplierId: p.exclusiveSupplierId,
          ultimoCusto: custoPorProduto.get(p.id) ?? null,
        }))}
      />
    </Pagina>
  );
}
