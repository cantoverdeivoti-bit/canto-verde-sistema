-- Cardápio buffet: as mudanças de quem não configura o módulo esperam aprovação.

-- CreateEnum
CREATE TYPE "TipoSugestaoBuffet" AS ENUM ('CARDAPIO', 'TROCA', 'DESFAZER_TROCA', 'PRATO_NOVO', 'PRATO', 'LIGAR_PRATO');

-- CreateTable
CREATE TABLE "buffet_sugestoes" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoSugestaoBuffet" NOT NULL,
    "status" "ProdutoNovoStatus" NOT NULL DEFAULT 'PENDENTE',
    "dados" JSONB NOT NULL,
    "resumo" VARCHAR(300) NOT NULL,
    "cardapioId" INTEGER,
    "data" DATE,
    "diaSemana" INTEGER,
    "grupoId" INTEGER,
    "posicao" INTEGER,
    "pratoId" INTEGER,
    "criadoPorId" INTEGER,
    "decididoPorId" INTEGER,
    "decididoEm" TIMESTAMP(3),
    "motivoRecusa" VARCHAR(200),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buffet_sugestoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "buffet_sugestoes_status_idx" ON "buffet_sugestoes"("status");

-- AddForeignKey
ALTER TABLE "buffet_sugestoes" ADD CONSTRAINT "buffet_sugestoes_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buffet_sugestoes" ADD CONSTRAINT "buffet_sugestoes_decididoPorId_fkey" FOREIGN KEY ("decididoPorId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

