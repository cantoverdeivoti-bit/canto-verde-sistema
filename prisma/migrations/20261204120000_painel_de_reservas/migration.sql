-- Link do painel de reservas do Canto Verde (Google Apps Script), aberto dentro do admin.
ALTER TABLE "reservation_rules" ADD COLUMN IF NOT EXISTS "painelReservasUrl" VARCHAR(500);
