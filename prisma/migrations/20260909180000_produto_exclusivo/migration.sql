-- Produto exclusivo: pula a cotação, vira pedido direto para um fornecedor
-- só. O preço vem do próprio fornecedor, pelo link — não é mais digitado à
-- mão no cadastro, que é o que fazia hortifrúti (preço que muda toda
-- semana) sair errado quase sempre.

-- A quem o produto pertence, e mais ninguém. Nulo é o normal.
ALTER TABLE "products" ADD COLUMN "exclusiveSupplierId" INTEGER;
ALTER TABLE "products"
  ADD CONSTRAINT "products_exclusiveSupplierId_fkey"
  FOREIGN KEY ("exclusiveSupplierId") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "products_exclusiveSupplierId_idx" ON "products"("exclusiveSupplierId");

-- Pedido de compra deixa de exigir uma cotação por trás: o pedido direto
-- nasce do produto ser exclusivo, sem comparação nenhuma.
ALTER TABLE "pedidos_compra" ALTER COLUMN "cotacaoId" DROP NOT NULL;

ALTER TABLE "pedidos_compra" DROP CONSTRAINT "pedidos_compra_cotacaoId_fkey";
ALTER TABLE "pedidos_compra"
  ADD CONSTRAINT "pedidos_compra_cotacaoId_fkey"
  FOREIGN KEY ("cotacaoId") REFERENCES "cotacoes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- A contagem que gerou o pedido direto, e o link que o fornecedor usa para
-- confirmar o preço sem login — os dois só existem no pedido direto.
ALTER TABLE "pedidos_compra" ADD COLUMN "contagemId" INTEGER;
ALTER TABLE "pedidos_compra" ADD COLUMN "token" VARCHAR(64);

ALTER TABLE "pedidos_compra"
  ADD CONSTRAINT "pedidos_compra_contagemId_fkey"
  FOREIGN KEY ("contagemId") REFERENCES "contagens"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "pedidos_compra_token_key" ON "pedidos_compra"("token");
CREATE INDEX "pedidos_compra_contagemId_idx" ON "pedidos_compra"("contagemId");
CREATE INDEX "pedidos_compra_token_idx" ON "pedidos_compra"("token");

-- O preço de um item de pedido direto nasce em branco — nulo é "o
-- fornecedor ainda não confirmou", diferente de zero. Todo item de pedido
-- vindo de cotação continua nascendo com preço preenchido; nada muda ali.
ALTER TABLE "pedido_compra_itens" ALTER COLUMN "precoUnitario" DROP NOT NULL;

-- Estado novo, só para o pedido direto: entre o link sair e o fornecedor
-- confirmar. Depois de confirmado, o pedido vira CRIADO — o mesmo repouso
-- em que um pedido de cotação já nasce hoje.
ALTER TYPE "PedidoCompraStatus" ADD VALUE 'AGUARDANDO_FORNECEDOR';
