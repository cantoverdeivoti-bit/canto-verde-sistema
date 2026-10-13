-- Até quando o fornecedor pode responder a cotação.
--
-- O dono escolhe em cada cotação, na tela de Fornecedores, antes de mandar
-- os links. O link mostra "você tem até quarta, 24 de setembro às 18:00" com
-- o tempo que falta, e depois disso fecha: a página diz que o prazo terminou
-- e o envio é recusado. Prorrogar é mudar a data.
--
-- Nulo é o normal das cotações de antes e de quem não definir: sem prazo, o
-- link fica aberto até a cotação ser fechada, como sempre foi.
ALTER TABLE "cotacoes" ADD COLUMN "prazoResposta" TIMESTAMP(3);
