-- AlterTable
ALTER TABLE "convites_colaborador" ADD COLUMN "paraAtualizar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "dados" JSONB,
ADD COLUMN "resolvidoEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "colaboradores" ADD COLUMN "diasDeTrabalho" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "escala_do_dia" ADD COLUMN "fechado" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "postos_da_escala" ADD COLUMN "diasFechados" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- CreateTable
CREATE TABLE "diarias_do_dia" (
    "colaboradorId" INTEGER NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "diarias_do_dia_pkey" PRIMARY KEY ("colaboradorId","diaSemana")
);

-- AddForeignKey
ALTER TABLE "diarias_do_dia" ADD CONSTRAINT "diarias_do_dia_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "colaboradores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
