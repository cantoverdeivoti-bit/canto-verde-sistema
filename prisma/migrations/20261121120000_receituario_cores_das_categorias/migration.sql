-- A cor escolhida para cada categoria, { "Salada": "verde" }; só o que difere do padrão.
ALTER TABLE "receituario_config" ADD COLUMN "coresDasCategorias" JSONB NOT NULL DEFAULT '{}';
