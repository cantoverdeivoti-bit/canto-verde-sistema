-- Categoria vira cadastro, e nascem os dois vínculos que a cotação vai usar.
--
-- Nada de dado é perdido: as nove categorias que existiam como enum entram
-- como linhas, e produto e fornecedor são religados a elas antes das colunas
-- antigas caírem. A coluna "legacy" existe só durante esta migração — é a
-- ponte entre o nome do enum e o nome de gente, e some no fim.

CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

ALTER TABLE "categories" ADD COLUMN "legacy" TEXT;

-- A ordem é a do mercado, não a do alfabeto: o que estraga primeiro vem
-- primeiro. Os saltos de dez deixam espaço para encaixar categoria nova no
-- meio sem renumerar as vizinhas.
INSERT INTO "categories" ("name", "legacy", "sortOrder") VALUES
  ('Hortifrúti',    'HORTIFRUTI',   10),
  ('Carnes',        'CARNES',       20),
  ('Laticínios',    'LATICINIOS',   30),
  ('Congelados',    'CONGELADOS',   40),
  ('Mercearia',     'MERCEARIA',    50),
  ('Bebidas',       'BEBIDAS',      60),
  ('Limpeza',       'LIMPEZA',      70),
  ('Descartáveis',  'DESCARTAVEIS', 80),
  ('Outros',        'OUTROS',       90);

-- ---------------------------------------------------------------------------
-- Produto: a categoria deixa de ser coluna de enum e vira referência.
-- ---------------------------------------------------------------------------

ALTER TABLE "products" ADD COLUMN "categoryId" INTEGER;

UPDATE "products" p
   SET "categoryId" = c."id"
  FROM "categories" c
 WHERE c."legacy" = p."category"::text;

DROP INDEX "products_category_idx";
ALTER TABLE "products" DROP COLUMN "category";

CREATE INDEX "products_categoryId_idx" ON "products"("categoryId");

-- SET NULL, não CASCADE: apagar a gaveta não pode apagar o que estava dentro.
ALTER TABLE "products"
  ADD CONSTRAINT "products_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Fornecedor: o array de enum vira tabela de ligação.
-- ---------------------------------------------------------------------------

CREATE TABLE "supplier_categories" (
    "supplierId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "supplier_categories_pkey" PRIMARY KEY ("supplierId", "categoryId")
);

CREATE INDEX "supplier_categories_categoryId_idx" ON "supplier_categories"("categoryId");

ALTER TABLE "supplier_categories"
  ADD CONSTRAINT "supplier_categories_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "supplier_categories"
  ADD CONSTRAINT "supplier_categories_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Uma linha por categoria que o fornecedor já tinha marcado no convite.
INSERT INTO "supplier_categories" ("supplierId", "categoryId")
SELECT s."id", c."id"
  FROM "suppliers" s
 CROSS JOIN LATERAL unnest(s."categories") AS antiga
  JOIN "categories" c ON c."legacy" = antiga::text;

ALTER TABLE "suppliers" DROP COLUMN "categories";

-- ---------------------------------------------------------------------------
-- Quem vende cada item. Nasce vazia: é vínculo que se faz à mão, item a item,
-- quando a categoria sozinha não dá conta.
-- ---------------------------------------------------------------------------

CREATE TABLE "product_suppliers" (
    "productId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_suppliers_pkey" PRIMARY KEY ("productId", "supplierId")
);

CREATE INDEX "product_suppliers_supplierId_idx" ON "product_suppliers"("supplierId");

ALTER TABLE "product_suppliers"
  ADD CONSTRAINT "product_suppliers_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_suppliers"
  ADD CONSTRAINT "product_suppliers_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- A ponte cai, e o enum com ela.
-- ---------------------------------------------------------------------------

ALTER TABLE "categories" DROP COLUMN "legacy";

DROP TYPE "ProductCategory";
