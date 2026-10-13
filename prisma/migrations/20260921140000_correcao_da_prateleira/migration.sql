-- O estoquista passa a poder dizer que o cadastro está errado.
--
-- Irmã de `contagem_produtos_novos` e o oposto dela: lá o produto não existe,
-- aqui existe e está descrito errado. "Coca-cola 350ml" que na prateleira é de
-- 310, item em `un` que se compra em `kg`, coisa guardada na gaveta que não é
-- a dela. Quem conta é quem vê, e até agora não tinha como avisar sem sair da
-- contagem.
--
-- Os três campos guardam a proposta inteira e não só o que mudou: o formulário
-- nasce preenchido com o cadastro de hoje, então gravar tudo custa o mesmo e
-- evita que nulo em `categoryId` signifique ao mesmo tempo "não mexi" e "tire
-- da gaveta".
--
-- A chave única por (contagem, produto) faz o reenvio corrigir a sugestão
-- anterior em vez de empilhar três versões da mesma reclamação.
--
-- O `ON DELETE CASCADE` no produto é rede de segurança, não rotina: produto é
-- desativado, nunca apagado. Se um dia sumir de verdade, a correção some junto
-- em vez de virar linha órfã apontando para nada.
CREATE TABLE "contagem_produto_correcoes" (
    "id" SERIAL NOT NULL,
    "contagemId" INTEGER NOT NULL,
    "produtoId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "unit" "ProductUnit" NOT NULL,
    "categoryId" INTEGER,
    "observacoes" TEXT,
    "status" "ProdutoNovoStatus" NOT NULL DEFAULT 'PENDENTE',
    "decididoEm" TIMESTAMP(3),
    "decididoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contagem_produto_correcoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contagem_produto_correcoes_status_idx" ON "contagem_produto_correcoes"("status");

CREATE UNIQUE INDEX "contagem_produto_correcoes_contagemId_produtoId_key" ON "contagem_produto_correcoes"("contagemId", "produtoId");

ALTER TABLE "contagem_produto_correcoes" ADD CONSTRAINT "contagem_produto_correcoes_contagemId_fkey" FOREIGN KEY ("contagemId") REFERENCES "contagens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contagem_produto_correcoes" ADD CONSTRAINT "contagem_produto_correcoes_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "contagem_produto_correcoes" ADD CONSTRAINT "contagem_produto_correcoes_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "contagem_produto_correcoes" ADD CONSTRAINT "contagem_produto_correcoes_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
