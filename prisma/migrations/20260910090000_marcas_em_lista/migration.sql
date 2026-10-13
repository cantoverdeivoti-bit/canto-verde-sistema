-- Marca de preferência vira lista.
--
-- Quase todo item aceita duas ou três marcas. Num campo de texto só, isso
-- era escrito como "Sadia ou Perdigão" — informação que existia para quem
-- lia e não existia para o sistema. Em lista, ela vira o que o fornecedor
-- escolhe na hora de dar o preço.

ALTER TABLE "products" ADD COLUMN "preferredBrands" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- O que já estava cadastrado vira o primeiro item da lista. Ninguém perde
-- a marca que digitou.
UPDATE "products"
   SET "preferredBrands" = ARRAY["preferredBrand"]
 WHERE "preferredBrand" IS NOT NULL AND btrim("preferredBrand") <> '';

ALTER TABLE "products" DROP COLUMN "preferredBrand";

-- Qual marca o fornecedor está oferecendo. Texto livre e não referência: a
-- lista do produto pode mudar depois, e o que foi oferecido naquele dia não
-- muda junto.
ALTER TABLE "precos" ADD COLUMN "marca" TEXT;
ALTER TABLE "pedido_compra_itens" ADD COLUMN "marca" TEXT;
