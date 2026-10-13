-- O plano de contas em três níveis: grupo da DRE > subgrupo > categoria.
--
-- O grupo continua fixo (é o desenho do relatório). O subgrupo é novo e da
-- casa: "Alimentos" e "Bebidas" no CMV, "Imóvel" e "Consumo" na Ocupação.
-- A categoria passa a morar num subgrupo e ganha ordem; o nome deixa de ser
-- único na tabela toda e passa a ser único dentro do subgrupo.
--
-- Nada se perde: toda categoria que existe ganha um subgrupo. As de fábrica
-- vão para o subgrupo certo pelo nome; as que a casa criou (ou renomeou) vão
-- para "Outros" do mesmo grupo, de onde o dono move quando quiser. As
-- categorias padrão que faltavam entram só se o nome ainda não existe.
--
-- Sem CHECK, como em toda migração deste projeto.

-- CreateTable
CREATE TABLE "subgrupos_financeiros" (
    "id" SERIAL NOT NULL,
    "nome" VARCHAR(60) NOT NULL,
    "grupo" "GrupoDre" NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subgrupos_financeiros_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subgrupos_financeiros_grupo_nome_key" ON "subgrupos_financeiros"("grupo", "nome");

-- Os subgrupos padrão, na ordem em que aparecem no grupo.
INSERT INTO "subgrupos_financeiros" ("nome", "grupo", "ordem") VALUES
  ('Salão', 'RECEITA_VENDAS', 1),
  ('Delivery', 'RECEITA_VENDAS', 2),
  ('Eventos', 'RECEITA_VENDAS', 3),
  ('Outras receitas', 'OUTRAS_RECEITAS', 1),
  ('Taxa de serviço', 'TAXA_SERVICO', 1),
  ('Impostos sobre vendas', 'IMPOSTOS', 1),
  ('Cartões', 'TAXAS_E_APPS', 1),
  ('Apps de delivery', 'TAXAS_E_APPS', 2),
  ('Alimentos', 'CMV', 1),
  ('Bebidas', 'CMV', 2),
  ('Embalagens e descartáveis', 'CMV', 3),
  ('Salários e encargos', 'PESSOAL', 1),
  ('Benefícios', 'PESSOAL', 2),
  ('Extras e rescisões', 'PESSOAL', 3),
  ('Imóvel', 'OCUPACAO', 1),
  ('Consumo', 'OCUPACAO', 2),
  ('Gás', 'OPERACIONAL', 1),
  ('Manutenção e limpeza', 'OPERACIONAL', 2),
  ('Utensílios', 'OPERACIONAL', 3),
  ('Serviços', 'ADMINISTRATIVO', 1),
  ('Licenças e direitos', 'ADMINISTRATIVO', 2),
  ('Divulgação', 'MARKETING', 1),
  ('Receitas financeiras', 'FINANCEIRO', 1),
  ('Despesas financeiras', 'FINANCEIRO', 2),
  ('Sócios', 'FORA_DO_RESULTADO', 1),
  ('Empréstimos', 'FORA_DO_RESULTADO', 2),
  ('Investimentos', 'FORA_DO_RESULTADO', 3);

-- AlterTable
ALTER TABLE "categorias_financeiras" ADD COLUMN "subgrupoId" INTEGER,
ADD COLUMN "ordem" INTEGER NOT NULL DEFAULT 0;

-- A taxa da maquininha e o aluguel dela saem de Impostos/Administrativo e
-- vão para a linha nova. Só se ainda estiverem onde a fábrica pôs.
UPDATE "categorias_financeiras" SET "grupo" = 'TAXAS_E_APPS' WHERE "chave" = 'TAXAS_CARTAO' AND "grupo" = 'IMPOSTOS';
UPDATE "categorias_financeiras" SET "grupo" = 'TAXAS_E_APPS' WHERE "nome" = 'Aluguel de maquininha' AND "grupo" = 'ADMINISTRATIVO';

-- "Eventos" e "Insumos de cozinha" tinham chave de sistema sem uso no código,
-- o que as travava à toa (sem mudar de grupo, desligar ou apagar).
UPDATE "categorias_financeiras" SET "chave" = NULL WHERE "chave" IN ('EVENTOS', 'INSUMOS');

-- Cada categoria de fábrica no seu subgrupo, pelo nome e pelo grupo atual
-- (se a casa mudou o grupo, a categoria fica em "Outros" do grupo novo).
UPDATE "categorias_financeiras" c
SET "subgrupoId" = s."id", "ordem" = m.ordem
FROM (VALUES
  ('Vendas do salão', 'Salão', 1),
  ('Delivery', 'Delivery', 1),
  ('Eventos', 'Eventos', 1),
  ('Repasse da taxa de serviço', 'Taxa de serviço', 1),
  ('Simples Nacional (DAS)', 'Impostos sobre vendas', 1),
  ('Taxas de cartão', 'Cartões', 1),
  ('Aluguel de maquininha', 'Cartões', 2),
  ('Insumos de cozinha', 'Alimentos', 1),
  ('Bebidas', 'Bebidas', 1),
  ('Embalagens para viagem', 'Embalagens e descartáveis', 1),
  ('Salários', 'Salários e encargos', 1),
  ('Encargos (FGTS, INSS)', 'Salários e encargos', 2),
  ('Pró-labore', 'Salários e encargos', 3),
  ('Vale-transporte e benefícios', 'Benefícios', 1),
  ('Freelancers', 'Extras e rescisões', 1),
  ('Férias, 13º e rescisões', 'Extras e rescisões', 2),
  ('Aluguel', 'Imóvel', 1),
  ('IPTU e taxas da prefeitura', 'Imóvel', 2),
  ('Energia elétrica', 'Consumo', 1),
  ('Água', 'Consumo', 2),
  ('Gás', 'Gás', 1),
  ('Manutenção e reparos', 'Manutenção e limpeza', 1),
  ('Material de limpeza', 'Manutenção e limpeza', 2),
  ('Utensílios e louças', 'Utensílios', 1),
  ('Contabilidade', 'Serviços', 1),
  ('Sistemas, internet e telefone', 'Serviços', 2),
  ('Publicidade e redes sociais', 'Divulgação', 1),
  ('Rendimentos de aplicação', 'Receitas financeiras', 1),
  ('Descontos obtidos', 'Receitas financeiras', 2),
  ('Tarifas bancárias', 'Despesas financeiras', 1),
  ('Juros e multas', 'Despesas financeiras', 2),
  ('Aporte de sócio', 'Sócios', 1),
  ('Retirada de sócios', 'Sócios', 2),
  ('Empréstimo recebido', 'Empréstimos', 1),
  ('Pagamento de empréstimo', 'Empréstimos', 2),
  ('Investimentos e equipamentos', 'Investimentos', 1)
) AS m(categoria, subgrupo, ordem)
JOIN "subgrupos_financeiros" s ON s."nome" = m.subgrupo
WHERE c."nome" = m.categoria AND s."grupo" = c."grupo";

-- O resto (criadas pela casa) vai para "Outros" do próprio grupo, depois
-- dos subgrupos de fábrica.
INSERT INTO "subgrupos_financeiros" ("nome", "grupo", "ordem")
SELECT DISTINCT 'Outros', c."grupo", 99 FROM "categorias_financeiras" c WHERE c."subgrupoId" IS NULL
ON CONFLICT ("grupo", "nome") DO NOTHING;

UPDATE "categorias_financeiras" c
SET "subgrupoId" = s."id", "ordem" = 100 + c."id"
FROM "subgrupos_financeiros" s
WHERE c."subgrupoId" IS NULL AND s."grupo" = c."grupo" AND s."nome" = 'Outros';

-- As categorias padrão que faltavam, só se o nome ainda não existe.
INSERT INTO "categorias_financeiras" ("nome", "tipo", "grupo", "subgrupoId", "ordem")
SELECT n.categoria, n.tipo::"TipoLancamento", s."grupo", s."id", n.ordem
FROM (VALUES
  ('Couvert artístico', 'RECEBER', 'Outras receitas', 'OUTRAS_RECEITAS', 1),
  ('Rolha', 'RECEBER', 'Outras receitas', 'OUTRAS_RECEITAS', 2),
  ('Venda de óleo usado', 'RECEBER', 'Outras receitas', 'OUTRAS_RECEITAS', 3),
  ('ICMS', 'PAGAR', 'Impostos sobre vendas', 'IMPOSTOS', 2),
  ('ISS', 'PAGAR', 'Impostos sobre vendas', 'IMPOSTOS', 3),
  ('Comissão de apps', 'PAGAR', 'Apps de delivery', 'TAXAS_E_APPS', 1),
  ('Carnes', 'PAGAR', 'Alimentos', 'CMV', 2),
  ('Hortifrúti', 'PAGAR', 'Alimentos', 'CMV', 3),
  ('Laticínios', 'PAGAR', 'Alimentos', 'CMV', 4),
  ('Padaria', 'PAGAR', 'Alimentos', 'CMV', 5),
  ('Descartáveis', 'PAGAR', 'Embalagens e descartáveis', 'CMV', 2),
  ('Alimentação da equipe', 'PAGAR', 'Benefícios', 'PESSOAL', 2),
  ('Uniformes e EPI', 'PAGAR', 'Benefícios', 'PESSOAL', 3),
  ('Medicina do trabalho', 'PAGAR', 'Benefícios', 'PESSOAL', 4),
  ('Condomínio', 'PAGAR', 'Imóvel', 'OCUPACAO', 3),
  ('Seguro', 'PAGAR', 'Imóvel', 'OCUPACAO', 4),
  ('Dedetização', 'PAGAR', 'Manutenção e limpeza', 'OPERACIONAL', 3),
  ('Lavanderia', 'PAGAR', 'Manutenção e limpeza', 'OPERACIONAL', 4),
  ('Alvarás e licenças', 'PAGAR', 'Licenças e direitos', 'ADMINISTRATIVO', 1),
  ('ECAD e música', 'PAGAR', 'Licenças e direitos', 'ADMINISTRATIVO', 2)
) AS n(categoria, tipo, subgrupo, grupo, ordem)
JOIN "subgrupos_financeiros" s ON s."nome" = n.subgrupo AND s."grupo" = n.grupo::"GrupoDre"
WHERE NOT EXISTS (SELECT 1 FROM "categorias_financeiras" x WHERE x."nome" = n.categoria);

-- Agora toda categoria tem subgrupo.
ALTER TABLE "categorias_financeiras" ALTER COLUMN "subgrupoId" SET NOT NULL;

-- O nome passa a ser único dentro do subgrupo.
DROP INDEX "categorias_financeiras_nome_key";
CREATE UNIQUE INDEX "categorias_financeiras_subgrupoId_nome_key" ON "categorias_financeiras"("subgrupoId", "nome");
CREATE INDEX "categorias_financeiras_subgrupoId_idx" ON "categorias_financeiras"("subgrupoId");

-- AddForeignKey
ALTER TABLE "categorias_financeiras" ADD CONSTRAINT "categorias_financeiras_subgrupoId_fkey" FOREIGN KEY ("subgrupoId") REFERENCES "subgrupos_financeiros"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
