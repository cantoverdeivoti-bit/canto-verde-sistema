-- As bonificações negociadas com fornecedores: unidades a mais, brinde,
-- desconto na nota ou crédito para um próximo pedido.

-- CreateEnum
CREATE TYPE "TipoBonificacao" AS ENUM ('UNIDADES', 'BRINDE', 'DESCONTO_NA_NOTA', 'CREDITO');

-- CreateEnum
CREATE TYPE "EstadoBonificacao" AS ENUM ('COMBINADA', 'RECEBIDA', 'NAO_VEIO', 'ABATIDA', 'CANCELADA');

-- CreateTable
CREATE TABLE "bonificacoes" (
    "id" SERIAL NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "cotacaoId" INTEGER,
    "pedidoCompraId" INTEGER,
    "tipo" "TipoBonificacao" NOT NULL,
    "produtoId" INTEGER,
    "quantidade" DECIMAL(10,3),
    "valor" DECIMAL(10,2),
    "nota" TEXT,
    "estado" "EstadoBonificacao" NOT NULL DEFAULT 'COMBINADA',
    "quantidadeRecebida" DECIMAL(10,3),
    "estoqueSomado" BOOLEAN NOT NULL DEFAULT false,
    "entradaSemPedidoId" INTEGER,
    "recebidaEm" TIMESTAMP(3),
    "resolvidaEm" TIMESTAMP(3),
    "resolvidaPorId" INTEGER,
    "criadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bonificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bonificacoes_fornecedorId_idx" ON "bonificacoes"("fornecedorId");

-- CreateIndex
CREATE INDEX "bonificacoes_pedidoCompraId_idx" ON "bonificacoes"("pedidoCompraId");

-- CreateIndex
CREATE INDEX "bonificacoes_cotacaoId_fornecedorId_idx" ON "bonificacoes"("cotacaoId", "fornecedorId");

-- AddForeignKey
ALTER TABLE "bonificacoes" ADD CONSTRAINT "bonificacoes_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonificacoes" ADD CONSTRAINT "bonificacoes_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "cotacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonificacoes" ADD CONSTRAINT "bonificacoes_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "pedidos_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "bonificacoes_entradaSemPedidoId_idx" ON "bonificacoes"("entradaSemPedidoId");

-- AddForeignKey
ALTER TABLE "bonificacoes" ADD CONSTRAINT "bonificacoes_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonificacoes" ADD CONSTRAINT "bonificacoes_entradaSemPedidoId_fkey" FOREIGN KEY ("entradaSemPedidoId") REFERENCES "pedidos_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
