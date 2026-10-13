-- Código interno e estoque atual no cadastro de produto.

ALTER TABLE "products"
  ADD COLUMN "code" TEXT,
  ADD COLUMN "currentStock" DECIMAL(10,3) NOT NULL DEFAULT 0;

-- Único quando existe. O índice único do Postgres aceita vários NULL, então
-- quem não usa código não é obrigado a inventar um — mas dois itens com o
-- mesmo código passa a ser recusado pelo banco, não só pela tela.
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");
