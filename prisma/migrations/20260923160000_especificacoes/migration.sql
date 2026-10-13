-- O que o produto TEM que ser, e o que a casa prefere que seja.
--
-- "Sobrecoxa resfriada": a casa exige resfriada, e fornecedor manda
-- congelada. Isso morava no texto livre do produto ("description"), que o
-- fornecedor lia — ou não — sem ter de dizer se atendia. Na entrega era tarde
-- para discordar.
--
-- Uma lista de {texto, obrigatoria}. JSON e não tabela pelo mesmo motivo de
-- "preferredBrands" ser array: é um recorte do cadastro do produto, que
-- ninguém vai listar nem renomear fora dele — e precisa do par texto +
-- obrigatória junto, que dois arrays paralelos deixariam desencontrar.
-- Vazio é o normal.
ALTER TABLE "products" ADD COLUMN "especificacoes" JSONB NOT NULL DEFAULT '[]';

-- O que o fornecedor respondeu sobre cada especificação, com o texto dela
-- copiado no momento da resposta: {texto, obrigatoria, atende}. Copiado, e
-- não referência, porque o cadastro pode mudar depois e o que ele confirmou
-- naquele dia não muda junto — é a mesma regra de "marca".
-- Nulo nas respostas de antes disto e nos produtos sem especificação.
ALTER TABLE "precos" ADD COLUMN "especificacoes" JSONB;
