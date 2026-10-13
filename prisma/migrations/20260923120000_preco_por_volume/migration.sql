-- Preço por volume: "acima de 10 caixas, a caixa fica R$ 115".
--
-- O fornecedor negociava isso por telefone, depois da cotação, e a conversa
-- não ficava em lugar nenhum. Agora ele diz no próprio link, no fim de cada
-- produto, e a casa lê no comparativo ao lado do preço.
--
-- Os dois números na mesma medida de "precoEmbalagem": quantas embalagens
-- dele, e quanto cada uma passa a custar. Nulos juntos é o normal — não
-- ofereceu desconto —, e nenhuma linha de hoje precisa ser tocada.
--
-- Só informa. Nenhum total usa estas colunas: "precoUnitario" continua
-- sendo o preço da linha.
ALTER TABLE "precos" ADD COLUMN "descontoAcimaDe" DECIMAL(10,3),
                     ADD COLUMN "descontoPrecoEmbalagem" DECIMAL(10,2);
