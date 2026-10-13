-- As condições que o fornecedor impõe: quando entrega, quando cobra, e a
-- partir de quanto aceita o pedido.
--
-- Os dois primeiros são texto porque o que se negocia raramente é uma lista
-- fechada: "quarta ou sexta", "7,14,21,28", "a combinar".

ALTER TABLE "suppliers" ADD COLUMN "deliveryWeekdays" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "paymentTerms" TEXT;
ALTER TABLE "suppliers" ADD COLUMN "minOrder" DECIMAL(10,2);
