-- O texto das fichas veio da planilha com travessão ("não se aplica — preparo
-- frio", "Forno — integral"), e o padrão das telas não usa travessão. Troca
-- " — " por ", " nos campos de texto da ficha e no preparo dos ingredientes,
-- só onde ele aparece. O resto do texto fica como está.
UPDATE "receituario_fichas"
SET "passos" = ARRAY(SELECT REPLACE(p, ' — ', ', ') FROM unnest("passos") WITH ORDINALITY AS t(p, i) ORDER BY i)
WHERE array_to_string("passos", '|') LIKE '% — %';

UPDATE "receituario_fichas" SET "observacoes" = REPLACE("observacoes", ' — ', ', ') WHERE "observacoes" LIKE '% — %';
UPDATE "receituario_fichas" SET "ajusteForno" = REPLACE("ajusteForno", ' — ', ', ') WHERE "ajusteForno" LIKE '% — %';
UPDATE "receituario_fichas" SET "viabilidade" = REPLACE("viabilidade", ' — ', ', ') WHERE "viabilidade" LIKE '% — %';
UPDATE "receituario_fichas" SET "utensilios" = REPLACE("utensilios", ' — ', ', ') WHERE "utensilios" LIKE '% — %';
UPDATE "receituario_fichas" SET "pontoDeControle" = REPLACE("pontoDeControle", ' — ', ', ') WHERE "pontoDeControle" LIKE '% — %';
UPDATE "receituario_fichas" SET "montagem" = REPLACE("montagem", ' — ', ', ') WHERE "montagem" LIKE '% — %';
UPDATE "receituario_fichas" SET "armazenamento" = REPLACE("armazenamento", ' — ', ', ') WHERE "armazenamento" LIKE '% — %';
UPDATE "receituario_ingredientes" SET "preparo" = REPLACE("preparo", ' — ', ', ') WHERE "preparo" LIKE '% — %';
