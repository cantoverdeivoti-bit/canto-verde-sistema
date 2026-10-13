-- O produto que o fornecedor tem e a casa nunca pediu.
--
-- A cotação só mostra a ele o que a casa listou. Quem trabalha com algo que
-- não está no catálogo não tinha onde dizer isso, e a informação morria na
-- ligação: "aproveita que eu tenho azeite bom essa semana".
--
-- Tabela de espera, e não uma coluna "pendente" em products — produto meio
-- aprovado vazaria para a cotação, para o pedido e para a exportação, e
-- products.name não tem índice único para segurar o lixo. Vale ainda mais
-- aqui do que na contagem: quem escreve nesta tabela está do lado de fora,
-- com um link e nenhuma senha, e tem interesse comercial no que escreve.

CREATE TABLE "cotacao_produtos_novos" (
    "id" SERIAL NOT NULL,
    "cotacaoFornecedorId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "embalagem" TEXT NOT NULL,
    "conteudo" DECIMAL(10,3) NOT NULL,
    "precoEmbalagem" DECIMAL(10,2) NOT NULL,
    "marca" TEXT NOT NULL,
    "observacoes" TEXT,
    "status" "ProdutoNovoStatus" NOT NULL DEFAULT 'PENDENTE',
    "produtoId" INTEGER,
    "decididoEm" TIMESTAMP(3),
    "decididoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cotacao_produtos_novos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cotacao_produtos_novos_cotacaoFornecedorId_idx" ON "cotacao_produtos_novos"("cotacaoFornecedorId");
CREATE INDEX "cotacao_produtos_novos_status_idx" ON "cotacao_produtos_novos"("status");

-- Cada lado apaga de um jeito, e a diferença é a regra do negócio.
--
-- A oferta morre com o chamado que a gerou: fora daquela rodada ela não tem
-- de quem veio. Mas sobrevive a apagar o produto que ela virou e a desligar
-- quem decidiu — decisão tomada é história, e história não some porque
-- alguém arrumou um cadastro depois.
ALTER TABLE "cotacao_produtos_novos"
  ADD CONSTRAINT "cotacao_produtos_novos_cotacaoFornecedorId_fkey"
  FOREIGN KEY ("cotacaoFornecedorId") REFERENCES "cotacao_fornecedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cotacao_produtos_novos"
  ADD CONSTRAINT "cotacao_produtos_novos_produtoId_fkey"
  FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cotacao_produtos_novos"
  ADD CONSTRAINT "cotacao_produtos_novos_decididoPorId_fkey"
  FOREIGN KEY ("decididoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
