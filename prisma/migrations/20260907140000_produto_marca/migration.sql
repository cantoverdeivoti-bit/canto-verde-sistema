-- Marca preferida do produto, e se serve uma equivalente.
--
-- Isso vivia na cabeça de quem compra, ou espremido no nome do item ("Tomate
-- italiano Sabor da Terra"), o que sujava a busca e a lista de cotação.
--
-- `acceptsSimilarBrand` nasce false, e não true: o cadastro que ninguém
-- preencheu não pode ser lido como permissão para trocar a marca. Quem aceita
-- similar diz que aceita. Por isso tem DEFAULT — as linhas que já existem
-- precisam de um valor, e o valor seguro é o "não".
--
-- `preferredBrand` é nulo, sem default: sem marca definida é o caso normal.
ALTER TABLE "products" ADD COLUMN "preferredBrand" TEXT;
ALTER TABLE "products" ADD COLUMN "acceptsSimilarBrand" BOOLEAN NOT NULL DEFAULT false;
