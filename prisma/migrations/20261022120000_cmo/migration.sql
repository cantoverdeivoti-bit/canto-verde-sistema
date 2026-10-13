-- AlterEnum
ALTER TYPE "TipoContrato" ADD VALUE 'FIXO';

-- AlterTable
ALTER TABLE "colaboradores" ADD COLUMN     "desligadoEm" DATE;

-- Quem já estava desligado não tem a data: fica a da última mudança no
-- cadastro, que é quando o desligamento foi gravado (ou depois dele).
UPDATE "colaboradores" SET "desligadoEm" = ("updatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date
WHERE "ativo" = false AND "pendente" = false;

-- CreateTable
CREATE TABLE "dias_da_escala_fechados" (
    "data" DATE NOT NULL,
    "postos" JSONB NOT NULL,
    "trabalharam" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dias_da_escala_fechados_pkey" PRIMARY KEY ("data")
);

-- CreateTable
CREATE TABLE "configuracao_pessoal" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "encargosClt" DECIMAL(5,2) NOT NULL DEFAULT 29,
    "encargosFixo" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "configuracao_pessoal_pkey" PRIMARY KEY ("id")
);
