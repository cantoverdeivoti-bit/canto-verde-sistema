-- Listas de compra fixas: os produtos que se pedem a um fornecedor num dia da
-- semana ("Hortifruti Ivoti — segunda"). Contadas no dia, só com estes
-- produtos, e ao finalizar viram pedido para o fornecedor.
--
-- Só tabelas novas e uma coluna nula em contagens: nada do que existe muda.

CREATE TABLE "listas_compra" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(120) NOT NULL,
    "fornecedorId" INTEGER NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "responsavelId" INTEGER,
    "prazoHoras" INTEGER NOT NULL DEFAULT 12,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listas_compra_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lista_compra_itens" (
    "listaId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lista_compra_itens_pkey" PRIMARY KEY ("listaId","produtoId")
);

CREATE INDEX "listas_compra_diaSemana_idx" ON "listas_compra"("diaSemana");

ALTER TABLE "contagens" ADD COLUMN "listaCompraId" INTEGER;

ALTER TABLE "contagens" ADD CONSTRAINT "contagens_listaCompraId_fkey" FOREIGN KEY ("listaCompraId") REFERENCES "listas_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "listas_compra" ADD CONSTRAINT "listas_compra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listas_compra" ADD CONSTRAINT "listas_compra_responsavelId_fkey" FOREIGN KEY ("responsavelId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lista_compra_itens" ADD CONSTRAINT "lista_compra_itens_listaId_fkey" FOREIGN KEY ("listaId") REFERENCES "listas_compra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lista_compra_itens" ADD CONSTRAINT "lista_compra_itens_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
