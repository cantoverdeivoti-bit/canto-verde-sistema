-- Cadastro de fornecedor por convite.

ALTER TABLE "suppliers"
  ADD COLUMN "categories" "ProductCategory"[] DEFAULT ARRAY[]::"ProductCategory"[],
  ADD COLUMN "selfRegistered" BOOLEAN NOT NULL DEFAULT false;

-- Convite: serve uma vez e vence.
--
-- O segredo é o token, não o id. Um endereço sequencial seria adivinhável, e
-- esta é a primeira porta de escrita sem login fora da reserva pública —
-- mesma decisão do cancelToken da reserva.
CREATE TABLE "supplier_invites" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "usedAt" TIMESTAMP(3),
    "supplierId" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_invites_token_key" ON "supplier_invites"("token");
CREATE INDEX "supplier_invites_usedAt_idx" ON "supplier_invites"("usedAt");
