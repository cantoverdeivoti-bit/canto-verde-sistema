-- Correção de cadastro sugerida também na cotação (não só na contagem): a
-- contagem passa a ser opcional, e a correção guarda a cotação e quem sugeriu.
ALTER TABLE "contagem_produto_correcoes" ALTER COLUMN "contagemId" DROP NOT NULL;
ALTER TABLE "contagem_produto_correcoes" ADD COLUMN "cotacaoId" INTEGER;
ALTER TABLE "contagem_produto_correcoes" ADD COLUMN "sugeridoPorId" INTEGER;

ALTER TABLE "contagem_produto_correcoes" ADD CONSTRAINT "contagem_produto_correcoes_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "cotacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contagem_produto_correcoes" ADD CONSTRAINT "contagem_produto_correcoes_sugeridoPorId_fkey" FOREIGN KEY ("sugeridoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
