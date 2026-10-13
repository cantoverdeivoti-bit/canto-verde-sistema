-- Encomenda e delivery: a lista de preços do Receituário (VendaDaFicha),
-- os extras de cada item (embalagem, guarnição) e a marca de embalagem no insumo.

-- CreateEnum
CREATE TYPE "CanalDeVenda" AS ENUM ('ENCOMENDA', 'DELIVERY', 'ALACARTE');

-- CreateEnum
CREATE TYPE "UnidadeDeVenda" AS ENUM ('KG', 'UN', 'POTE');

-- AlterTable
ALTER TABLE "receituario_insumos" ADD COLUMN     "embalagem" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "receituario_vendas" (
    "id" SERIAL NOT NULL,
    "fichaId" INTEGER NOT NULL,
    "canal" "CanalDeVenda" NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "unidadeVenda" "UnidadeDeVenda" NOT NULL,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "precoVenda" DECIMAL(12,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "baseId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receituario_vendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receituario_vendas_extras" (
    "id" SERIAL NOT NULL,
    "vendaId" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "insumoId" INTEGER,
    "subFichaId" INTEGER,
    "quantidade" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "receituario_vendas_extras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receituario_vendas_fichaId_idx" ON "receituario_vendas"("fichaId");

-- CreateIndex
CREATE INDEX "receituario_vendas_extras_vendaId_idx" ON "receituario_vendas_extras"("vendaId");

-- CreateIndex
CREATE INDEX "receituario_vendas_extras_insumoId_idx" ON "receituario_vendas_extras"("insumoId");

-- CreateIndex
CREATE INDEX "receituario_vendas_extras_subFichaId_idx" ON "receituario_vendas_extras"("subFichaId");

-- AddForeignKey
ALTER TABLE "receituario_vendas" ADD CONSTRAINT "receituario_vendas_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "receituario_fichas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receituario_vendas" ADD CONSTRAINT "receituario_vendas_baseId_fkey" FOREIGN KEY ("baseId") REFERENCES "receituario_vendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receituario_vendas_extras" ADD CONSTRAINT "receituario_vendas_extras_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "receituario_vendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receituario_vendas_extras" ADD CONSTRAINT "receituario_vendas_extras_insumoId_fkey" FOREIGN KEY ("insumoId") REFERENCES "receituario_insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receituario_vendas_extras" ADD CONSTRAINT "receituario_vendas_extras_subFichaId_fkey" FOREIGN KEY ("subFichaId") REFERENCES "receituario_fichas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
