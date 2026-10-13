-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('PESSOA', 'EMPRESA');

-- CreateEnum
CREATE TYPE "OrigemCliente" AS ENUM ('INSTAGRAM', 'WHATSAPP', 'INDICACAO', 'CLIENTE_DO_ALMOCO', 'PASSOU_NA_FRENTE', 'SITE', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoInteracao" AS ENUM ('LIGACAO', 'WHATSAPP', 'EMAIL', 'VISITA', 'REUNIAO', 'NOTA');

-- CreateEnum
CREATE TYPE "CategoriaReceita" AS ENUM ('ENTRADA', 'PRINCIPAL', 'ACOMPANHAMENTO', 'SOBREMESA', 'FINGER_FOOD', 'BEBIDA', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusEvento" AS ENUM ('RASCUNHO', 'ENVIADO', 'CONFIRMADO', 'REALIZADO', 'PERDIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoEvento" AS ENUM ('ANIVERSARIO', 'CASAMENTO', 'CORPORATIVO', 'FORMATURA', 'CONFRATERNIZACAO', 'RELIGIOSO', 'OUTRO');

-- CreateEnum
CREATE TYPE "FormatoEvento" AS ENUM ('SENTADO', 'EM_PE');

-- CreateEnum
CREATE TYPE "MotivoPerda" AS ENUM ('PRECO', 'DATA_INDISPONIVEL', 'FECHOU_COM_OUTRO', 'DESISTIU', 'SEM_RESPOSTA', 'OUTRO');

-- CreateEnum
CREATE TYPE "CategoriaLinha" AS ENUM ('ESPACO', 'CARDAPIO', 'BEBIDA', 'EQUIPE', 'DECORACAO', 'TERCEIRO', 'CUSTO_INTERNO', 'OUTRO');

-- CreateEnum
CREATE TYPE "EtapaChecklist" AS ENUM ('ANTES', 'NO_DIA', 'DEPOIS');

-- CreateTable
CREATE TABLE "clientes_evento" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "tipo" "TipoCliente" NOT NULL DEFAULT 'PESSOA',
    "documento" VARCHAR(14),
    "telefone" TEXT,
    "email" TEXT,
    "origem" "OrigemCliente",
    "observacoes" TEXT,
    "proximoContato" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interacoes_cliente" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "eventoId" INTEGER,
    "tipo" "TipoInteracao" NOT NULL,
    "texto" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "autorId" INTEGER,

    CONSTRAINT "interacoes_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receitas" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "categoria" "CategoriaReceita" NOT NULL,
    "unidade" VARCHAR(30) NOT NULL DEFAULT 'porção',
    "custoPorcao" DECIMAL(12,2) NOT NULL,
    "alergenicos" TEXT[],
    "ingredientes" TEXT,
    "preparo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receitas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cardapios" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(100) NOT NULL,
    "descricao" TEXT,
    "precoPorPessoa" DECIMAL(12,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cardapios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cardapio_itens" (
    "id" SERIAL NOT NULL,
    "cardapioId" INTEGER NOT NULL,
    "receitaId" INTEGER NOT NULL,
    "porcoesPorPessoa" DECIMAL(8,2) NOT NULL DEFAULT 1,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cardapio_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "titulo" VARCHAR(120) NOT NULL,
    "tipo" "TipoEvento" NOT NULL,
    "status" "StatusEvento" NOT NULL DEFAULT 'RASCUNHO',
    "data" DATE NOT NULL,
    "horaInicio" VARCHAR(5),
    "horaFim" VARCHAR(5),
    "convidados" INTEGER NOT NULL,
    "formato" "FormatoEvento" NOT NULL DEFAULT 'SENTADO',
    "cardapioId" INTEGER,
    "taxaServicoPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "impostoPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "validoAte" DATE,
    "motivoPerda" "MotivoPerda",
    "motivoPerdaTexto" TEXT,
    "observacoesCliente" TEXT,
    "observacoesInternas" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "confirmadoEm" TIMESTAMP(3),
    "realizadoEm" TIMESTAMP(3),
    "encerradoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_linhas" (
    "id" SERIAL NOT NULL,
    "eventoId" INTEGER NOT NULL,
    "categoria" "CategoriaLinha" NOT NULL,
    "descricao" VARCHAR(160) NOT NULL,
    "quantidade" DECIMAL(10,2) NOT NULL,
    "unidade" VARCHAR(20) NOT NULL DEFAULT 'un',
    "custoUnitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "precoUnitario" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "porConvidado" BOOLEAN NOT NULL DEFAULT false,
    "doCardapio" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "evento_linhas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_pagamentos" (
    "id" SERIAL NOT NULL,
    "eventoId" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "data" DATE NOT NULL,
    "forma" VARCHAR(40),
    "descricao" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evento_pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_checklist" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(80) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modelos_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelo_checklist_itens" (
    "id" SERIAL NOT NULL,
    "modeloId" INTEGER NOT NULL,
    "texto" VARCHAR(160) NOT NULL,
    "etapa" "EtapaChecklist" NOT NULL DEFAULT 'ANTES',
    "dias" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "modelo_checklist_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evento_checklist_itens" (
    "id" SERIAL NOT NULL,
    "eventoId" INTEGER NOT NULL,
    "texto" VARCHAR(160) NOT NULL,
    "etapa" "EtapaChecklist" NOT NULL DEFAULT 'ANTES',
    "prazo" DATE,
    "responsavel" VARCHAR(60),
    "feito" BOOLEAN NOT NULL DEFAULT false,
    "feitoEm" TIMESTAMP(3),
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "evento_checklist_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracao_eventos" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "margemAlvoPct" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "impostoPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxaServicoPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "sinalPct" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "validadeDias" INTEGER NOT NULL DEFAULT 7,
    "capacidadeSentados" INTEGER NOT NULL DEFAULT 40,
    "capacidadeEmPe" INTEGER,
    "valorLocacao" DECIMAL(12,2),
    "condicoes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracao_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clientes_evento_telefone_idx" ON "clientes_evento"("telefone");

-- CreateIndex
CREATE INDEX "clientes_evento_proximoContato_idx" ON "clientes_evento"("proximoContato");

-- CreateIndex
CREATE INDEX "interacoes_cliente_clienteId_em_idx" ON "interacoes_cliente"("clienteId", "em" DESC);

-- CreateIndex
CREATE INDEX "receitas_ativo_idx" ON "receitas"("ativo");

-- CreateIndex
CREATE INDEX "cardapio_itens_cardapioId_idx" ON "cardapio_itens"("cardapioId");

-- CreateIndex
CREATE INDEX "cardapio_itens_receitaId_idx" ON "cardapio_itens"("receitaId");

-- CreateIndex
CREATE INDEX "eventos_status_data_idx" ON "eventos"("status", "data");

-- CreateIndex
CREATE INDEX "eventos_clienteId_idx" ON "eventos"("clienteId");

-- CreateIndex
CREATE INDEX "eventos_data_idx" ON "eventos"("data");

-- CreateIndex
CREATE INDEX "evento_linhas_eventoId_idx" ON "evento_linhas"("eventoId");

-- CreateIndex
CREATE INDEX "evento_pagamentos_eventoId_idx" ON "evento_pagamentos"("eventoId");

-- CreateIndex
CREATE INDEX "modelo_checklist_itens_modeloId_idx" ON "modelo_checklist_itens"("modeloId");

-- CreateIndex
CREATE INDEX "evento_checklist_itens_eventoId_idx" ON "evento_checklist_itens"("eventoId");

-- CreateIndex
CREATE INDEX "evento_checklist_itens_feito_prazo_idx" ON "evento_checklist_itens"("feito", "prazo");

-- AddForeignKey
ALTER TABLE "interacoes_cliente" ADD CONSTRAINT "interacoes_cliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes_evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes_cliente" ADD CONSTRAINT "interacoes_cliente_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cardapio_itens" ADD CONSTRAINT "cardapio_itens_cardapioId_fkey" FOREIGN KEY ("cardapioId") REFERENCES "cardapios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cardapio_itens" ADD CONSTRAINT "cardapio_itens_receitaId_fkey" FOREIGN KEY ("receitaId") REFERENCES "receitas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes_evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_cardapioId_fkey" FOREIGN KEY ("cardapioId") REFERENCES "cardapios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_linhas" ADD CONSTRAINT "evento_linhas_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_pagamentos" ADD CONSTRAINT "evento_pagamentos_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modelo_checklist_itens" ADD CONSTRAINT "modelo_checklist_itens_modeloId_fkey" FOREIGN KEY ("modeloId") REFERENCES "modelos_checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_checklist_itens" ADD CONSTRAINT "evento_checklist_itens_eventoId_fkey" FOREIGN KEY ("eventoId") REFERENCES "eventos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

