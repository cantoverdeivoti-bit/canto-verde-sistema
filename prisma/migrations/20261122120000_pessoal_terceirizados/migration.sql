-- A empresa terceirizada (garçons de fora): um cadastro à parte do colaborador.
CREATE TABLE "terceirizados" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "telefone" VARCHAR(20),
    "valorPorPessoa" DECIMAL(10,2),
    "area" "AreaDeTrabalho",
    "observacoes" VARCHAR(500),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "terceirizados_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "terceirizados_ativo_idx" ON "terceirizados"("ativo");

-- A semana fixa aceita a empresa no lugar do colaborador: um dos dois, nunca os dois.
ALTER TABLE "escala_fixa" ALTER COLUMN "colaboradorId" DROP NOT NULL;
ALTER TABLE "escala_fixa" ADD COLUMN "terceirizadoId" INTEGER;
ALTER TABLE "escala_fixa" ADD CONSTRAINT "escala_fixa_terceirizadoId_fkey" FOREIGN KEY ("terceirizadoId") REFERENCES "terceirizados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "escala_fixa" ADD CONSTRAINT "escala_fixa_um_dos_dois" CHECK (("colaboradorId" IS NULL) <> ("terceirizadoId" IS NULL));
CREATE INDEX "escala_fixa_terceirizadoId_idx" ON "escala_fixa"("terceirizadoId");

-- A exceção de uma data também: no máximo um dos dois (os dois nulos = posto vazio).
ALTER TABLE "escala_do_dia" ADD COLUMN "terceirizadoId" INTEGER;
ALTER TABLE "escala_do_dia" ADD CONSTRAINT "escala_do_dia_terceirizadoId_fkey" FOREIGN KEY ("terceirizadoId") REFERENCES "terceirizados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "escala_do_dia" ADD CONSTRAINT "escala_do_dia_no_maximo_um" CHECK ("colaboradorId" IS NULL OR "terceirizadoId" IS NULL);
CREATE INDEX "escala_do_dia_terceirizadoId_idx" ON "escala_do_dia"("terceirizadoId");
