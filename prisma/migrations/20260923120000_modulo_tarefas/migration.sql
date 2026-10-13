-- O módulo Tarefas: o quadro, as colunas e o histórico de cada cartão.
--
-- Substitui o TickTick, que atende uma pessoa e desanda como sistema de
-- equipe. Os sinais estavam na própria conta: quatro tags com nome de gente
-- (ALINE, JOEL, Laura, LAUREN) fazendo o papel de responsável, sete projetos
-- com sete conjuntos diferentes de colunas, e colunas chamadas "ESVAZIAR E
-- APAGAR" no lugar de um arquivamento em lote.
--
-- Três decisões desta migração merecem ser lidas antes de mexer nela.
--
-- PRIMEIRA: a coluna declara a ETAPA a que pertence, em "colunas"."estado".
-- Não dá para comparar projetos cujas colunas não têm nada em comum, e proibir
-- coluna extra não é resposta — TREINAMENTO no POP e REVISAR em Eventos são
-- demanda real da operação. Então toda coluna, padrão ou extra, aponta para um
-- dos sete valores de "EstadoColuna", e é sobre o estado, não sobre o nome,
-- que a máquina de estados decide o que move para onde. Coluna extra ganha as
-- regras certas sem ninguém cadastrar movimento nenhum.
--
-- SEGUNDA: "tarefas"."responsavelId" é ON DELETE RESTRICT, e não SET NULL.
-- Quem sai da empresa é desativado, nunca apagado — nenhuma ação deste
-- sistema apaga AdminUser. A tarefa do desligado tem de aparecer para o gestor
-- MARCADA com o nome de quem era o dono, e um nulo apagaria exatamente a
-- informação que interessa. O mesmo vale para quem criou, concluiu, moveu,
-- comentou ou excluiu.
--
-- TERCEIRA: "log_atividade" é polimórfico e NÃO tem chave estrangeira para
-- "tarefas". A lixeira apaga a tarefa de vez 30 dias depois de excluída, e uma
-- FK com cascata levaria o histórico junto — apagando a prova de que a tarefa
-- existiu e de quem a excluiu. O log tem de sobreviver ao que ele descreve.
-- "movimentos_coluna", ao contrário, cascateia de propósito: ele alimenta o
-- relatório de tempo por coluna, e trabalho que foi para o lixo não entra em
-- média de tempo de ciclo.
--
-- "movimentos_coluna" nasce nesta migração, e não na fase que constrói o
-- relatório. Tempo parado não se reconstrói depois: ou se grava cada passagem
-- desde o primeiro cartão, ou o primeiro relatório nasce sem passado.
--
-- Sem CHECK, como em toda migração deste projeto. As faixas e obrigatoriedades
-- — responsável fora do BACKLOG, motivo e previsão no AGUARDANDO — moram onde
-- podem dar mensagem a quem clicou: lib/tarefas-fluxo.ts, conferido de novo na
-- ação de servidor.
--
-- Nada é populado aqui. Setor, projeto e as oito colunas padrão nascem pela
-- tela, a partir do modelo em lib/tarefas-colunas.ts, que é onde a ordem
-- BACKLOG > LAPIDAR > A FAZER está escrita.

