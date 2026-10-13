-- As receitas de Eventos passam a ser fichas do Receituário.
--
-- Cada receita vira uma ficha com a operação Eventos, o código seguinte da
-- numeração (a letra da categoria no fim) e o custo por porção digitado de
-- hoje, que vale até alguém lançar os ingredientes. Os ingredientes em texto
-- vão para as observações e o preparo vira os passos. Os itens de cardápio
-- passam a apontar para a ficha e guardam a etapa do menu (entrada,
-- principal...), que era a categoria da receita. Os orçamentos já feitos
-- guardam a cópia dos números e não mudam.

-- A categoria da receita vira a etapa do item de cardápio.
ALTER TYPE "CategoriaReceita" RENAME TO "EtapaCardapio";

-- Uma coluna provisória guarda de qual receita a ficha nasceu, para os itens
-- de cardápio acharem a ficha certa. Sai no fim.
ALTER TABLE "receituario_fichas" ADD COLUMN "receitaDeEventos" INTEGER;

INSERT INTO "receituario_fichas" (
  "codigo", "nome", "categoria", "tipo", "operacoes", "porcoes", "passos", "observacoes",
  "alergenicos", "custoManualPorcao", "ativo", "updatedAt", "receitaDeEventos"
)
SELECT lpad((n."maior" + row_number() OVER (ORDER BY r."id"))::text, 3, '0') || m."letra",
       left(r."nome", 120),
       m."categoria",
       'PRONTA',
       ARRAY['EVENTOS'],
       1,
       array_remove(regexp_split_to_array(trim(coalesce(r."preparo", '')), '\s*\n\s*'), ''),
       nullif(concat_ws(E'\n\n',
         CASE WHEN r."unidade" <> 'porção' THEN 'A porção é: ' || r."unidade" || '.' END,
         CASE WHEN trim(coalesce(r."ingredientes", '')) <> '' THEN E'Ingredientes (do cadastro de Eventos):\n' || trim(r."ingredientes") END
       ), ''),
       r."alergenicos",
       r."custoPorcao",
       r."ativo",
       now(),
       r."id"
FROM "receitas" r
JOIN (VALUES
  ('ENTRADA', 'Petisco/Antepasto', 'A'),
  ('PRINCIPAL', 'Prato Principal', 'P'),
  ('ACOMPANHAMENTO', 'Acompanhamento', 'C'),
  ('SOBREMESA', 'Sobremesa', 'S'),
  ('FINGER_FOOD', 'Petisco/Antepasto', 'A'),
  ('BEBIDA', 'Bebida', 'D'),
  ('OUTRO', 'Prato Principal', 'P')
) AS m("etapa", "categoria", "letra") ON m."etapa" = r."categoria"::text
CROSS JOIN (
  SELECT coalesce(max(substring("codigo" from '^\d+')::int), 0) AS "maior" FROM "receituario_fichas"
) n;

-- O item de cardápio aponta para a ficha.
ALTER TABLE "cardapio_itens"
  ADD COLUMN "etapa" "EtapaCardapio" NOT NULL DEFAULT 'PRINCIPAL',
  ADD COLUMN "fichaId" INTEGER;

UPDATE "cardapio_itens" i
SET "fichaId" = f."id", "etapa" = r."categoria"
FROM "receitas" r
JOIN "receituario_fichas" f ON f."receitaDeEventos" = r."id"
WHERE r."id" = i."receitaId";

ALTER TABLE "cardapio_itens" ALTER COLUMN "fichaId" SET NOT NULL;
ALTER TABLE "receituario_fichas" DROP COLUMN "receitaDeEventos";

-- DropForeignKey
ALTER TABLE "cardapio_itens" DROP CONSTRAINT "cardapio_itens_receitaId_fkey";

-- DropIndex
DROP INDEX "cardapio_itens_receitaId_idx";

-- AlterTable
ALTER TABLE "cardapio_itens" DROP COLUMN "receitaId";

-- DropTable
DROP TABLE "receitas";

-- CreateIndex
CREATE INDEX "cardapio_itens_fichaId_idx" ON "cardapio_itens"("fichaId");

-- AddForeignKey
ALTER TABLE "cardapio_itens" ADD CONSTRAINT "cardapio_itens_fichaId_fkey" FOREIGN KEY ("fichaId") REFERENCES "receituario_fichas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
