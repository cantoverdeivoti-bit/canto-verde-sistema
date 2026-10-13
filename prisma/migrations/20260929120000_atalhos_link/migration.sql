-- Link de atalhos para o estoquista e o recebedor: um código secreto, sem
-- login, que abre só as telas do dia a dia de Compras.
ALTER TABLE "cotacao_settings" ADD COLUMN "atalhoToken" VARCHAR(64);
ALTER TABLE "cotacao_settings" ADD COLUMN "atalhoCriadoPorId" INTEGER;
ALTER TABLE "cotacao_settings" ADD COLUMN "atalhoCriadoEm" TIMESTAMP(3);
CREATE UNIQUE INDEX "cotacao_settings_atalhoToken_key" ON "cotacao_settings"("atalhoToken");
