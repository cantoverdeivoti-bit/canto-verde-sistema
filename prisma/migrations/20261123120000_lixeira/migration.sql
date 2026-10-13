-- A lixeira do painel: o que foi apagado (lançamento, insumo, entrega de EPI) fica 30 dias aqui.
CREATE TABLE "lixeira" (
    "id" SERIAL NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "modulo" VARCHAR(30) NOT NULL,
    "rotulo" VARCHAR(200) NOT NULL,
    "dados" JSONB NOT NULL,
    "apagadoPor" VARCHAR(80),
    "apagadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lixeira_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lixeira_apagadoEm_idx" ON "lixeira"("apagadoEm");
