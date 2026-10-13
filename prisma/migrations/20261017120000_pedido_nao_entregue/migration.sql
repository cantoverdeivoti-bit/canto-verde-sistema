-- "Não foi entregue": o pedido encerrado em Recebimentos porque o fornecedor
-- não vai entregar. Conta como falha dele no relatório de fornecedores.

-- AlterTable
ALTER TABLE "pedidos_compra" ADD COLUMN     "naoEntregueEm" TIMESTAMP(3);
