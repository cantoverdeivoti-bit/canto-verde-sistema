-- O ideal de cada produto por Requisição (fornecedor + dia da semana), o
-- pedido que lembra de qual Requisição nasceu, e o ideal que o estoquista
-- sugere para o dono aprovar.

-- AlterTable
ALTER TABLE "lista_compra_itens" ADD COLUMN     "idealStock" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "pedidos_compra" ADD COLUMN     "listaCompraId" INTEGER;

-- CreateTable
CREATE TABLE "sugestoes_ideal_requisicao" (
    "id" SERIAL NOT NULL,
    "listaId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "contagemId" INTEGER,
    "idealAntes" DECIMAL(10,3),
    "idealSugerido" DECIMAL(10,3) NOT NULL,
    "motivo" TEXT,
    "status" "ProdutoNovoStatus" NOT NULL DEFAULT 'PENDENTE',
    "decididoEm" TIMESTAMP(3),
    "decididoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sugestoes_ideal_requisicao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sugestoes_ideal_requisicao_status_idx" ON "sugestoes_ideal_requisicao"("status");

-- CreateIndex
CREATE INDEX "sugestoes_ideal_requisicao_listaId_produtoId_idx" ON "sugestoes_ideal_requisicao"("listaId", "produtoId");

-- CreateIndex
CREATE INDEX "pedidos_compra_listaCompraId_idx" ON "pedidos_compra"("listaCompraId");

-- AddForeignKey
ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_listaCompraId_fkey" FOREIGN KEY ("listaCompraId") REFERENCES "listas_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_ideal_requisicao" ADD CONSTRAINT "sugestoes_ideal_requisicao_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_ideal_requisicao" ADD CONSTRAINT "sugestoes_ideal_requisicao_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_ideal_requisicao" ADD CONSTRAINT "sugestoes_ideal_requisicao_contagemId_fkey" FOREIGN KEY ("contagemId") REFERENCES "contagens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sugestoes_ideal_requisicao" ADD CONSTRAINT "sugestoes_ideal_requisicao_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
