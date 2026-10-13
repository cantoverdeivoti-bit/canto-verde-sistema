-- O relatório de compras que sai sozinho por e-mail e no celular.

CREATE TABLE "relatorio_agendado" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "diaSemana" INTEGER NOT NULL DEFAULT 2,
    "periodo" VARCHAR(20) NOT NULL DEFAULT 'semana-passada',
    "emails" TEXT NOT NULL DEFAULT '',
    "celular" BOOLEAN NOT NULL DEFAULT true,
    "ultimoEnvioEm" TIMESTAMP(3),
    "ultimoEnvioDia" VARCHAR(10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "relatorio_agendado_pkey" PRIMARY KEY ("id")
);
