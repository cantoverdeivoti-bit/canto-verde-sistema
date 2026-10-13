-- Avisos de Compras: o que os fornecedores fizeram (responderam, faltaram,
-- entregaram), gravado no instante em que acontece. Só criação: nada existente muda.
CREATE TYPE "TipoAviso" AS ENUM ('PEDIDO_RESPONDIDO', 'ITEM_EM_FALTA', 'COTACAO_RESPONDIDA', 'COTACAO_RECUSADA', 'RECEBIDO_OK', 'RECEBIDO_COM_DIFERENCA');

CREATE TABLE "avisos_compra" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoAviso" NOT NULL,
    "fornecedorId" INTEGER,
    "pedidoId" INTEGER,
    "cotacaoId" INTEGER,
    "titulo" TEXT NOT NULL,
    "detalhe" TEXT,
    "itens" JSONB,
    "pedeAcao" BOOLEAN NOT NULL DEFAULT false,
    "resolvidoEm" TIMESTAMP(3),
    "lidoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_compra_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "avisos_compra_createdAt_idx" ON "avisos_compra"("createdAt");
CREATE INDEX "avisos_compra_pedeAcao_resolvidoEm_idx" ON "avisos_compra"("pedeAcao", "resolvidoEm");
CREATE INDEX "avisos_compra_pedidoId_idx" ON "avisos_compra"("pedidoId");

ALTER TABLE "avisos_compra" ADD CONSTRAINT "avisos_compra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "avisos_compra" ADD CONSTRAINT "avisos_compra_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "pedidos_compra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "avisos_compra" ADD CONSTRAINT "avisos_compra_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "cotacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
