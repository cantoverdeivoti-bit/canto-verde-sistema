-- Horários de reserva do Canto Verde, iguais ao sistema de reservas antigo.
--
-- Sábado, Café Rural: uma entrada às 12:00.
-- Domingo, almoço: duas entradas, 11:45 e 13:00.
--
-- A mesa dura 75 minutos e os horários andam de 75 em 75: assim as duas
-- entradas do domingo não disputam as mesmas cadeiras, e a janela do sábado
-- (12:00 a 13:15) gera um horário só.

UPDATE "capacity_settings"
SET "defaultDurationMinutes" = 75, "slotIntervalMinutes" = 75, "minSlotsWarningThreshold" = 1, "updatedAt" = NOW()
WHERE "id" = 1;

DELETE FROM "business_hours";
INSERT INTO "business_hours" ("dayOfWeek", "shiftName", "opensAt", "closesAt", "isActive") VALUES
  (6, 'Café Rural', '12:00', '13:15', true),
  (0, 'Almoço', '11:45', '14:15', true);
