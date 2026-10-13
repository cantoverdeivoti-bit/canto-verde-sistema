-- CreateEnum
CREATE TYPE "TipoConta" AS ENUM ('CAIXA', 'BANCO', 'CARTEIRA');

-- CreateEnum
CREATE TYPE "TipoLancamento" AS ENUM ('PAGAR', 'RECEBER');

-- CreateEnum
CREATE TYPE "StatusLancamento" AS ENUM ('ABERTO', 'PAGO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigemLancamento" AS ENUM ('MANUAL', 'RECORRENCIA', 'FECHAMENTO', 'COMPRA', 'EVENTO');

-- CreateEnum
CREATE TYPE "GrupoDre" AS ENUM ('RECEITA_VENDAS', 'TAXA_SERVICO', 'IMPOSTOS', 'CMV', 'PESSOAL', 'OCUPACAO', 'OPERACIONAL', 'ADMINISTRATIVO', 'MARKETING', 'FINANCEIRO', 'FORA_DO_RESULTADO');

-- CreateEnum
CREATE TYPE "TipoFormaRecebimento" AS ENUM ('DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'VOUCHER', 'OUTRO');

-- CreateTable
CREATE TABLE "contas_financeiras" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(40) NOT NULL,
    "tipo" "TipoConta" NOT NULL,
    "saldoInicial" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "saldoInicialEm" DATE NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contas_financeiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_financeiras" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "grupo" "GrupoDre" NOT NULL,
    "chave" VARCHAR(40),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categorias_financeiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formas_recebimento" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(40) NOT NULL,
    "tipo" "TipoFormaRecebimento" NOT NULL,
    "taxaPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "prazoDias" INTEGER NOT NULL DEFAULT 0,
    "contaId" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formas_recebimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lancamentos" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoLancamento" NOT NULL,
    "descricao" VARCHAR(120) NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "contaId" INTEGER,
    "fornecedorId" INTEGER,
    "valor" DECIMAL(12,2) NOT NULL,
    "taxa" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "vencimento" DATE NOT NULL,
    "competencia" DATE NOT NULL,
    "status" "StatusLancamento" NOT NULL DEFAULT 'ABERTO',
    "pagoEm" DATE,
    "valorPago" DECIMAL(12,2),
    "jurosMulta" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "documento" VARCHAR(60),
    "observacao" TEXT,
    "parcela" INTEGER,
    "totalParcelas" INTEGER,
    "grupoParcelas" VARCHAR(36),
    "recorrenciaId" INTEGER,
    "fechamentoId" INTEGER,
    "origem" "OrigemLancamento" NOT NULL DEFAULT 'MANUAL',
    "origemId" INTEGER,
    "criadoPorId" INTEGER,
    "baixadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lancamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recorrencias" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoLancamento" NOT NULL DEFAULT 'PAGAR',
    "descricao" VARCHAR(120) NOT NULL,
    "categoriaId" INTEGER NOT NULL,
    "contaId" INTEGER,
    "fornecedorId" INTEGER,
    "valor" DECIMAL(12,2) NOT NULL,
    "diaVencimento" INTEGER NOT NULL,
    "inicio" DATE NOT NULL,
    "fim" DATE,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recorrencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fechamentos_do_dia" (
    "id" SERIAL NOT NULL,
    "data" DATE NOT NULL,
    "taxaServico" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "observacao" TEXT,
    "criadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fechamentos_do_dia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fechamento_itens" (
    "id" SERIAL NOT NULL,
    "fechamentoId" INTEGER NOT NULL,
    "formaId" INTEGER NOT NULL,
    "valorBruto" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "fechamento_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferencias" (
    "id" SERIAL NOT NULL,
    "origemId" INTEGER NOT NULL,
    "destinoId" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "data" DATE NOT NULL,
    "observacao" VARCHAR(120),
    "criadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transferencias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contas_financeiras_nome_key" ON "contas_financeiras"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_financeiras_nome_key" ON "categorias_financeiras"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_financeiras_chave_key" ON "categorias_financeiras"("chave");

-- CreateIndex
CREATE UNIQUE INDEX "formas_recebimento_nome_key" ON "formas_recebimento"("nome");

-- CreateIndex
CREATE INDEX "lancamentos_status_vencimento_idx" ON "lancamentos"("status", "vencimento");

-- CreateIndex
CREATE INDEX "lancamentos_competencia_idx" ON "lancamentos"("competencia");

-- CreateIndex
CREATE INDEX "lancamentos_pagoEm_idx" ON "lancamentos"("pagoEm");

-- CreateIndex
CREATE INDEX "lancamentos_fechamentoId_idx" ON "lancamentos"("fechamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "lancamentos_recorrenciaId_competencia_key" ON "lancamentos"("recorrenciaId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "fechamentos_do_dia_data_key" ON "fechamentos_do_dia"("data");

-- CreateIndex
CREATE UNIQUE INDEX "fechamento_itens_fechamentoId_formaId_key" ON "fechamento_itens"("fechamentoId", "formaId");

-- CreateIndex
CREATE INDEX "transferencias_data_idx" ON "transferencias"("data");

-- AddForeignKey
ALTER TABLE "formas_recebimento" ADD CONSTRAINT "formas_recebimento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "contas_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "contas_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "recorrencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_fechamentoId_fkey" FOREIGN KEY ("fechamentoId") REFERENCES "fechamentos_do_dia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_baixadoPorId_fkey" FOREIGN KEY ("baixadoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "categorias_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "contas_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recorrencias" ADD CONSTRAINT "recorrencias_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fechamentos_do_dia" ADD CONSTRAINT "fechamentos_do_dia_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fechamento_itens" ADD CONSTRAINT "fechamento_itens_fechamentoId_fkey" FOREIGN KEY ("fechamentoId") REFERENCES "fechamentos_do_dia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fechamento_itens" ADD CONSTRAINT "fechamento_itens_formaId_fkey" FOREIGN KEY ("formaId") REFERENCES "formas_recebimento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_origemId_fkey" FOREIGN KEY ("origemId") REFERENCES "contas_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_destinoId_fkey" FOREIGN KEY ("destinoId") REFERENCES "contas_financeiras"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- O ponto de partida do plano de contas. A casa renomeia, desliga e cria o
-- que quiser; as três com chave são as que o sistema usa ao gerar
-- lançamento, e não se apagam.
INSERT INTO "categorias_financeiras" ("nome", "tipo", "grupo", "chave")
VALUES
  ('Vendas do salão', 'RECEBER', 'RECEITA_VENDAS', 'VENDAS_SALAO'),
  ('Eventos', 'RECEBER', 'RECEITA_VENDAS', 'EVENTOS'),
  ('Delivery', 'RECEBER', 'RECEITA_VENDAS', NULL),
  ('Rendimentos de aplicação', 'RECEBER', 'FINANCEIRO', NULL),
  ('Aporte de sócio', 'RECEBER', 'FORA_DO_RESULTADO', NULL),
  ('Empréstimo recebido', 'RECEBER', 'FORA_DO_RESULTADO', NULL),
  ('Repasse da taxa de serviço', 'PAGAR', 'TAXA_SERVICO', 'REPASSE_TAXA_SERVICO'),
  ('Simples Nacional (DAS)', 'PAGAR', 'IMPOSTOS', NULL),
  ('Insumos de cozinha', 'PAGAR', 'CMV', 'INSUMOS'),
  ('Bebidas', 'PAGAR', 'CMV', NULL),
  ('Embalagens para viagem', 'PAGAR', 'CMV', NULL),
  ('Salários', 'PAGAR', 'PESSOAL', NULL),
  ('Encargos (FGTS, INSS)', 'PAGAR', 'PESSOAL', NULL),
  ('Vale-transporte e benefícios', 'PAGAR', 'PESSOAL', NULL),
  ('Freelancers', 'PAGAR', 'PESSOAL', NULL),
  ('Férias, 13º e rescisões', 'PAGAR', 'PESSOAL', NULL),
  ('Pró-labore', 'PAGAR', 'PESSOAL', NULL),
  ('Aluguel', 'PAGAR', 'OCUPACAO', NULL),
  ('Energia elétrica', 'PAGAR', 'OCUPACAO', NULL),
  ('Água', 'PAGAR', 'OCUPACAO', NULL),
  ('IPTU e taxas da prefeitura', 'PAGAR', 'OCUPACAO', NULL),
  ('Gás', 'PAGAR', 'OPERACIONAL', NULL),
  ('Manutenção e reparos', 'PAGAR', 'OPERACIONAL', NULL),
  ('Material de limpeza', 'PAGAR', 'OPERACIONAL', NULL),
  ('Utensílios e louças', 'PAGAR', 'OPERACIONAL', NULL),
  ('Contabilidade', 'PAGAR', 'ADMINISTRATIVO', NULL),
  ('Sistemas, internet e telefone', 'PAGAR', 'ADMINISTRATIVO', NULL),
  ('Aluguel de maquininha', 'PAGAR', 'ADMINISTRATIVO', NULL),
  ('Publicidade e redes sociais', 'PAGAR', 'MARKETING', NULL),
  ('Tarifas bancárias', 'PAGAR', 'FINANCEIRO', NULL),
  ('Juros e multas', 'PAGAR', 'FINANCEIRO', NULL),
  ('Retirada de sócios', 'PAGAR', 'FORA_DO_RESULTADO', NULL),
  ('Investimentos e equipamentos', 'PAGAR', 'FORA_DO_RESULTADO', NULL),
  ('Pagamento de empréstimo', 'PAGAR', 'FORA_DO_RESULTADO', NULL);

-- Duas contas para começar: a gaveta e o banco. Saldo zero a partir de hoje;
-- a casa acerta o saldo real em Contas.
INSERT INTO "contas_financeiras" ("nome", "tipo", "saldoInicialEm")
VALUES ('Caixa da loja', 'CAIXA', CURRENT_DATE), ('Conta principal', 'BANCO', CURRENT_DATE);

-- As formas de sempre, com taxa zero: cada maquininha tem a sua, e quem
-- sabe o número é a casa. Os prazos são os comuns do mercado.
INSERT INTO "formas_recebimento" ("nome", "tipo", "taxaPct", "prazoDias", "contaId", "ordem")
SELECT v.nome, v.tipo::"TipoFormaRecebimento", 0, v.prazo, c."id", v.ordem
FROM (VALUES
  ('Dinheiro', 'DINHEIRO', 0, 'Caixa da loja', 1),
  ('Pix', 'PIX', 0, 'Conta principal', 2),
  ('Débito', 'DEBITO', 1, 'Conta principal', 3),
  ('Crédito', 'CREDITO', 30, 'Conta principal', 4),
  ('Vale-refeição', 'VOUCHER', 30, 'Conta principal', 5)
) AS v(nome, tipo, prazo, conta, ordem)
JOIN "contas_financeiras" c ON c."nome" = v.conta;
