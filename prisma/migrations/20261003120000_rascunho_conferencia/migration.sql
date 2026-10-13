-- Rascunho da conferência: quantidades e itens tirados, salvos sem criar pedido.
CREATE TABLE "rascunhos_conferencia" (
    "chave" VARCHAR(200) NOT NULL,
    "quantidades" JSONB NOT NULL,
    "fora" INTEGER[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rascunhos_conferencia_pkey" PRIMARY KEY ("chave")
);
