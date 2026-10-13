-- AlterTable
ALTER TABLE "categorias_financeiras" ADD COLUMN     "centroPadraoId" INTEGER,
ADD COLUMN     "codigoContabil" VARCHAR(20);

-- AlterTable
ALTER TABLE "contas_financeiras" ADD COLUMN     "codigoContabil" VARCHAR(20);

-- AlterTable
ALTER TABLE "lancamentos" ADD COLUMN     "centroCustoId" INTEGER;

-- AlterTable
ALTER TABLE "recorrencias" ADD COLUMN     "centroCustoId" INTEGER;

-- CreateTable
CREATE TABLE "centros_custo" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(40) NOT NULL,
    "chave" VARCHAR(20),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "centros_custo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "centros_custo_nome_key" ON "centros_custo"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "centros_custo_chave_key" ON "centros_custo"("chave");

-- CreateIndex
CREATE INDEX "lancamentos_centroCustoId_idx" ON "lancamentos"("centroCustoId");

-- AddForeignKey
ALTER TABLE "categorias_financeiras" ADD CONSTRAINT "categorias_financeiras_centroPadraoId_fkey" FOREIGN KEY ("centroPadraoId") REFERENCES "centros_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "centros_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "centros_custo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Os quatro centros da casa. Salão recebe as vendas do fechamento do dia;
-- Administrativo é o custo comum, que não se rateia.
INSERT INTO "centros_custo" ("nome", "chave")
VALUES ('Salão', 'SALAO'), ('Eventos', 'EVENTOS'), ('Delivery', 'DELIVERY'), ('Administrativo', 'ADMINISTRATIVO');

-- O que já veio do fechamento do dia é venda do salão.
UPDATE "lancamentos" SET "centroCustoId" = (SELECT "id" FROM "centros_custo" WHERE "chave" = 'SALAO')
WHERE "origem" = 'FECHAMENTO';

-- Sugestões de centro: o que é de todos vai para o Administrativo; a venda
-- de evento, para Eventos; o delivery, para Delivery.
UPDATE "categorias_financeiras" SET "centroPadraoId" = (SELECT "id" FROM "centros_custo" WHERE "chave" = 'ADMINISTRATIVO')
WHERE "grupo" IN ('ADMINISTRATIVO', 'OCUPACAO', 'FINANCEIRO');
UPDATE "categorias_financeiras" SET "centroPadraoId" = (SELECT "id" FROM "centros_custo" WHERE "chave" = 'SALAO')
WHERE "chave" IN ('VENDAS_SALAO', 'REPASSE_TAXA_SERVICO');
UPDATE "categorias_financeiras" SET "centroPadraoId" = (SELECT "id" FROM "centros_custo" WHERE "chave" = 'EVENTOS')
WHERE "chave" = 'EVENTOS';
UPDATE "categorias_financeiras" SET "centroPadraoId" = (SELECT "id" FROM "centros_custo" WHERE "chave" = 'DELIVERY')
WHERE "nome" = 'Delivery' AND "chave" IS NULL;

-- As taxas das maquininhas não são lançamento próprio (moram no campo
-- `taxa` do recebível), mas o contador precisa de uma conta para elas. Esta
-- categoria existe para guardar esse código.
INSERT INTO "categorias_financeiras" ("nome", "tipo", "grupo", "chave")
VALUES ('Taxas de cartão', 'PAGAR', 'IMPOSTOS', 'TAXAS_CARTAO')
ON CONFLICT ("nome") DO UPDATE SET "chave" = 'TAXAS_CARTAO', "grupo" = 'IMPOSTOS', "tipo" = 'PAGAR';
