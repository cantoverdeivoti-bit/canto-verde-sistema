# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**O dono do Canto Verde** é o usuário primário do painel. Ele opera durante
o serviço — no celular enquanto anda pelo salão, ou no computador do balcão —
com pouco tempo e as mãos ocupadas. Hoje é a única conta. **Dar acesso à
equipe (garçom, recepção) é intenção declarada, ainda sem data**; papéis e
permissões são decisão em aberto e nada deve assumir "um usuário só".

**O cliente que reserva** chega quase sempre pelo celular, vindo do Instagram
ou do WhatsApp. Não tem conta, não faz login, e provavelmente nunca voltará à
mesma tela duas vezes. O trabalho dele é um só: garantir a mesa e sair.

## Product Purpose

Guardar mesa sem telefonema. O cliente escolhe o dia e recebe a confirmação na
hora; o dono vê quem vem e age sobre cada reserva. Sucesso é o cliente
resolver em menos de um minuto, no celular, sem ajuda — e o salão nunca
receber mais gente do que cabe.

## Positioning

Duas decisões de mecanismo que um concorrente não copia sem refazer o modelo:

**A lotação é estrutural, não uma checagem.** `totalCapacity` não tem valor
padrão no schema: o sistema não opera sem saber quantos lugares existem, e a
conferência acontece dentro da transação de gravação. Overbooking é
impossível por construção, não improvável por validação.

**O horário deriva do dia; ninguém digita hora.** A grade da casa é a fonte
única de "que horas sentamos gente", e tanto a tela pública quanto os
formulários do painel leem dela. Isso elimina a classe inteira de erro em que
alguém marca um horário que a casa não atende.

## Operating Context

Restaurante rural e espaço de eventos em **Ivoti, Rio Grande do Sul**
(agroturismo). A lotação do salão para reservas começa em 100 pessoas e é
ajustada pelo dono em Comercial → Configurações.

O ponto de partida é **almoço de sábado e domingo, assento único às 11:30**.
Isso é configuração, não verdade fixa: toda funcionalidade precisa continuar
correta com outros dias e dois ou mais horários. A política da casa é
reservar até 90% do espaço e completar o resto pela fila de espera, sem
passar da lotação.

O painel é usado **durante o serviço**, não em planejamento calmo. A agenda do
dia é a tela de trabalho; as configurações são visitadas raramente.

O sistema é **um ecossistema de módulos do restaurante**, não um app de
reservas. O primeiro é **Comercial** — tudo que traz gente para a mesa: a
agenda de reservas, o CRM e as regras da casa. Reservas é uma seção dele, não
o produto inteiro.

Depois vieram **Compras** (contagem de estoque, compras de rotina, cotação,
pedidos, recebimento e relatórios), **Departamento pessoal** (escala do
almoço, colaboradores, férias e custo de mão de obra), **Financeiro** (contas
a pagar e a receber, fechamento do dia, conciliação, DRE e o pacote do
contador), **Cardápio buffet** (cardápio da semana, produção, forno e mapa),
**Operacional** (funções, checklists para imprimir por departamento,
processos e treinamento), **Receituário**, **Tarefas** e a **Agenda** geral,
que junta o que cada módulo tem com data.

O **Receituário** guarda todas as receitas da casa num lugar só, para as
operações de hoje (buffet, delivery, eventos) e as que vêm (congelados,
encomendas). Cada ficha tem duas partes, cada uma com a sua folha A4 e a
faixa da cor da categoria: a operacional, da cozinha (ingredientes,
passos, forno, utensílios, ponto de controle, montagem), que não mostra
valor nenhum; e a técnica, da gestão (preço e custo de cada ingrediente,
custo da receita e da porção, preço sugerido), que só quem configura o
módulo vê. O custo do
insumo vem da última compra do produto ligado em Compras, ou do preço
digitado, e o pré-preparo usado como ingrediente entra pelo custo da ficha
dele. É a fonte única: o prato do buffet ligado pelo código da ficha recebe
o custo/kg dela, e o cardápio de evento é montado com fichas.

O estoque baixa por **contagem manual** (Contar estoque); a ficha técnica
ainda não dá baixa no estoque.

