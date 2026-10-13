-- CreateTable
CREATE TABLE "tokens_de_acesso" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "hash" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usadoEm" TIMESTAMP(3),
    "revogadoEm" TIMESTAMP(3),

    CONSTRAINT "tokens_de_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tokens_de_acesso_hash_key" ON "tokens_de_acesso"("hash");

-- CreateIndex
CREATE INDEX "tokens_de_acesso_userId_idx" ON "tokens_de_acesso"("userId");

-- AddForeignKey
ALTER TABLE "tokens_de_acesso" ADD CONSTRAINT "tokens_de_acesso_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
