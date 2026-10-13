-- Encargos e benefícios viram cadastro. Os % de encargos que estavam em
-- Relatórios (CLT e fixo) viram itens, e as colunas antigas saem.

-- CreateEnum
CREATE TYPE "NaturezaDoItem" AS ENUM ('ENCARGO', 'BENEFICIO');

-- CreateEnum
CREATE TYPE "FormaDoItem" AS ENUM ('PERCENTUAL_SALARIO', 'POR_MES', 'POR_DIA');

-- CreateTable
CREATE TABLE "itens_de_custo" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "natureza" "NaturezaDoItem" NOT NULL,
    "forma" "FormaDoItem" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "tipos" "TipoContrato"[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itens_de_custo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_do_colaborador" (
    "colaboradorId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "recebe" BOOLEAN NOT NULL,

    CONSTRAINT "itens_do_colaborador_pkey" PRIMARY KEY ("colaboradorId","itemId")
);

-- CreateIndex
CREATE UNIQUE INDEX "itens_de_custo_nome_key" ON "itens_de_custo"("nome");

-- CreateIndex
CREATE INDEX "itens_do_colaborador_itemId_idx" ON "itens_do_colaborador"("itemId");

-- AddForeignKey
ALTER TABLE "itens_do_colaborador" ADD CONSTRAINT "itens_do_colaborador_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_do_colaborador" ADD CONSTRAINT "itens_do_colaborador_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "itens_de_custo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Os % de hoje viram itens. Sem a linha de configuração, valem os padrões
-- (29% no CLT, 0% no fixo). CLT em 29%: os três que formam os 29%.
INSERT INTO "itens_de_custo" ("nome", "natureza", "forma", "valor", "tipos")
SELECT v.nome, 'ENCARGO', 'PERCENTUAL_SALARIO', v.valor, ARRAY['CLT']::"TipoContrato"[]
FROM (VALUES ('13º salário', 8.33), ('Férias + 1/3', 11.11), ('FGTS', 9.56)) AS v(nome, valor)
WHERE coalesce((SELECT "encargosClt" FROM "configuracao_pessoal" WHERE "id" = 1), 29) = 29;

-- CLT com outro %: um item só, com o valor que estava.
INSERT INTO "itens_de_custo" ("nome", "natureza", "forma", "valor", "tipos")
SELECT 'Encargos do CLT', 'ENCARGO', 'PERCENTUAL_SALARIO', c."encargosClt", ARRAY['CLT']::"TipoContrato"[]
FROM "configuracao_pessoal" c
WHERE c."id" = 1 AND c."encargosClt" <> 29 AND c."encargosClt" > 0;

-- Fixo com % maior que zero.
INSERT INTO "itens_de_custo" ("nome", "natureza", "forma", "valor", "tipos")
SELECT 'Encargos do fixo (por fora)', 'ENCARGO', 'PERCENTUAL_SALARIO', c."encargosFixo", ARRAY['FIXO']::"TipoContrato"[]
FROM "configuracao_pessoal" c
WHERE c."id" = 1 AND c."encargosFixo" > 0;

-- AlterTable
ALTER TABLE "configuracao_pessoal" DROP COLUMN "encargosClt",
DROP COLUMN "encargosFixo";

-- AlterTable
ALTER TABLE "cmo_dos_meses" DROP COLUMN "encargosClt",
DROP COLUMN "encargosFixo",
ADD COLUMN     "itens" JSONB NOT NULL DEFAULT '[]';
