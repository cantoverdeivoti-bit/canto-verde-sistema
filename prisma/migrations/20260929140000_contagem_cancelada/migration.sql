-- Contagem cancelada pelo dono ganha marca própria: o link cancelado não pode
-- ser reaberto pelo estoquista, ao contrário do vencido. Nulo nas de antes.
ALTER TABLE "contagens" ADD COLUMN "canceladaEm" TIMESTAMP(3);
