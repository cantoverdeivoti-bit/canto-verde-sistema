-- Papéis por função de verdade, não por grau de acesso.
--
-- "OPERACAO" era genérico demais: quem opera o caixa e quem cuida do dinheiro
-- precisam de telas diferentes, não de graus diferentes da mesma permissão.
--
-- Postgres não remove valor de enum que já existe no tipo, então o caminho é
-- criar o tipo novo, converter a coluna e trocar os dois. O DEFAULT sai antes
-- da conversão porque um default do tipo antigo impede o ALTER COLUMN TYPE.
--
-- OPERACAO vira CAIXA: é o papel que herda o mesmo trabalho. Hoje não existe
-- nenhuma linha nesse papel — a única conta é DONO — mas o CASE fica porque
-- migração que assume o estado do banco quebra no primeiro banco diferente.

CREATE TYPE "UserRole_new" AS ENUM ('DONO', 'GERENTE', 'CAIXA', 'FINANCEIRO');

ALTER TABLE "admin_users" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "admin_users"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING (
    CASE "role"::text
      WHEN 'OPERACAO' THEN 'CAIXA'
      ELSE "role"::text
    END
  )::"UserRole_new";

DROP TYPE "UserRole";

ALTER TYPE "UserRole_new" RENAME TO "UserRole";

-- Conta criada sem escolha explícita nasce no papel mais restrito.
ALTER TABLE "admin_users" ALTER COLUMN "role" SET DEFAULT 'CAIXA';