**Eventos** é o salão alugado no turno da noite (aniversário, corporativo,
formatura). É módulo à parte e não toca na reserva pública nem na lotação do
almoço. Orçamento e evento são o mesmo registro em fases diferentes
(rascunho, enviado, confirmado, realizado, perdido, cancelado), e os valores
do orçamento são copiados no momento em que entram: mudar o custo de uma
ficha não reescreve o que já foi mandado ao cliente. Os pratos do cardápio
são fichas do Receituário, cada um com a etapa do menu (entrada, principal,
sobremesa) que a proposta usa para agrupar.

`lib/modules.ts` é o registro único — home e barra lateral leem dele, e nada
mais precisa saber quantos módulos existem. `comandas` e `fidelidade` seguem
como marcadores desligados.

## Capabilities and Constraints

**Funciona hoje:** reserva pública em três etapas (dia, pessoas, quem é você);
aprovação automática até um limite de pessoas e manual acima dele; grade
semanal com turnos, feriados e datas especiais com lotação própria;
tolerância de atraso; cancelamento pelo cliente via link com token, sem
ligar; agenda do dia e busca global no painel; lista de clientes derivada das
reservas; aviso da casa editável, mostrado antes de confirmar; e-mail
opcional via Resend; link de WhatsApp com rascunho por estado da reserva.

**O telefone é a identidade do cliente.** Não existe tabela de cliente: duas
reservas com o mesmo número são a mesma pessoa. O número é normalizado para
E.164 na gravação, nos dois caminhos de escrita.

**Nada é enviado automaticamente por WhatsApp.** O link abre a conversa com o
texto na caixa; quem envia é o dono.

**Restrições e decisões em aberto:**
- Papéis e permissões: em aberto até a equipe entrar.
- Segundo serviço: previsto, sem data.
- `/admin/recuperar` é uma recuperação de senha **sem autenticação, marcada
  como provisória no próprio código, e precisa sair antes de divulgar o
  link.**
- O `.env` do projeto aponta para o **banco de produção** (Supabase). Os
  scripts `db:demo` e `db:test` escrevem e apagam dados reais.
- `paymentRequired` e fila de espera existem no schema mas não estão
  implementados; a página pública só menciona fila se ela estiver ligada.

## Brand Commitments

Nome **Canto Verde**, em Ivoti. Interface inteiramente em **português do
Brasil**, tratando o cliente por "você", em frases curtas e diretas.

A paleta da casa é **verde-mata, trigo, branco e terra**.

## Evidence on Hand

O sistema começa com o banco zerado: nenhuma reserva, produto, receita ou
pessoa veio do sistema de origem. Não existem depoimentos, imprensa, números de mercado,
casos de sucesso, preços ou métricas de uso — **nada disso deve ser inventado
em nenhuma superfície.**

Fotografia do restaurante, cardápio e identidade visual em arquivo não foram
fornecidos.

## Product Principles

1. **Não prometer o que o sistema não faz.** A página só menciona fila de
   espera se a fila estiver ligada; o link do WhatsApp não diz que avisou
   ninguém; o aviso de atraso não promete segurar a mesa além do que o dono
   decidiu.
2. **Derivar em vez de cravar.** Horário, disponibilidade e contagens saem da
   configuração e dos dados. Um número escrito à mão vira mentira no dia em
   que o modelo muda — e o modelo vai mudar.
3. **O erro não sobra para depois do toque.** Quem escolhe um dia está
   escolhendo um dia que existe: o que não dá para reservar não fica
   clicável.
4. **O dono opera com pressa.** No painel, a informação que resolve tem que
   estar legível de relance; ornamento que atrasa a leitura é custo.
5. **Um cliente é um telefone.** Enquanto não houver cadastro, a identidade é
   o número normalizado — e um número que não dá para chamar é um defeito de
   produto, não um detalhe.

## Accessibility & Inclusion

O cliente reserva no celular, muitas vezes na rua e com pressa; o dono usa o
painel em movimento. Compromissos já assumidos no código: `lang="pt-BR"` para
pronúncia correta em leitor de tela, foco sempre visível via `:focus-visible`,
`prefers-reduced-motion` respeitado, cor nunca como único portador de
significado, e nome acessível explícito onde o rótulo visível não basta.
