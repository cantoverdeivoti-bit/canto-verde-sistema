-- Orçamento de compra por semana: o faturamento da semana anterior, digitado
-- uma vez, e a meta de CMV teórico. Substitui as colunas por contagem.
CREATE TABLE "orcamentos_semana" (
    "id" SERIAL NOT NULL,
    "semana" DATE NOT NULL,
    "faturamentoAnterior" DECIMAL(12,2) NOT NULL,
    "metaCmv" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "orcamentos_semana_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "orcamentos_semana_semana_key" ON "orcamentos_semana"("semana");

-- O que já foi digitado ao montar vira o orçamento daquela semana (segunda-feira
-- no fuso da casa). Se houver mais de um na semana, vale o último.
INSERT INTO "orcamentos_semana" ("semana", "faturamentoAnterior", "metaCmv", "updatedAt")
SELECT DISTINCT ON (semana) semana, "faturamentoSemana", "metaOrcamento", CURRENT_TIMESTAMP
FROM (
  SELECT date_trunc('week', ("processadaEm" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo')::date AS semana,
         "faturamentoSemana", "metaOrcamento", "processadaEm"
  FROM "contagens"
  WHERE "faturamentoSemana" IS NOT NULL AND "metaOrcamento" IS NOT NULL AND "processadaEm" IS NOT NULL
) t
ORDER BY semana, "processadaEm" DESC;

ALTER TABLE "contagens" DROP COLUMN "faturamentoSemana";
ALTER TABLE "contagens" DROP COLUMN "metaOrcamento";
