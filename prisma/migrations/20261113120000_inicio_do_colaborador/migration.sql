-- AlterTable
ALTER TABLE "colaboradores" ADD COLUMN "comecouEm" DATE;

-- O fixo não tem carteira: a data que estava em "admissão" era o começo dele.
UPDATE "colaboradores" SET "comecouEm" = "admissao", "admissao" = NULL WHERE "tipo" = 'FIXO' AND "admissao" IS NOT NULL;
