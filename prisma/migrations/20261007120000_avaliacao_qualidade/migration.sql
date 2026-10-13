-- Avaliação de qualidade: produtos escolhidos recebem de 1 a 5 estrelas em cada
-- entrega (de quem recebeu e do dono). Só criação: nada existente muda.
CREATE TYPE "OrigemAvaliacao" AS ENUM ('RECEBIMENTO', 'DONO');

ALTER TABLE "products" ADD COLUMN "avaliarQualidade" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "avaliacoes_qualidade" (
    "id" SERIAL NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "pedidoCompraItemId" INTEGER NOT NULL,
    "fornecedorId" INTEGER,
    "marca" TEXT,
    "origem" "OrigemAvaliacao" NOT NULL,
    "nota" INTEGER NOT NULL,
    "comentario" TEXT,
    "autorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "avaliacoes_qualidade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "avaliacoes_qualidade_produtoId_idx" ON "avaliacoes_qualidade"("produtoId");
CREATE UNIQUE INDEX "avaliacoes_qualidade_pedidoCompraItemId_origem_key" ON "avaliacoes_qualidade"("pedidoCompraItemId", "origem");

ALTER TABLE "avaliacoes_qualidade" ADD CONSTRAINT "avaliacoes_qualidade_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "avaliacoes_qualidade" ADD CONSTRAINT "avaliacoes_qualidade_pedidoCompraItemId_fkey" FOREIGN KEY ("pedidoCompraItemId") REFERENCES "pedido_compra_itens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "avaliacoes_qualidade" ADD CONSTRAINT "avaliacoes_qualidade_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "avaliacoes_qualidade" ADD CONSTRAINT "avaliacoes_qualidade_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
