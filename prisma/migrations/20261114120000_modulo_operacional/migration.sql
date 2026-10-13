-- CreateEnum
CREATE TYPE "MomentoTarefa" AS ENUM ('ABERTURA', 'DURANTE', 'FECHAMENTO');

-- AlterTable
ALTER TABLE "funcoes" ADD COLUMN     "descricao" TEXT;

-- CreateTable
CREATE TABLE "operacional_processos" (
    "id" SERIAL NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "objetivo" TEXT,
    "passos" TEXT[],
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "revisadoEm" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operacional_processos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacional_tarefas" (
    "id" SERIAL NOT NULL,
    "funcaoId" INTEGER NOT NULL,
    "texto" VARCHAR(200) NOT NULL,
    "momento" "MomentoTarefa" NOT NULL DEFAULT 'DURANTE',
    "dias" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "processoId" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operacional_tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacional_obrigatorios" (
    "id" SERIAL NOT NULL,
    "funcaoId" INTEGER NOT NULL,
    "processoId" INTEGER NOT NULL,

    CONSTRAINT "operacional_obrigatorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacional_treinamentos" (
    "id" SERIAL NOT NULL,
    "colaboradorId" INTEGER NOT NULL,
    "processoId" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "instrutor" VARCHAR(80),
    "observacao" TEXT,
    "registradoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operacional_treinamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "operacional_tarefas_funcaoId_ativo_idx" ON "operacional_tarefas"("funcaoId", "ativo");

-- CreateIndex
CREATE INDEX "operacional_obrigatorios_processoId_idx" ON "operacional_obrigatorios"("processoId");

-- CreateIndex
CREATE UNIQUE INDEX "operacional_obrigatorios_funcaoId_processoId_key" ON "operacional_obrigatorios"("funcaoId", "processoId");

-- CreateIndex
CREATE INDEX "operacional_treinamentos_colaboradorId_processoId_idx" ON "operacional_treinamentos"("colaboradorId", "processoId");

-- CreateIndex
CREATE INDEX "operacional_treinamentos_processoId_idx" ON "operacional_treinamentos"("processoId");

-- AddForeignKey
ALTER TABLE "operacional_tarefas" ADD CONSTRAINT "operacional_tarefas_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "funcoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacional_tarefas" ADD CONSTRAINT "operacional_tarefas_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "operacional_processos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacional_obrigatorios" ADD CONSTRAINT "operacional_obrigatorios_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "funcoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacional_obrigatorios" ADD CONSTRAINT "operacional_obrigatorios_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "operacional_processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacional_treinamentos" ADD CONSTRAINT "operacional_treinamentos_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacional_treinamentos" ADD CONSTRAINT "operacional_treinamentos_processoId_fkey" FOREIGN KEY ("processoId") REFERENCES "operacional_processos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacional_treinamentos" ADD CONSTRAINT "operacional_treinamentos_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

