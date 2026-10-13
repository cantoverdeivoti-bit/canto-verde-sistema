-- Cardápio buffet: o peso de cada prato no dia (feito e sobra) e os clientes do dia,
-- para o custo real do dia e o desperdício.

-- CreateTable
CREATE TABLE "buffet_pesos" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "grupoId" INTEGER NOT NULL,
    "posicao" INTEGER NOT NULL,
    "pratoId" INTEGER NOT NULL,
    "kgProduzido" DECIMAL(8,3) NOT NULL,
    "kgSobra" DECIMAL(8,3),
    "custoKg" DECIMAL(10,4),
    "lancadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buffet_pesos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buffet_clientes_do_dia" (
    "data" DATE NOT NULL,
    "clientes" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buffet_clientes_do_dia_pkey" PRIMARY KEY ("data")
);

-- CreateIndex
CREATE INDEX "buffet_pesos_data_idx" ON "buffet_pesos"("data");

-- CreateIndex
CREATE UNIQUE INDEX "buffet_pesos_data_grupoId_posicao_key" ON "buffet_pesos"("data", "grupoId", "posicao");

-- AddForeignKey
ALTER TABLE "buffet_pesos" ADD CONSTRAINT "buffet_pesos_pratoId_fkey" FOREIGN KEY ("pratoId") REFERENCES "buffet_pratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

