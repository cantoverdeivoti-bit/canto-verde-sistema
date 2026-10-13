-- Recebimento: o problema do item em campo próprio (antes ia para a
-- observação e apagava a do fornecedor), e o preço pago ao lado do combinado.
CREATE TYPE "ProblemaRecebimento" AS ENUM ('FALTA', 'DEVOLVIDO', 'AVARIA');
ALTER TABLE "pedido_compra_itens" ADD COLUMN "problemaRecebimento" "ProblemaRecebimento";
ALTER TABLE "pedido_compra_itens" ADD COLUMN "precoPago" DECIMAL(10,2);

-- O que já foi anotado como problema na observação vira o campo novo.
UPDATE "pedido_compra_itens" SET "problemaRecebimento" = 'FALTA' WHERE "observacoes" = 'Falta';
UPDATE "pedido_compra_itens" SET "problemaRecebimento" = 'DEVOLVIDO' WHERE "observacoes" = 'Devolvido';
UPDATE "pedido_compra_itens" SET "problemaRecebimento" = 'AVARIA' WHERE "observacoes" = 'Avaria';

-- O que já foi recebido: o pago é o que estava gravado.
UPDATE "pedido_compra_itens" SET "precoPago" = "precoUnitario"
WHERE "quantidadeRecebida" IS NOT NULL AND "precoUnitario" IS NOT NULL;

-- O histórico de preço lembra de que item de pedido veio, para desfazer.
ALTER TABLE "historico_precos_compra" ADD COLUMN "pedidoCompraItemId" INTEGER;
CREATE INDEX "historico_precos_compra_pedidoCompraItemId_idx" ON "historico_precos_compra"("pedidoCompraItemId");

-- Cotação descartada pelo dono antes de gerar pedidos.
ALTER TYPE "CotacaoStatus" ADD VALUE 'DESCARTADA';
