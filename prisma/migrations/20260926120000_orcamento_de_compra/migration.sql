-- Meta de orçamento de compra: o faturamento da semana anterior, digitado ao
-- montar a compra, e a meta em % dele. Gravados nas contagens da rodada.
-- Nulos nas contagens de antes.
ALTER TABLE "contagens" ADD COLUMN "faturamentoSemana" DECIMAL(12,2);
ALTER TABLE "contagens" ADD COLUMN "metaOrcamento" DECIMAL(5,2);
