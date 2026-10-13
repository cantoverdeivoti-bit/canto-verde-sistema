-- De quem é a contagem.
--
-- Registro, não credencial: o estoquista conta pelo link, sem senha, e quem
-- abre a porta continua sendo o token. Isto existe para a lista dizer a quem a
-- casa pediu cada contagem — e para cobrar quem ficou de fazer.
--
-- Nulo porque as contagens que já existem foram abertas antes deste campo, e
-- ON DELETE SET NULL porque apagar uma conta não pode levar junto o histórico
-- de uma contagem que aconteceu.
ALTER TABLE "contagens" ADD COLUMN "responsavelId" INTEGER;

CREATE INDEX "contagens_responsavelId_idx" ON "contagens"("responsavelId");

ALTER TABLE "contagens"
  ADD CONSTRAINT "contagens_responsavelId_fkey"
  FOREIGN KEY ("responsavelId") REFERENCES "admin_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
