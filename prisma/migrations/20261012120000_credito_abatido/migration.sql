-- O crédito combinado numa divergência passa a ser acompanhado até ser abatido.

ALTER TABLE "pedidos_compra" ADD COLUMN "creditoAbatidoEm" TIMESTAMP(3),
ADD COLUMN "creditoAbatidoPorId" INTEGER;

ALTER TABLE "pedidos_compra" ADD CONSTRAINT "pedidos_compra_creditoAbatidoPorId_fkey" FOREIGN KEY ("creditoAbatidoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
