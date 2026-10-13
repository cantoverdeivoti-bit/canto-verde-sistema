-- A nota do mercado lida pelo QR Code: a chave dela na entrada (a mesma nota
-- não entra duas vezes) e como cada item da nota vira produto da casa.

-- AlterTable
ALTER TABLE "pedidos_compra" ADD COLUMN "notaChave" VARCHAR(44);

-- CreateIndex
CREATE UNIQUE INDEX "pedidos_compra_notaChave_key" ON "pedidos_compra"("notaChave");

-- CreateTable
CREATE TABLE "vinculos_nota" (
    "id" SERIAL NOT NULL,
    "emitenteCnpj" VARCHAR(14) NOT NULL,
    "chave" VARCHAR(160) NOT NULL,
    "descricao" VARCHAR(160) NOT NULL,
    "produtoId" INTEGER,
    "fator" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vinculos_nota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vinculos_nota_produtoId_idx" ON "vinculos_nota"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "vinculos_nota_emitenteCnpj_chave_key" ON "vinculos_nota"("emitenteCnpj", "chave");

-- AddForeignKey
ALTER TABLE "vinculos_nota" ADD CONSTRAINT "vinculos_nota_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
