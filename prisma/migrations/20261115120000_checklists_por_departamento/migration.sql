-- Os checklists deixam de ser tarefas da função e passam a ser folhas por
-- lugar da casa: departamento (Salão) e subdepartamento (Salão / Caixa), cada
-- folha com abertura e fechamento. O que já estava cadastrado numa função
-- vira um departamento com o nome dela, com a folha do departamento todo; o
-- "durante o turno" entra no fim da abertura. Tarefa desligada não passa.

-- CreateEnum
CREATE TYPE "MomentoDoChecklist" AS ENUM ('ABERTURA', 'FECHAMENTO');

-- CreateTable
CREATE TABLE "operacional_departamentos" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operacional_departamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacional_checklists" (
    "id" SERIAL NOT NULL,
    "departamentoId" INTEGER NOT NULL,
    "nome" VARCHAR(60),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operacional_checklists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operacional_checklist_tarefas" (
    "id" SERIAL NOT NULL,
    "listaId" INTEGER NOT NULL,
    "momento" "MomentoDoChecklist" NOT NULL,
    "texto" VARCHAR(200) NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operacional_checklist_tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operacional_departamentos_nome_key" ON "operacional_departamentos"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "operacional_checklists_departamentoId_nome_key" ON "operacional_checklists"("departamentoId", "nome");

-- CreateIndex
CREATE INDEX "operacional_checklist_tarefas_listaId_momento_idx" ON "operacional_checklist_tarefas"("listaId", "momento");

-- AddForeignKey
ALTER TABLE "operacional_checklists" ADD CONSTRAINT "operacional_checklists_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "operacional_departamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operacional_checklist_tarefas" ADD CONSTRAINT "operacional_checklist_tarefas_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "operacional_checklists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- O que já existia: um departamento por função com tarefa ligada, com a
-- folha do departamento todo.
INSERT INTO "operacional_departamentos" ("nome")
SELECT DISTINCT f."nome"
FROM "operacional_tarefas" t
JOIN "funcoes" f ON f."id" = t."funcaoId"
WHERE t."ativo";

INSERT INTO "operacional_checklists" ("departamentoId", "nome")
SELECT d."id", NULL FROM "operacional_departamentos" d;

INSERT INTO "operacional_checklist_tarefas" ("listaId", "momento", "texto", "ordem", "updatedAt")
SELECT
    l."id",
    CASE WHEN t."momento" = 'FECHAMENTO' THEN 'FECHAMENTO'::"MomentoDoChecklist" ELSE 'ABERTURA'::"MomentoDoChecklist" END,
    t."texto",
    ROW_NUMBER() OVER (
        PARTITION BY l."id", t."momento" = 'FECHAMENTO'
        ORDER BY t."momento" = 'DURANTE', t."ordem", t."id"
    ),
    CURRENT_TIMESTAMP
FROM "operacional_tarefas" t
JOIN "funcoes" f ON f."id" = t."funcaoId"
JOIN "operacional_departamentos" d ON d."nome" = f."nome"
JOIN "operacional_checklists" l ON l."departamentoId" = d."id" AND l."nome" IS NULL
WHERE t."ativo";

-- DropForeignKey
ALTER TABLE "operacional_tarefas" DROP CONSTRAINT "operacional_tarefas_funcaoId_fkey";

-- DropForeignKey
ALTER TABLE "operacional_tarefas" DROP CONSTRAINT "operacional_tarefas_processoId_fkey";

-- DropTable
DROP TABLE "operacional_tarefas";

-- DropEnum
DROP TYPE "MomentoTarefa";
