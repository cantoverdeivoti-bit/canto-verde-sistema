-- Departamento pessoal: motivo do desligamento, jovem aprendiz (fim do
-- contrato), dependentes e documentos da admissão. Receituário: a foto do
-- prato pronto de cada ficha.

-- CreateEnum
CREATE TYPE "MotivoDesligamento" AS ENUM ('PEDIDO_DEMISSAO', 'SEM_JUSTA_CAUSA', 'JUSTA_CAUSA', 'FIM_EXPERIENCIA', 'FIM_CONTRATO', 'ACORDO', 'ABANDONO', 'OUTRO');

-- AlterTable
ALTER TABLE "colaboradores" ADD COLUMN     "aprendiz" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contratoAte" DATE,
ADD COLUMN     "detalheDesligamento" VARCHAR(300),
ADD COLUMN     "motivoDesligamento" "MotivoDesligamento",
ADD COLUMN     "razaoDesligamento" VARCHAR(40);

-- CreateTable
CREATE TABLE "dependentes" (
    "id" SERIAL NOT NULL,
    "colaboradorId" INTEGER NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "parentesco" VARCHAR(20) NOT NULL,
    "nascimento" DATE,
    "cpf" VARCHAR(11),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dependentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_colaborador" (
    "id" SERIAL NOT NULL,
    "colaboradorId" INTEGER NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "entregueEm" DATE NOT NULL,
    "naoSeAplica" BOOLEAN NOT NULL DEFAULT false,
    "nome" VARCHAR(160),
    "mime" VARCHAR(80),
    "tamanho" INTEGER,
    "dados" BYTEA,
    "criadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receituario_fotos" (
    "fichaId" INTEGER NOT NULL,
    "mime" VARCHAR(80) NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "dados" BYTEA NOT NULL,
    "miniatura" BYTEA,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receituario_fotos_pkey" PRIMARY KEY ("fichaId")
);

-- CreateIndex
CREATE INDEX "dependentes_colaboradorId_idx" ON "dependentes"("colaboradorId");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_colaborador_colaboradorId_tipo_key" ON "documentos_colaborador"("colaboradorId", "tipo");

-- AddForeignKey
ALTER TABLE "dependentes" ADD CONSTRAINT "dependentes_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_colaborador" ADD CONSTRAINT "documentos_colaborador_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receituario_fotos" ADD CONSTRAINT "receituario_fotos_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "receituario_fichas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