-- CreateEnum
CREATE TYPE "EstadoColuna" AS ENUM ('ENTRADA', 'PLANEJADO', 'EXECUCAO', 'EXECUCAO_BLOQUEADA', 'RECORRENTE', 'FINALIZADO_COM_REGISTRO', 'CONCLUIDO');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('ABERTA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PrioridadeTarefa" AS ENUM ('NENHUMA', 'BAIXA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "PapelProjeto" AS ENUM ('GESTOR', 'EDITOR', 'EXECUTOR', 'LEITOR');

-- CreateEnum
CREATE TYPE "MotivoCancelamento" AS ENUM ('DUPLICADA', 'NAO_E_MAIS_NECESSARIA', 'FORA_DO_ESCOPO', 'SEM_RECURSOS', 'OUTRO');

-- CreateEnum
CREATE TYPE "OrigemAcao" AS ENUM ('APP', 'API', 'GATILHO', 'EMAIL', 'IMPORTACAO');

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "setorId" INTEGER;

-- CreateTable
CREATE TABLE "setores" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "liderId" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projetos" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "donoId" INTEGER NOT NULL,
    "setorId" INTEGER,
    "privado" BOOLEAN NOT NULL DEFAULT false,
    "wipBloqueia" BOOLEAN NOT NULL DEFAULT false,
    "arquivadoEm" TIMESTAMP(3),
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projetos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colunas" (
    "id" SERIAL NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "estado" "EstadoColuna" NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "oculta" BOOLEAN NOT NULL DEFAULT false,
    "wipPorPessoa" INTEGER,
    "alertaLaranjaDias" INTEGER,
    "alertaVermelhoDias" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colunas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membros_projeto" (
    "id" SERIAL NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "papel" "PapelProjeto" NOT NULL DEFAULT 'EXECUTOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membros_projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas" (
    "id" SERIAL NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "colunaId" INTEGER NOT NULL,
    "tarefaPaiId" INTEGER,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "StatusTarefa" NOT NULL DEFAULT 'ABERTA',
    "motivoCancelamento" "MotivoCancelamento",
    "textoCancelamento" TEXT,
    "prioridade" "PrioridadeTarefa" NOT NULL DEFAULT 'NENHUMA',
    "responsavelId" INTEGER,
    "setorResponsavelId" INTEGER,
    "setorId" INTEGER,
    "dataInicio" TIMESTAMP(3),
    "inicioDiaInteiro" BOOLEAN NOT NULL DEFAULT true,
    "prazo" TIMESTAMP(3),
    "prazoDiaInteiro" BOOLEAN NOT NULL DEFAULT true,
    "qtdAdiamentos" INTEGER NOT NULL DEFAULT 0,
    "aguardandoDescricao" TEXT,
    "aguardandoPrevisao" TIMESTAMP(3),
    "documentoUrl" TEXT,
    "ordem" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "criadoPorId" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPorId" INTEGER,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "concluidoPorId" INTEGER,
    "concluidoEm" TIMESTAMP(3),
    "excluidoPorId" INTEGER,
    "excluidoEm" TIMESTAMP(3),
    "colunaAnteriorId" INTEGER,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimentos_coluna" (
    "id" SERIAL NOT NULL,
    "tarefaId" INTEGER NOT NULL,
    "colunaOrigemId" INTEGER,
    "estadoOrigem" "EstadoColuna",
    "colunaDestinoId" INTEGER,
    "estadoDestino" "EstadoColuna" NOT NULL,
    "usuarioId" INTEGER,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimentos_coluna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_atividade" (
    "id" SERIAL NOT NULL,
    "entidade" TEXT NOT NULL,
    "entidadeId" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "campo" TEXT,
    "valorAntes" JSONB,
    "valorDepois" JSONB,
    "usuarioId" INTEGER,
    "origem" "OrigemAcao" NOT NULL DEFAULT 'APP',
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_atividade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comentarios" (
    "id" SERIAL NOT NULL,
    "tarefaId" INTEGER NOT NULL,
    "autorId" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "respostaAId" INTEGER,
    "editadoEm" TIMESTAMP(3),
    "excluidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "setores_nome_key" ON "setores"("nome");

-- CreateIndex
CREATE INDEX "setores_liderId_idx" ON "setores"("liderId");

-- CreateIndex
CREATE UNIQUE INDEX "projetos_nome_key" ON "projetos"("nome");

-- CreateIndex
CREATE INDEX "projetos_setorId_idx" ON "projetos"("setorId");

-- CreateIndex
CREATE INDEX "projetos_donoId_idx" ON "projetos"("donoId");

-- CreateIndex
CREATE INDEX "colunas_projetoId_ordem_idx" ON "colunas"("projetoId", "ordem");

-- CreateIndex
CREATE UNIQUE INDEX "colunas_projetoId_nome_key" ON "colunas"("projetoId", "nome");

-- CreateIndex
CREATE INDEX "membros_projeto_userId_idx" ON "membros_projeto"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "membros_projeto_projetoId_userId_key" ON "membros_projeto"("projetoId", "userId");

-- CreateIndex
CREATE INDEX "tarefas_responsavelId_status_prazo_idx" ON "tarefas"("responsavelId", "status", "prazo");

-- CreateIndex
CREATE INDEX "tarefas_projetoId_colunaId_ordem_idx" ON "tarefas"("projetoId", "colunaId", "ordem");

-- CreateIndex
CREATE INDEX "tarefas_colunaId_idx" ON "tarefas"("colunaId");

-- CreateIndex
CREATE INDEX "tarefas_tarefaPaiId_idx" ON "tarefas"("tarefaPaiId");

-- CreateIndex
CREATE INDEX "tarefas_setorResponsavelId_idx" ON "tarefas"("setorResponsavelId");

-- CreateIndex
CREATE INDEX "movimentos_coluna_tarefaId_em_idx" ON "movimentos_coluna"("tarefaId", "em");

-- CreateIndex
CREATE INDEX "log_atividade_entidade_entidadeId_em_idx" ON "log_atividade"("entidade", "entidadeId", "em");

-- CreateIndex
CREATE INDEX "log_atividade_usuarioId_em_idx" ON "log_atividade"("usuarioId", "em");

-- CreateIndex
CREATE INDEX "comentarios_tarefaId_criadoEm_idx" ON "comentarios"("tarefaId", "criadoEm");

-- CreateIndex
CREATE INDEX "admin_users_setorId_idx" ON "admin_users"("setorId");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "setores" ADD CONSTRAINT "setores_liderId_fkey" FOREIGN KEY ("liderId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_donoId_fkey" FOREIGN KEY ("donoId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projetos" ADD CONSTRAINT "projetos_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colunas" ADD CONSTRAINT "colunas_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_projeto" ADD CONSTRAINT "membros_projeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membros_projeto" ADD CONSTRAINT "membros_projeto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_colunaId_fkey" FOREIGN KEY ("colunaId") REFERENCES "colunas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_tarefaPaiId_fkey" FOREIGN KEY ("tarefaPaiId") REFERENCES "tarefas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_setorResponsavelId_fkey" FOREIGN KEY ("setorResponsavelId") REFERENCES "setores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_setorId_fkey" FOREIGN KEY ("setorId") REFERENCES "setores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_atualizadoPorId_fkey" FOREIGN KEY ("atualizadoPorId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_concluidoPorId_fkey" FOREIGN KEY ("concluidoPorId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_excluidoPorId_fkey" FOREIGN KEY ("excluidoPorId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_coluna" ADD CONSTRAINT "movimentos_coluna_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_coluna" ADD CONSTRAINT "movimentos_coluna_colunaOrigemId_fkey" FOREIGN KEY ("colunaOrigemId") REFERENCES "colunas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_coluna" ADD CONSTRAINT "movimentos_coluna_colunaDestinoId_fkey" FOREIGN KEY ("colunaDestinoId") REFERENCES "colunas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimentos_coluna" ADD CONSTRAINT "movimentos_coluna_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_atividade" ADD CONSTRAINT "log_atividade_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios" ADD CONSTRAINT "comentarios_respostaAId_fkey" FOREIGN KEY ("respostaAId") REFERENCES "comentarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

