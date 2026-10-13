-- O fornecedor avisa pelo link do pedido que o item está em falta.
ALTER TABLE "pedido_compra_itens" ADD COLUMN "emFalta" BOOLEAN NOT NULL DEFAULT false;
