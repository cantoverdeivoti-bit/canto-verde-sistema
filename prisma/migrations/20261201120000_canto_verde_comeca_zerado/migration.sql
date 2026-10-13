-- Canto Verde começa zerado.
--
-- As migrations anteriores vieram do sistema do Ponto Zero Sete e trazem dados
-- daquela casa (cardápio do buffet, receitas e insumos com preços, postos da
-- escala). Aqui eles saem. Fica só a estrutura que serve a qualquer casa:
-- categorias de compra, plano de contas, centros de custo, funções, EPI e os
-- grupos do buffet.

-- Buffet do Ponto Zero Sete: pratos, cardápios e o mapa.
DELETE FROM "buffet_cardapio_itens";
DELETE FROM "buffet_trocas";
DELETE FROM "buffet_cardapio_dias";
DELETE FROM "buffet_cardapios";
DELETE FROM "buffet_sugestoes";
DELETE FROM "buffet_pesos";
DELETE FROM "buffet_clientes_do_dia";
DELETE FROM "buffet_mapa_posicoes";
DELETE FROM "buffet_pratos";

-- Receituário do Ponto Zero Sete: fichas, ingredientes e insumos.
DELETE FROM "receituario_ingredientes";
DELETE FROM "receituario_fotos";
DELETE FROM "receituario_vendas_extras";
DELETE FROM "receituario_vendas";
DELETE FROM "receituario_fichas";
DELETE FROM "receituario_insumos";

-- Postos da escala do Canto Verde (fim de semana).
DELETE FROM "postos_da_escala";
INSERT INTO "postos_da_escala" ("area", "nome", "ordem") VALUES
  ('COZINHA', 'Fogão', 1),
  ('COZINHA', 'Chapa', 2),
  ('COZINHA', 'Fritadeira', 3),
  ('COZINHA', 'Salada', 4),
  ('COZINHA', 'Churrasqueira', 5),
  ('COZINHA', 'Louça', 6),
  ('SALAO', 'Bebida', 1),
  ('SALAO', 'Passando carne', 2),
  ('SALAO', 'Passando massa', 3),
  ('SALAO', 'Copa', 4),
  ('SALAO', 'Área externa: carne', 5),
  ('SALAO', 'Área externa: bebida', 6),
  ('SALAO', 'Área externa: massa', 7);
