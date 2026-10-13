-- CreateEnum
CREATE TYPE "StatusLinhaExtrato" AS ENUM ('PENDENTE', 'CONCILIADA', 'IGNORADA');

-- AlterEnum
ALTER TYPE "OrigemLancamento" ADD VALUE 'EXTRATO';

-- AlterTable
ALTER TABLE "contas_financeiras" ADD COLUMN     "contaNoBanco" VARCHAR(40);

-- AlterTable
ALTER TABLE "lancamentos" ADD COLUMN     "linhaExtratoId" INTEGER;

-- CreateTable
CREATE TABLE "extratos_importados" (
    "id" SERIAL NOT NULL,
    "contaId" INTEGER NOT NULL,
    "arquivo" VARCHAR(160) NOT NULL,
    "de" DATE,
    "ate" DATE,
    "saldoFinal" DECIMAL(12,2),
    "saldoEm" DATE,
    "criadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extratos_importados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linhas_extrato" (
    "id" SERIAL NOT NULL,
    "extratoId" INTEGER NOT NULL,
    "contaId" INTEGER NOT NULL,
    "chave" VARCHAR(200) NOT NULL,
    "data" DATE NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "descricao" VARCHAR(200) NOT NULL,
    "status" "StatusLinhaExtrato" NOT NULL DEFAULT 'PENDENTE',
    "transferenciaId" INTEGER,
    "baixou" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "criouTransferencia" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "linhas_extrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extratos_importados_contaId_createdAt_idx" ON "extratos_importados"("contaId", "createdAt");

-- CreateIndex
CREATE INDEX "linhas_extrato_contaId_status_data_idx" ON "linhas_extrato"("contaId", "status", "data");

-- CreateIndex
CREATE UNIQUE INDEX "linhas_extrato_contaId_chave_key" ON "linhas_extrato"("contaId", "chave");

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_linhaExtratoId_fkey" FOREIGN KEY ("linhaExtratoId") REFERENCES "linhas_extrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extratos_importados" ADD CONSTRAINT "extratos_importados_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "contas_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extratos_importados" ADD CONSTRAINT "extratos_importados_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_extratoId_fkey" FOREIGN KEY ("extratoId") REFERENCES "extratos_importados"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "contas_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linhas_extrato" ADD CONSTRAINT "linhas_extrato_transferenciaId_fkey" FOREIGN KEY ("transferenciaId") REFERENCES "transferencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
