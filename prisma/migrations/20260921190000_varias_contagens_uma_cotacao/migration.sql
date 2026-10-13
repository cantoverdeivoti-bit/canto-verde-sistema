-- Várias contagens podem virar a mesma cotação.
--
-- O índice único amarrava uma contagem a uma cotação. Quem contava a despensa
-- em duas voltas — bebidas na segunda, secos na quarta — era obrigado a mandar
-- duas cotações ao mesmo fornecedor, na mesma semana, e a comparar preço em
-- duas telas. É a mesma dor que o dono relatou do sistema anterior.
--
-- O índice comum fica no lugar do único: é por ele que a tela de contagens
-- descobre o que já virou compra, e sem ele essa consulta viraria varredura.
--
-- Nada muda nos dados. As contagens que já apontam para uma cotação continuam
-- apontando, uma para cada — a diferença é que agora podem ser várias.
DROP INDEX "contagens_cotacaoId_key";

CREATE INDEX "contagens_cotacaoId_idx" ON "contagens"("cotacaoId");
