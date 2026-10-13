-- O nome da compra de rotina passou a usar " · " entre o fornecedor e o dia
-- (nomeDaLista em lib/lista-compra.ts). As listas gravadas antes ainda têm o
-- travessão, e ele aparecia em Pedidos e Pendências. Só troca o separador:
-- o resto do nome fica como está.
UPDATE "listas_compra" SET "nome" = REPLACE("nome", ' — ', ' · ') WHERE "nome" LIKE '% — %';
