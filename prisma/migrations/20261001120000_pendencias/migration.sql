-- Pendências: a diferença de recebimento marcada como resolvida, com o desfecho.
CREATE TYPE "DesfechoDivergencia" AS ENUM ('COBRADO', 'CREDITO', 'ACEITO');

ALTER TABLE "pedidos_compra"
  ADD COLUMN "divergenciaResolvidaEm" TIMESTAMP(3),
  ADD COLUMN "divergenciaDesfecho" "DesfechoDivergencia",
  ADD COLUMN "divergenciaNota" TEXT,
  ADD COLUMN "divergenciaResolvidaPorId" INTEGER;

ALTER TABLE "pedidos_compra"
  ADD CONSTRAINT "pedidos_compra_divergenciaResolvidaPorId_fkey"
  FOREIGN KEY ("divergenciaResolvidaPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
