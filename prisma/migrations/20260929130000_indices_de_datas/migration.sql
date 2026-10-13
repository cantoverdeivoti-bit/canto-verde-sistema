-- Índices para os filtros por data dos relatórios e telas de Compras, e para
-- o último custo de cada produto. Só índices: nada muda nos dados.
CREATE INDEX "contagens_concluida_dataContagem_idx" ON "contagens"("concluida", "dataContagem");
CREATE INDEX "pedidos_compra_entregaConfirmada_dataEntregaReal_idx" ON "pedidos_compra"("entregaConfirmada", "dataEntregaReal");
CREATE INDEX "pedidos_compra_createdAt_idx" ON "pedidos_compra"("createdAt");
CREATE INDEX "historico_precos_compra_produtoId_dataCompra_idx" ON "historico_precos_compra"("produtoId", "dataCompra" DESC);
