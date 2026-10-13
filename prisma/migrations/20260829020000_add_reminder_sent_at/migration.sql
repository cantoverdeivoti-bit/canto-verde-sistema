-- Marca quando o lembrete pré-visita foi enviado; nulo = ainda não.
-- O cron só seleciona linhas nulas, garantindo no máximo um lembrete.
ALTER TABLE "reservations" ADD COLUMN "reminderSentAt" TIMESTAMPTZ(3);
