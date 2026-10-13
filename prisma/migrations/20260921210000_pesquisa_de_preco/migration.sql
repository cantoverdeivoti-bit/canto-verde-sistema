-- Pesquisa de preço: a casa pergunta sobre o que não compra.
--
-- A rodada de cotação é a única hora da semana em que sete fornecedores estão
-- olhando para a mesma tela. A pergunta "você tem azeite trufado, e por
-- quanto?" ficava para um WhatsApp que nunca saía; aqui ela custa uma linha
-- de texto e pega carona no link que já vai ser mandado.
--
-- É o espelho de `cotacao_produtos_novos`, onde o FORNECEDOR oferece o que a
-- casa não compra. Aqui é a casa que pergunta.
--
-- Texto livre, e não um `produtoId`: o ponto é justamente não ter cadastro.
-- Obrigar a cadastrar o produto antes de perguntar se alguém o vende
-- inverteria a ordem das coisas, e encheria o catálogo de itens que a casa
-- nunca comprou.
--
-- Nada muda no que já existe. As duas tabelas nascem vazias, e cotação que
-- não tiver pergunta nenhuma continua exatamente como está.
CREATE TABLE "pesquisa_precos" (
    "id" SERIAL NOT NULL,
    "cotacaoId" INTEGER NOT NULL,
    "descricao" TEXT NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pesquisa_precos_pkey" PRIMARY KEY ("id")
);

-- `temProduto` é o campo que faz a pesquisa valer: sem ele, "não tenho" e
-- "não respondi" seriam a mesma linha vazia, e a casa ficaria esperando uma
-- resposta que já veio.
--
-- Preço nulo com `temProduto` verdadeiro é o caso real de quem tem mas precisa
-- consultar — melhor guardar "tem, preço a ver" do que obrigá-lo a inventar um
-- número para conseguir mandar a resposta.
CREATE TABLE "pesquisa_respostas" (
    "id" SERIAL NOT NULL,
    "pesquisaId" INTEGER NOT NULL,
    "cotacaoFornecedorId" INTEGER NOT NULL,
    "temProduto" BOOLEAN NOT NULL,
    "precoUnitario" DECIMAL(10,2),
    "embalagem" TEXT,
    "marca" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pesquisa_respostas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pesquisa_precos_cotacaoId_idx" ON "pesquisa_precos"("cotacaoId");

CREATE INDEX "pesquisa_respostas_cotacaoFornecedorId_idx" ON "pesquisa_respostas"("cotacaoFornecedorId");

-- Uma resposta por fornecedor por pergunta: ele volta ao link e corrige a
-- mesma linha, em vez de deixar duas versões e a dúvida de qual vale.
CREATE UNIQUE INDEX "pesquisa_respostas_pesquisaId_cotacaoFornecedorId_key" ON "pesquisa_respostas"("pesquisaId", "cotacaoFornecedorId");

-- Apagar a cotação leva as perguntas, e apagar a pergunta leva as respostas:
-- resposta sobre uma pergunta que não existe mais não é histórico de nada.
ALTER TABLE "pesquisa_precos" ADD CONSTRAINT "pesquisa_precos_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "cotacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pesquisa_respostas" ADD CONSTRAINT "pesquisa_respostas_pesquisaId_fkey" FOREIGN KEY ("pesquisaId") REFERENCES "pesquisa_precos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pesquisa_respostas" ADD CONSTRAINT "pesquisa_respostas_cotacaoFornecedorId_fkey" FOREIGN KEY ("cotacaoFornecedorId") REFERENCES "cotacao_fornecedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
