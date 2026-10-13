-- A correção de cadastro vinda da cotação também ajusta estoque ideal e lote.
ALTER TABLE "contagem_produto_correcoes" ADD COLUMN "idealStock" DECIMAL(10,3);
ALTER TABLE "contagem_produto_correcoes" ADD COLUMN "lotSize" DECIMAL(10,3);
