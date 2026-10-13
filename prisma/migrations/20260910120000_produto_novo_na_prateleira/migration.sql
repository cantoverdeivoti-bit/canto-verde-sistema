-- Produto que estava na prateleira e não estava no cadastro.
--
-- A contagem é um recorte congelado do catálogo no momento em que ela abriu,
-- e o que não está na lista não existe para o sistema — o estoquista contava
-- em volta e o item sumia. Agora ele lança, e o dono autoriza ou não.
--
-- Tabela de espera, e não uma coluna "pendente" em products: produto meio
-- aprovado vazaria para a cotação, para o pedido e para a exportação, e
-- products.name não tem índice único para segurar o lixo.

CREATE TYPE "ProdutoNovoStatus" AS ENUM ('PENDENTE', 'APROVADO', 'RECUSADO');

CREATE TABLE "contagem_produtos_novos" (
    "id" SERIAL NOT NULL,
    "contagemId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "categoryId" INTEGER,
    "quantidade" DECIMAL(10,3) NOT NULL,
    "status" "ProdutoNovoStatus" NOT NULL DEFAULT 'PENDENTE',
    "produtoId" INTEGER,
    "decididoEm" TIMESTAMP(3),
    "decididoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contagem_produtos_novos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contagem_produtos_novos_contagemId_idx" ON "contagem_produtos_novos"("contagemId");
CREATE INDEX "contagem_produtos_novos_status_idx" ON "contagem_produtos_novos"("status");

-- Cada lado apaga de um jeito, e a diferença é a regra do negócio.
--
-- A sugestão morre com a contagem que a gerou: fora dela ela não quer dizer
-- nada. Mas sobrevive a apagar a categoria, a apagar o produto que ela virou
-- e a desligar quem decidiu — decisão tomada é história, e história não some
-- porque alguém arrumou um cadastro depois.
ALTER TABLE "contagem_produtos_novos"
  ADD CONSTRAINT "contagem_produtos_novos_contagemId_fkey"
  FOREIGN KEY ("contagemId") REFERENCES "contagens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contagem_produtos_novos"
  ADD CONSTRAINT "contagem_produtos_novos_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contagem_produtos_novos"
  ADD CONSTRAINT "contagem_produtos_novos_produtoId_fkey"
  FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contagem_produtos_novos"
  ADD CONSTRAINT "contagem_produtos_novos_decididoPorId_fkey"
  FOREIGN KEY ("decididoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
