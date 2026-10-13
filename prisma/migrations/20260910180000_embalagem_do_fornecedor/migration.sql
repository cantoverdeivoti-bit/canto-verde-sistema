-- A embalagem do fornecedor vira a unidade da casa.
--
-- A casa conta em un e kg. O fornecedor vende em fardo, bombona, caixa, peça —
-- e cada um vende de um jeito. O link pedia "preço unitário" e empurrava a
-- divisão para a cabeça dele, sem guardar em lugar nenhum quanto tinha dentro
-- da embalagem. Três fornecedores respondiam três coisas que não se comparavam,
-- e era isso que estragava a cotação.
--
-- Agora ele declara a embalagem e o conteúdo, e o sistema faz a conta.

ALTER TABLE "precos" ADD COLUMN "embalagem" TEXT;
ALTER TABLE "precos" ADD COLUMN "conteudo" DECIMAL(10,3);
ALTER TABLE "precos" ADD COLUMN "precoEmbalagem" DECIMAL(10,2);

-- `precoUnitario` NÃO muda de significado: continua sendo o preço por unidade
-- da casa. Ele só deixa de ser digitado e passa a ser calculado. É de
-- propósito — esse número aparece em cinquenta lugares, do comparativo ao
-- histórico de preço, e é ele que torna dois fornecedores comparáveis.
-- As linhas que já existem continuam válidas, com as três colunas novas nulas:
-- nulo aqui é "não perguntamos", não "vende avulso".

-- O que ele respondeu sobre o item.
--
-- Antes, "não tenho" era o campo de preço em branco, indistinguível de "pulei
-- essa linha". A casa lia célula vazia como silêncio e esperava por uma
-- resposta que já tinha chegado.
CREATE TYPE "PrecoStatus" AS ENUM ('OFERTADO', 'SEM_ESTOQUE', 'NAO_TRABALHA');

ALTER TABLE "precos"
  ADD COLUMN "estatus" "PrecoStatus" NOT NULL DEFAULT 'OFERTADO';
