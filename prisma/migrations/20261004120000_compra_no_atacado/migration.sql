-- Compra no atacado: fornecedor que a casa vai buscar, e o preço estimado do item.
ALTER TABLE "suppliers" ADD COLUMN "compraNoAtacado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pedido_compra_itens" ADD COLUMN "precoEstimado" DECIMAL(10,2);
