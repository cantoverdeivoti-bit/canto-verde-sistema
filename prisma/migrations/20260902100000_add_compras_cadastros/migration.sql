-- Módulo Compras: os dois cadastros que alimentam a cotação.
--
-- Ainda não há preço aqui. Preço é do fornecedor E do produto E da data, então
-- pertence à cotação — colocá-lo no cadastro obrigaria a um só preço por item,
-- que é exatamente o que cotar existe para negar.

CREATE TYPE "ProductUnit" AS ENUM ('UN', 'KG', 'G', 'L', 'ML', 'CX', 'PCT', 'MACO', 'DZ', 'FD');

CREATE TYPE "ProductCategory" AS ENUM (
  'HORTIFRUTI', 'CARNES', 'MERCEARIA', 'LATICINIOS', 'CONGELADOS',
  'BEBIDAS', 'LIMPEZA', 'DESCARTAVEIS', 'OUTROS'
);

CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    "address" TEXT,
    "deliveryDays" INTEGER,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "suppliers_isActive_idx" ON "suppliers"("isActive");

CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "category" "ProductCategory" NOT NULL DEFAULT 'OUTROS',
    "minStock" DECIMAL(10,3),
    "idealStock" DECIMAL(10,3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "products_category_idx" ON "products"("category");
CREATE INDEX "products_isActive_idx" ON "products"("isActive");

-- --- O slug mudou -----------------------------------------------------------
-- "suprimentos" era proposta minha para o módulo de estoque/cotação/compras.
-- O dono escolheu "Compras". As permissões já concedidas apontam para o slug
-- antigo; sem migrá-las, o dono ficaria sem acesso ao módulo que acabou de
-- pedir — e a tela de permissões ainda não existe para consertar isso pela
-- interface.
UPDATE "user_module_permissions" SET "moduleSlug" = 'compras'
WHERE "moduleSlug" = 'suprimentos';
