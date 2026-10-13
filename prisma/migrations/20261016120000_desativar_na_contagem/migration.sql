-- O estoquista pode pedir, na contagem, para desativar um produto. Só vale
-- depois que o dono aceita em Pendências.

-- AlterTable
ALTER TABLE "contagem_produto_correcoes" ADD COLUMN     "desativar" BOOLEAN NOT NULL DEFAULT false;
