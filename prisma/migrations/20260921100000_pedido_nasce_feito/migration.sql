-- O pedido direto deixa de esperar o fornecedor confirmar.
--
-- Ele nascia em AGUARDANDO_FORNECEDOR e só virava pedido de verdade quando o
-- fornecedor exclusivo preenchesse TODOS os preços pelo link. Na prática isso
-- não acontece: o dono relatou, e o banco confirma — nenhum pedido direto
-- saiu desse estado sozinho desde que ele existe. O efeito era mercadoria
-- chegando para um pedido que o sistema ainda tratava como consulta de preço,
-- e por isso invisível na tela de Recebimentos.
--
-- As linhas antigas viram CRIADO, que agora quer dizer "feito, esperando
-- chegar". O preço fica como está: zero aqui não é preço, é o lugar do item
-- que ninguém respondeu, e quem receber digita o da nota.
--
-- Os valores AGUARDANDO_FORNECEDOR e ENVIADO continuam no enum de propósito.
-- Tirar valor de enum no Postgres obriga a recriar o tipo e reescrever a
-- coluna, e o ganho seria cosmético — nada mais os escreve.
UPDATE "pedidos_compra"
   SET "estatus" = 'CRIADO'
 WHERE "estatus" = 'AGUARDANDO_FORNECEDOR';
