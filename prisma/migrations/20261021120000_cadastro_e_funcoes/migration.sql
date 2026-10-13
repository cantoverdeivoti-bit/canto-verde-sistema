-- AlterTable
ALTER TABLE "colaboradores" ADD COLUMN     "cpf" VARCHAR(11),
ADD COLUMN     "emergenciaNome" VARCHAR(80),
ADD COLUMN     "emergenciaTelefone" VARCHAR(20),
ADD COLUMN     "endereco" VARCHAR(200),
ADD COLUMN     "nascimento" DATE,
ADD COLUMN     "pendente" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "convites_colaborador" (
    "id" SERIAL NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "tipo" "TipoContrato" NOT NULL,
    "paraQuem" VARCHAR(80),
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "colaboradorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "convites_colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "convites_colaborador_token_key" ON "convites_colaborador"("token");

-- CreateIndex
CREATE INDEX "convites_colaborador_usadoEm_idx" ON "convites_colaborador"("usadoEm");

-- CreateIndex
CREATE INDEX "colaboradores_pendente_idx" ON "colaboradores"("pendente");

-- CreateTable
CREATE TABLE "funcoes" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funcoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funcoes_nome_key" ON "funcoes"("nome");

-- A função que já estava escrita à mão no colaborador vira cadastro (uma por
-- nome, sem diferença de maiúscula), e o colaborador passa a apontar para ela.
INSERT INTO "funcoes" ("nome")
SELECT DISTINCT ON (lower(btrim("funcao"))) btrim("funcao")
FROM "colaboradores"
WHERE btrim(coalesce("funcao", '')) <> ''
ORDER BY lower(btrim("funcao")), btrim("funcao");

-- As de partida, quando ainda não existem com outro jeito de escrever.
INSERT INTO "funcoes" ("nome")
SELECT v.nome
FROM (VALUES ('Garçom'), ('Cozinheiro'), ('Auxiliar de cozinha'), ('Caixa'), ('Financeiro'), ('Serviços gerais')) AS v(nome)
WHERE NOT EXISTS (SELECT 1 FROM "funcoes" f WHERE lower(f."nome") = lower(v.nome));

-- AlterTable
ALTER TABLE "colaboradores" ADD COLUMN     "funcaoId" INTEGER;

UPDATE "colaboradores" c
SET "funcaoId" = f."id"
FROM "funcoes" f
WHERE lower(btrim(c."funcao")) = lower(f."nome");

ALTER TABLE "colaboradores" DROP COLUMN "funcao";

-- CreateIndex
CREATE INDEX "colaboradores_funcaoId_idx" ON "colaboradores"("funcaoId");

-- AddForeignKey
ALTER TABLE "colaboradores" ADD CONSTRAINT "colaboradores_funcaoId_fkey" FOREIGN KEY ("funcaoId") REFERENCES "funcoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
