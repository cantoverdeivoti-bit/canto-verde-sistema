-- Preço de compra pode existir sem fornecedor.
--
-- O catálogo veio de um relatório do ERP anterior, que traz o custo de cada
-- item mas não de quem foi comprado. Nulo é "compra que o sistema não viu".

ALTER TABLE "historico_precos_compra" ALTER COLUMN "fornecedorId" DROP NOT NULL;

ALTER TABLE "historico_precos_compra"
  DROP CONSTRAINT "historico_precos_compra_fornecedorId_fkey";

ALTER TABLE "historico_precos_compra"
  ADD CONSTRAINT "historico_precos_compra_fornecedorId_fkey"
  FOREIGN KEY ("fornecedorId") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
