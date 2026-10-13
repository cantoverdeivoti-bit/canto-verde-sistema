-- Logins com permissão por módulo.
--
-- O backfill no fim é a parte que não pode faltar: quem já existe vira DONO
-- com acesso a tudo. Sem ele, o primeiro deploy com as guardas ligadas
-- trancaria o dono para fora do próprio painel, e a recuperação seria acesso
-- direto ao banco.

CREATE TYPE "UserRole" AS ENUM ('DONO', 'GERENTE', 'OPERACAO');

ALTER TABLE "admin_users"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'OPERACAO',
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "user_module_permissions" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "moduleSlug" TEXT NOT NULL,
    "canConfigure" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_module_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_module_permissions_userId_moduleSlug_key"
  ON "user_module_permissions"("userId", "moduleSlug");

CREATE INDEX "user_module_permissions_userId_idx"
  ON "user_module_permissions"("userId");

ALTER TABLE "user_module_permissions"
  ADD CONSTRAINT "user_module_permissions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "admin_users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- --- Backfill -------------------------------------------------------------
-- Todo mundo que já existia é dono. Na prática é uma conta só, mas escrito
-- para qualquer quantidade.
UPDATE "admin_users" SET "role" = 'DONO', "isActive" = true;

-- E ganha acesso pleno a todos os módulos que existem hoje, inclusive os
-- desligados — permissão e prontidão são eixos separados, então conceder
-- agora evita ter que lembrar disso quando Suprimentos for construído.
INSERT INTO "user_module_permissions" ("userId", "moduleSlug", "canConfigure")
SELECT u."id", m."slug", true
FROM "admin_users" u
CROSS JOIN (VALUES
  ('comercial'),
  ('suprimentos'),
  ('comandas'),
  ('fidelidade'),
  ('sistema')
) AS m("slug")
ON CONFLICT ("userId", "moduleSlug") DO NOTHING;
