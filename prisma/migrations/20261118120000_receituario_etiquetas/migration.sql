-- Etiquetas nas fichas do Receituário: como a receita é feita (Assado,
-- Cozido, Grelhado, Outros). A lista que se escolhe fica na configuração do módulo.

-- AlterTable
ALTER TABLE "receituario_config" ADD COLUMN     "etiquetas" TEXT[] DEFAULT ARRAY['Assado', 'Cozido', 'Grelhado', 'Outros']::TEXT[];

-- AlterTable
ALTER TABLE "receituario_fichas" ADD COLUMN     "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[];
