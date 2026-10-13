-- Token secreto do link de cancelamento do cliente.
-- Separado do id para que a página de confirmação possa ser compartilhada
-- sem conceder poder de cancelar.
ALTER TABLE "reservations" ADD COLUMN "cancelToken" TEXT NOT NULL DEFAULT gen_random_uuid()::text;

CREATE UNIQUE INDEX "reservations_cancelToken_key" ON "reservations"("cancelToken");
