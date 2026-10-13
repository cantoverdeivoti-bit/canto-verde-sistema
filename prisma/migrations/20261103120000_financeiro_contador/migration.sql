-- CreateTable
CREATE TABLE "anexos_financeiros" (
    "id" SERIAL NOT NULL,
    "lancamentoId" INTEGER NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "mime" VARCHAR(80) NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "dados" BYTEA NOT NULL,
    "criadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_financeiros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meses_fechados" (
    "mes" VARCHAR(7) NOT NULL,
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoPorId" INTEGER,

    CONSTRAINT "meses_fechados_pkey" PRIMARY KEY ("mes")
);

-- CreateIndex
CREATE INDEX "anexos_financeiros_lancamentoId_idx" ON "anexos_financeiros"("lancamentoId");

-- AddForeignKey
ALTER TABLE "anexos_financeiros" ADD CONSTRAINT "anexos_financeiros_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "lancamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos_financeiros" ADD CONSTRAINT "anexos_financeiros_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meses_fechados" ADD CONSTRAINT "meses_fechados_fechadoPorId_fkey" FOREIGN KEY ("fechadoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- As contrapartidas das partidas para o contador: juros pagos e descontos.
-- "Juros e multas" já existe no plano; ganha a chave. "Descontos obtidos" é
-- nova, só para guardar o código contábil (o desconto mora na baixa).
UPDATE "categorias_financeiras" SET "chave" = 'JUROS_MULTAS' WHERE "nome" = 'Juros e multas' AND "chave" IS NULL;
INSERT INTO "categorias_financeiras" ("nome", "tipo", "grupo", "chave")
VALUES ('Descontos obtidos', 'RECEBER', 'FINANCEIRO', 'DESCONTOS')
ON CONFLICT ("nome") DO UPDATE SET "chave" = 'DESCONTOS';
