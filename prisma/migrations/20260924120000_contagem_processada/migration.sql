-- Quando a contagem virou compra.
--
-- Até aqui "gasta" era deduzido do que nasceu dela: uma cotação ou um pedido
-- direto. Com um pedido só por fornecedor, duas contagens juntas podem gerar
-- um pedido amarrado apenas à mais nova, e a outra ficaria sem nada — pronta
-- para ser escolhida de novo. `montarCotacao` passa a marcar todas.
--
-- Nula nas contagens de antes: para elas continuam valendo as regras antigas.
ALTER TABLE "contagens" ADD COLUMN "processadaEm" TIMESTAMP(3);
