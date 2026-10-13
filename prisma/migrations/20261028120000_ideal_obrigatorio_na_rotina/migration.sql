-- Compra de rotina: o ideal de cada produto no dia passa a ser obrigatório.
-- Quem estava vazio (usava o ideal do cadastro) recebe o ideal do cadastro;
-- quem não tinha ideal em lugar nenhum nunca entrava no pedido e sai do dia.
UPDATE "lista_compra_itens" AS i
   SET "idealStock" = p."idealStock"
  FROM "products" AS p
 WHERE i."produtoId" = p."id"
   AND i."idealStock" IS NULL
   AND p."idealStock" IS NOT NULL;

DELETE FROM "lista_compra_itens" WHERE "idealStock" IS NULL;

-- AlterTable
ALTER TABLE "lista_compra_itens" ALTER COLUMN "idealStock" SET NOT NULL;

-- A contagem guarda o recado dos pedidos da compra de rotina que saíram dela.
ALTER TABLE "contagens" ADD COLUMN "recado" TEXT;
