-- CreateEnum
CREATE TYPE "TipoContrato" AS ENUM ('CLT', 'FREELANCER');


-- CreateEnum
CREATE TYPE "AreaDeTrabalho" AS ENUM ('COZINHA', 'SALAO');


-- CreateTable
CREATE TABLE "colaboradores" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "apelido" VARCHAR(40),
    "telefone" VARCHAR(20),
    "tipo" "TipoContrato" NOT NULL,
    "area" "AreaDeTrabalho",
    "funcao" VARCHAR(60),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "admissao" DATE,
    "salario" DECIMAL(10,2),
    "diaria" DECIMAL(10,2),
    "observacoes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaboradores_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "postos_da_escala" (
    "id" SERIAL NOT NULL,
    "area" "AreaDeTrabalho" NOT NULL,
    "nome" VARCHAR(40) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "postos_da_escala_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "escala_fixa" (
    "id" SERIAL NOT NULL,
    "postoId" INTEGER NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "colaboradorId" INTEGER NOT NULL,

    CONSTRAINT "escala_fixa_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "escala_do_dia" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "postoId" INTEGER NOT NULL,
    "colaboradorId" INTEGER,
    "observacao" VARCHAR(120),

    CONSTRAINT "escala_do_dia_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "ferias" (
    "id" SERIAL NOT NULL,
    "colaboradorId" INTEGER NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE NOT NULL,
    "observacao" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ferias_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE INDEX "colaboradores_ativo_idx" ON "colaboradores"("ativo");


-- CreateIndex
CREATE INDEX "escala_fixa_colaboradorId_idx" ON "escala_fixa"("colaboradorId");


-- CreateIndex
CREATE UNIQUE INDEX "escala_fixa_postoId_diaSemana_key" ON "escala_fixa"("postoId", "diaSemana");


-- CreateIndex
CREATE INDEX "escala_do_dia_colaboradorId_idx" ON "escala_do_dia"("colaboradorId");


-- CreateIndex
CREATE UNIQUE INDEX "escala_do_dia_data_postoId_key" ON "escala_do_dia"("data", "postoId");


-- CreateIndex
CREATE INDEX "ferias_colaboradorId_idx" ON "ferias"("colaboradorId");


-- CreateIndex
CREATE INDEX "ferias_inicio_fim_idx" ON "ferias"("inicio", "fim");


-- AddForeignKey
ALTER TABLE "escala_fixa" ADD CONSTRAINT "escala_fixa_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos_da_escala"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "escala_fixa" ADD CONSTRAINT "escala_fixa_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "escala_do_dia" ADD CONSTRAINT "escala_do_dia_postoId_fkey" FOREIGN KEY ("postoId") REFERENCES "postos_da_escala"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "escala_do_dia" ADD CONSTRAINT "escala_do_dia_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ferias" ADD CONSTRAINT "ferias_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Os postos da planilha "ESCALA FIXA", na mesma ordem.
INSERT INTO "postos_da_escala" ("area", "nome", "ordem") VALUES
  ('COZINHA', 'Cozinheira', 1),
  ('COZINHA', 'Fritura', 2),
  ('COZINHA', 'Chapa', 3),
  ('COZINHA', 'Louça', 4),
  ('COZINHA', 'Salada', 5),
  ('SALAO', 'Caixa', 1),
  ('SALAO', 'Buffet', 2),
  ('SALAO', 'Bar', 3),
  ('SALAO', 'Balança', 4),
  ('SALAO', 'Salão 1', 5),
  ('SALAO', 'Salão 2', 6),
  ('SALAO', 'Salão 3', 7),
  ('SALAO', 'Salão 4', 8),
  ('SALAO', 'Recepção', 9);
