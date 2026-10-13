-- Contar estoque vira o começo, e quem conta é o estoquista pelo celular.
--
-- Contar era o primeiro passo DENTRO da cotação: as duas nasciam juntas, e
-- quem contava era quem comprava, logado no painel. Passa a ser o contrário —
-- o estoquista recebe um link, percorre a despensa e fecha a contagem; a
-- cotação nasce depois, de uma contagem já pronta.
--
-- Por isso `cotacaoId` deixa de ser obrigatório: uma contagem pode não virar
-- compra nenhuma, e isso é resultado legítimo, não pendência.
ALTER TABLE "contagens" ALTER COLUMN "cotacaoId" DROP NOT NULL;

-- O segredo do link, separado do id pela mesma razão do link de cancelamento
-- da reserva: endereço sequencial é adivinhável, e esta é porta de escrita sem
-- login. As linhas que já existem ganham um token descartável — elas são de
-- contagens feitas no painel, que nunca tiveram link.
ALTER TABLE "contagens" ADD COLUMN "token" TEXT;
UPDATE "contagens" SET "token" = 'legado-' || "id"::text WHERE "token" IS NULL;
ALTER TABLE "contagens" ALTER COLUMN "token" SET NOT NULL;
CREATE UNIQUE INDEX "contagens_token_key" ON "contagens"("token");
CREATE INDEX "contagens_token_idx" ON "contagens"("token");

-- Quando o link para de abrir. Quem inicia a contagem escolhe; 12h é o padrão
-- sugerido. As linhas antigas recebem uma data no passado: elas já acabaram,
-- e um link vencido é exatamente o que elas devem ser.
ALTER TABLE "contagens" ADD COLUMN "expiresAt" TIMESTAMP(3);
UPDATE "contagens" SET "expiresAt" = "createdAt" WHERE "expiresAt" IS NULL;
ALTER TABLE "contagens" ALTER COLUMN "expiresAt" SET NOT NULL;

-- O recorte de categorias que a contagem cobre. Vazio nas antigas: elas
-- cobriram o catálogo inteiro, que era o único modo possível.
ALTER TABLE "contagens" ADD COLUMN "categoryIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- Nulo é "não olhei", e é diferente de zero, que é "acabou". Item não olhado
-- não mexe no estoque nem entra na sugestão de compra. Antes toda linha era
-- obrigada a ter número, então quem não contava era forçado a mentir zero.
ALTER TABLE "contagem_itens" ALTER COLUMN "quantidadeContada" DROP NOT NULL;
