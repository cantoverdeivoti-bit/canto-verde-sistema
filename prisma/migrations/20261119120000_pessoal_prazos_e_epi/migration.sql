-- Prazos do Departamento pessoal (fim da experiência, ASO, quem manipula
-- alimentos, domingos seguidos) e o controle de entrega de EPI e uniforme.

ALTER TABLE "colaboradores" ADD COLUMN     "asoFeitoEm" DATE,
ADD COLUMN     "asoValidoAte" DATE,
ADD COLUMN     "experienciaAte" DATE,
ADD COLUMN     "manipulaAlimentos" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "configuracao_pessoal" ADD COLUMN     "domingosSeguidos" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "epi_itens" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "ca" VARCHAR(20),
    "trocaEmDias" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "epi_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "epi_entregas" (
    "id" SERIAL NOT NULL,
    "colaboradorId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "tamanho" VARCHAR(10),
    "proximaTroca" DATE,
    "desgastado" BOOLEAN NOT NULL DEFAULT false,
    "substituidaEm" DATE,
    "observacao" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "epi_entregas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "epi_itens_nome_key" ON "epi_itens"("nome");

-- CreateIndex
CREATE INDEX "epi_entregas_colaboradorId_idx" ON "epi_entregas"("colaboradorId");

-- CreateIndex
CREATE INDEX "epi_entregas_itemId_idx" ON "epi_entregas"("itemId");

-- AddForeignKey
ALTER TABLE "epi_entregas" ADD CONSTRAINT "epi_entregas_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epi_entregas" ADD CONSTRAINT "epi_entregas_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "epi_itens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Os itens de sempre, sem troca prevista: a casa define o prazo de cada um em Configurações.
INSERT INTO "epi_itens" ("nome", "ordem") VALUES
  ('Bota antiderrapante', 1),
  ('Luva térmica', 2),
  ('Avental', 3),
  ('Touca', 4),
  ('Uniforme', 5);
