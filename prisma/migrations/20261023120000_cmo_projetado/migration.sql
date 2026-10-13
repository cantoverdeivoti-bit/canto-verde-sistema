-- O CMO passa a ser uma projeção de um mês padrão: os dias guardados da
-- escala saem, e entra o registro do valor de cada mês.

-- DropTable
DROP TABLE "dias_da_escala_fechados";

-- CreateTable
CREATE TABLE "cmo_dos_meses" (
    "mes" VARCHAR(7) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "clt" DECIMAL(12,2) NOT NULL,
    "fixo" DECIMAL(12,2) NOT NULL,
    "free" DECIMAL(12,2) NOT NULL,
    "faturamento" DECIMAL(12,2),
    "percentual" DECIMAL(6,2),
    "encargosClt" DECIMAL(5,2) NOT NULL,
    "encargosFixo" DECIMAL(5,2) NOT NULL,
    "pessoas" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cmo_dos_meses_pkey" PRIMARY KEY ("mes")
);
