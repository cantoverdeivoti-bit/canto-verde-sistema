-- Mercadoria que chegou sem pedido: o motivo fica no próprio registro.
CREATE TYPE "MotivoSemPedido" AS ENUM ('BONIFICACAO', 'TROCA', 'BALCAO');

ALTER TABLE "pedidos_compra" ADD COLUMN "motivoSemPedido" "MotivoSemPedido";
