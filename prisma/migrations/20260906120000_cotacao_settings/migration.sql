-- Configuração da cotação: por enquanto, uma mensagem só.
--
-- A linha id=1 nasce aqui, na migration, e não só no seed: o seed de produção
-- roda uma única vez, na estreia, e não a cada deploy. Criar a linha aqui é o
-- que garante que a tela de Configurações abra preenchida em vez de pedir
-- "rode o seed" para quem só fez deploy.
--
-- `mensagemFornecedor` nasce nula de propósito: sem texto configurado, a
-- página do fornecedor usa MENSAGEM_COTACAO_PADRAO, de lib/cotacao-labels.ts.
-- O padrão no código, e não como default de coluna, é o que faz um banco novo
-- funcionar e o que permite melhorar o texto depois sem congelá-lo aqui.
--
-- `updatedAt` é @updatedAt do Prisma — aplicação, não banco — então não tem
-- default e precisa ser informado neste INSERT.

CREATE TABLE "cotacao_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mensagemFornecedor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotacao_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "cotacao_settings" ("id", "updatedAt")
VALUES (1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
