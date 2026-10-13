-- DropIndex
DROP INDEX "contagem_itens_produtoId_idx";

-- DropIndex
DROP INDEX "contagens_token_idx";

-- DropIndex
DROP INDEX "cotacao_fornecedores_token_idx";

-- DropIndex
DROP INDEX "historico_precos_compra_produtoId_idx";

-- DropIndex
DROP INDEX "pedidos_compra_token_idx";

-- DropIndex
DROP INDEX "special_dates_date_idx";

-- DropIndex
DROP INDEX "user_module_permissions_userId_idx";

-- CreateIndex
CREATE INDEX "avaliacoes_qualidade_fornecedorId_idx" ON "avaliacoes_qualidade"("fornecedorId");

-- CreateIndex
CREATE INDEX "avisos_compra_lidoEm_idx" ON "avisos_compra"("lidoEm");

-- CreateIndex
CREATE INDEX "bonificacoes_estado_idx" ON "bonificacoes"("estado");

-- CreateIndex
CREATE INDEX "contagem_itens_produtoId_updatedAt_idx" ON "contagem_itens"("produtoId", "updatedAt");

-- CreateIndex
CREATE INDEX "contagens_processadaEm_idx" ON "contagens"("processadaEm");

-- CreateIndex
CREATE INDEX "lista_compra_itens_produtoId_idx" ON "lista_compra_itens"("produtoId");

-- CreateIndex
CREATE INDEX "pedidos_compra_entregaConfirmada_dataEntregaPrevista_idx" ON "pedidos_compra"("entregaConfirmada", "dataEntregaPrevista");
