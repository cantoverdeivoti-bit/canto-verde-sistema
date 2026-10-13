-- AlterTable
ALTER TABLE "configuracao_pessoal" ADD COLUMN     "metaCmo" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "faturamentos_do_mes" (
    "mes" VARCHAR(7) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faturamentos_do_mes_pkey" PRIMARY KEY ("mes")
);
