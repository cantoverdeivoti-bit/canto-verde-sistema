-- Preço unitário com quatro casas, e não duas.
--
-- O preço por unidade sai de "preço da embalagem ÷ conteúdo". Com duas casas,
-- um pacote de 1000 unidades a R$ 15,00 virava R$ 0,02 a unidade (o certo é
-- 0,015), 33% acima, e o erro ia para a comparação e para o total do pedido.
-- Subtotais e totais continuam em centavos: só o preço por unidade ganha casas.
-- Ampliar a escala não perde nenhum valor já gravado.

ALTER TABLE "precos" ALTER COLUMN "precoUnitario" TYPE DECIMAL(12,4);
ALTER TABLE "precos" ALTER COLUMN "precoNegociadoDe" TYPE DECIMAL(12,4);
ALTER TABLE "pesquisa_respostas" ALTER COLUMN "precoUnitario" TYPE DECIMAL(12,4);
ALTER TABLE "pedido_compra_itens" ALTER COLUMN "precoUnitario" TYPE DECIMAL(12,4);
ALTER TABLE "pedido_compra_itens" ALTER COLUMN "precoPago" TYPE DECIMAL(12,4);
ALTER TABLE "pedido_compra_itens" ALTER COLUMN "precoEstimado" TYPE DECIMAL(12,4);
ALTER TABLE "historico_precos_compra" ALTER COLUMN "precoUnitario" TYPE DECIMAL(12,4);
