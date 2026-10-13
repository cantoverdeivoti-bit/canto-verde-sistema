-- Cotação: da contagem na prateleira ao pedido por fornecedor.
--
-- As tabelas já existiam no banco de produção quando esta migration foi
-- escrita, aplicadas por `prisma db push` durante o desenvolvimento. O arquivo
-- existe para que um ambiente novo (ou um `migrate deploy` limpo) chegue ao
-- mesmo estado, e o histórico volte a descrever o banco inteiro.

-- CreateEnum
CREATE TYPE "CotacaoStatus" AS ENUM ('CONTANDO', 'ABERTA', 'RESPONDENDO', 'FECHADA', 'APROVADA');

-- CreateEnum
CREATE TYPE "PedidoCompraStatus" AS ENUM ('CRIADO', 'ENVIADO', 'ENTREGUE', 'PARCIAL_ENTREGUE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "CotacaoFornecedorStatus" AS ENUM ('ENVIADA', 'RESPONDIDA', 'RECUSADA', 'EXPIRADA');

-- CreateTable
CREATE TABLE "cotacoes" (
    "id" SERIAL NOT NULL,
    "estatus" "CotacaoStatus" NOT NULL DEFAULT 'CONTANDO',
    "dataInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFechamento" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contagens" (
    "id" SERIAL NOT NULL,
    "cotacaoId" INTEGER NOT NULL,
    "dataContagem" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contagem_itens" (
    "id" SERIAL NOT NULL,
    "contagemId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "quantidadeContada" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contagem_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotacao_itens" (
    "id" SERIAL NOT NULL,
    "cotacaoId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "categoryId" INTEGER,
    "quantidadeContada" DECIMAL(10,3) NOT NULL,
    "quantidadeSolicitada" DECIMAL(10,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotacao_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotacao_fornecedores" (
    "id" SERIAL NOT NULL,
    "cotacaoId" INTEGER NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "estatus" "CotacaoFornecedorStatus" NOT NULL DEFAULT 'ENVIADA',
    "dataEnvio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataRespostaRecebida" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotacao_fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precos" (
    "id" SERIAL NOT NULL,
    "cotacaoItemId" INTEGER NOT NULL,
    "cotacaoFornecedorId" INTEGER NOT NULL,
    "precoUnitario" DECIMAL(10,2) NOT NULL,
    "quantidadeSolicitada" DECIMAL(10,3) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "prazoEntregaDias" INTEGER,
    "observacoes" TEXT,
    "aprovado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "precos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedidos_compra" (
    "id" SERIAL NOT NULL,
    "cotacaoId" INTEGER NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "estatus" "PedidoCompraStatus" NOT NULL DEFAULT 'CRIADO',
    "precoTotal" DECIMAL(10,2) NOT NULL,
    "dataPronta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataEnvio" TIMESTAMP(3),
    "dataEntregaPrevista" TIMESTAMP(3),
    "dataEntregaReal" TIMESTAMP(3),
    "entregaConfirmada" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedidos_compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pedido_compra_itens" (
    "id" SERIAL NOT NULL,
    "pedidoCompraId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "quantidadeSolicitada" DECIMAL(10,3) NOT NULL,
    "quantidadeRecebida" DECIMAL(10,3),
    "precoUnitario" DECIMAL(10,2) NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pedido_compra_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_precos_compra" (
    "id" SERIAL NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "precoUnitario" DECIMAL(10,2) NOT NULL,
    "prazoEntregaDias" INTEGER,
    "dataCompra" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_precos_compra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cotacoes_estatus_idx" ON "cotacoes"("estatus");

-- CreateIndex
CREATE UNIQUE INDEX "contagens_cotacaoId_key" ON "contagens"("cotacaoId");

-- CreateIndex
CREATE INDEX "contagem_itens_produtoId_idx" ON "contagem_itens"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "contagem_itens_contagemId_produtoId_key" ON "contagem_itens"("contagemId", "produtoId");

-- CreateIndex
CREATE INDEX "cotacao_itens_produtoId_idx" ON "cotacao_itens"("produtoId");

-- CreateIndex
CREATE INDEX "cotacao_itens_categoryId_idx" ON "cotacao_itens"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "cotacao_itens_cotacaoId_produtoId_key" ON "cotacao_itens"("cotacaoId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "cotacao_fornecedores_token_key" ON "cotacao_fornecedores"("token");

-- CreateIndex
CREATE INDEX "cotacao_fornecedores_fornecedorId_idx" ON "cotacao_fornecedores"("fornecedorId");

-- CreateIndex
CREATE INDEX "cotacao_fornecedores_token_idx" ON "cotacao_fornecedores"("token");

-- CreateIndex
CREATE UNIQUE INDEX "cotacao_fornecedores_cotacaoId_fornecedorId_key" ON "cotacao_fornecedores"("cotacaoId", "fornecedorId");

-- CreateIndex
CREATE INDEX "precos_cotacaoFornecedorId_idx" ON "precos"("cotacaoFornecedorId");

-- CreateIndex
CREATE INDEX "precos_aprovado_idx" ON "precos"("aprovado");

-- CreateIndex
CREATE UNIQUE INDEX "precos_cotacaoItemId_cotacaoFornecedorId_key" ON "precos"("cotacaoItemId", "cotacaoFornecedorId");

-- CreateIndex
CREATE INDEX "pedidos_compra_fornecedorId_idx" ON "pedidos_compra"("fornecedorId");

-- CreateIndex
CREATE INDEX "pedidos_compra_estatus_idx" ON "pedidos_compra"("estatus");

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_compra_cotacaoId_fornecedorId_key" ON "pedidos_compra"("cotacaoId", "fornecedorId");

-- CreateIndex
CREATE INDEX "pedido_compra_itens_produtoId_idx" ON "pedido_compra_itens"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "pedido_compra_itens_pedidoCompraId_produtoId_key" ON "pedido_compra_itens"("pedidoCompraId", "produtoId");

-- CreateIndex
CREATE INDEX "historico_precos_compra_produtoId_idx" ON "historico_precos_compra"("produtoId");

-- CreateIndex
CREATE INDEX "historico_precos_compra_fornecedorId_idx" ON "historico_precos_compra"("fornecedorId");

-- CreateIndex
CREATE INDEX "historico_precos_compra_dataCompra_idx" ON "historico_precos_compra"("dataCompra");

-- AddForeignKey
ALTER TABLE "contagens" ADD CONSTRAINT "contagens_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "cotacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contagem_itens" ADD CONSTRAINT "contagem_itens_contagemId_fkey" FOREIGN KEY ("contagemId") REFERENCES "contagens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contagem_itens" ADD CONSTRAINT "contagem_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotacao_itens" ADD CONSTRAINT "cotacao_itens_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "cotacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotacao_itens" ADD CONSTRAINT "cotacao_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotacao_fornecedores" ADD CONSTRAINT "cotacao_fornecedores_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "cotacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotacao_fornecedores" ADD CONSTRAINT "cotacao_fornecedores_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precos" ADD CONSTRAINT "precos_cotacaoItemId_fkey" FOREIGN KEY ("cotacaoItemId") REFERENCES "cotacao_itens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precos" ADD CONSTRAINT "precos_cotacaoFornecedorId_fkey" FOREIGN KEY ("cotacaoFornecedorId") REFERENCES "cotacao_fornecedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "cotacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_compra_itens" ADD CONSTRAINT "pedido_compra_itens_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "pedidos_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedido_compra_itens" ADD CONSTRAINT "pedido_compra_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_precos_compra" ADD CONSTRAINT "historico_precos_compra_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_precos_compra" ADD CONSTRAINT "historico_precos_compra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

