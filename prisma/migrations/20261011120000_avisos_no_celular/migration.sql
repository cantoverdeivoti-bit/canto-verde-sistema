-- Os aparelhos que recebem os avisos de Compras como notificação.

CREATE TABLE "celulares_de_aviso" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "aparelho" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "celulares_de_aviso_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "celulares_de_aviso_endpoint_key" ON "celulares_de_aviso"("endpoint");
CREATE INDEX "celulares_de_aviso_userId_idx" ON "celulares_de_aviso"("userId");

ALTER TABLE "celulares_de_aviso" ADD CONSTRAINT "celulares_de_aviso_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
