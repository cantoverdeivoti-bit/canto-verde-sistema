-- O menu da tarefa: fixar, anexos e etiquetas.
--
-- O que o "⋯" de cada tarefa passou a oferecer, no lugar do menu do TickTick.
-- Subtarefa não aparece aqui: "tarefas"."tarefaPaiId" e "nivel" já existem
-- desde a migração do módulo, e só faltava a tela.
--
-- "tarefas"."fixadaEm" é data, e não booleano: a fixada mais recente vem
-- primeiro na coluna, e um booleano não sabe dizer qual é.
--
-- "anexos_tarefa" copia o desenho de "anexos_financeiros": o arquivo mora no
-- próprio banco, em BYTEA, sem conta nova de armazenamento para manter. O teto
-- de 4 MB por arquivo é conferido na rota de envio, não aqui. Sai junto com a
-- tarefa (CASCADE) quando a lixeira for esvaziada de vez.
--
-- "etiquetas" é do QUADRO, com nome único dentro dele. A regra de que
-- etiqueta não pode ter nome de pessoa (RN-020) fica em
-- lib/tarefas-etiquetas.ts, conferida na ação, que é onde dá para dizer a quem
-- digitou que a pessoa vai em "Quem faz".
--
-- Sem CHECK, como em toda migração deste projeto. Nada é populado.

-- AlterTable
ALTER TABLE "tarefas" ADD COLUMN     "fixadaEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "anexos_tarefa" (
    "id" SERIAL NOT NULL,
    "tarefaId" INTEGER NOT NULL,
    "nome" VARCHAR(160) NOT NULL,
    "mime" VARCHAR(80) NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "dados" BYTEA NOT NULL,
    "criadoPorId" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anexos_tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etiquetas" (
    "id" SERIAL NOT NULL,
    "projetoId" INTEGER NOT NULL,
    "nome" VARCHAR(30) NOT NULL,
    "criadoPorId" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etiquetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_etiquetas" (
    "tarefaId" INTEGER NOT NULL,
    "etiquetaId" INTEGER NOT NULL,

    CONSTRAINT "tarefa_etiquetas_pkey" PRIMARY KEY ("tarefaId","etiquetaId")
);

-- CreateIndex
CREATE INDEX "anexos_tarefa_tarefaId_idx" ON "anexos_tarefa"("tarefaId");

-- CreateIndex
CREATE UNIQUE INDEX "etiquetas_projetoId_nome_key" ON "etiquetas"("projetoId", "nome");

-- CreateIndex
CREATE INDEX "tarefa_etiquetas_etiquetaId_idx" ON "tarefa_etiquetas"("etiquetaId");

-- AddForeignKey
ALTER TABLE "anexos_tarefa" ADD CONSTRAINT "anexos_tarefa_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anexos_tarefa" ADD CONSTRAINT "anexos_tarefa_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas" ADD CONSTRAINT "etiquetas_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "projetos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas" ADD CONSTRAINT "etiquetas_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_etiquetas" ADD CONSTRAINT "tarefa_etiquetas_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "tarefas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_etiquetas" ADD CONSTRAINT "tarefa_etiquetas_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "etiquetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

