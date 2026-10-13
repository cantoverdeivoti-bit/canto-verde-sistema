-- Duas linhas novas na DRE.
--
-- "Taxas de cartão e apps" tira a taxa da maquininha e a comissão do iFood
-- de dentro de "Impostos": é custo de vender, e o dono quer ver quanto é.
-- "Outras receitas" é a receita da operação que não é venda (couvert, rolha,
-- óleo usado), que antes só cabia em Vendas ou em Financeiro.
--
-- Fica numa migração só sua: o Postgres não deixa usar um valor novo de enum
-- na mesma transação em que ele nasce, e a migração seguinte usa os dois.
-- BEFORE deixa o enum na ordem do relatório, e ORDER BY grupo sai certo.

ALTER TYPE "GrupoDre" ADD VALUE 'OUTRAS_RECEITAS' BEFORE 'TAXA_SERVICO';
ALTER TYPE "GrupoDre" ADD VALUE 'TAXAS_E_APPS' BEFORE 'CMV';
