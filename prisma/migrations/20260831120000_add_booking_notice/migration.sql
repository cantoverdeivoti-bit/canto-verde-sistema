-- Aviso da casa mostrado ao cliente antes de confirmar a reserva.
-- Nulo em vez de string vazia: "sem aviso" é ausência, e o render decide
-- pela presença da coluna, não por comparar com "".
ALTER TABLE "reservation_rules" ADD COLUMN "bookingNotice" TEXT;
