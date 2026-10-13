# Canto Verde: sistema da casa

Cópia adaptada do sistema do Ponto Zero Sete para o Canto Verde (Ivoti/RS):
nome, cores, ícone e escala trocados, e banco **zerado** (a migration
`20261201120000_canto_verde_comeca_zerado` tira o buffet, as receitas e os
insumos da casa de origem). Para publicar, veja **PUBLICAR-CANTO-VERDE.md**.

Sistema de reservas de mesas: uma página pública onde o cliente reserva
sozinho e um painel onde o restaurante gerencia.

A reserva é **por número de pessoas, não por mesa**: o salão tem uma lotação
total e o sistema soma quantas pessoas já estão reservadas em cada intervalo
de tempo antes de aceitar mais uma. Overbooking é bloqueado no banco, com
serialização de pedidos simultâneos (advisory lock por data).

## Como funciona a aprovação

| Tamanho do grupo | O que acontece |
|---|---|
| até 6 pessoas | confirma na hora (se houver lugar) |
| 7–8 pessoas | entra como **pendente** e aparece no painel para aprovação |
| acima de 8 | mensagem pedindo contato direto com o restaurante |

Os limites são configuráveis em **Painel → Regras**.

## Stack

Next.js (App Router) · Prisma 7 + Postgres (Supabase em produção) · Auth.js v5
(login do admin) · Tailwind · Zod · Web Push (avisos no celular) · Resend
(e-mail, hoje desligado, ver "E-mail").

## Rodando localmente

```bash
npm install
npx prisma dev --detach --name reservas   # Postgres local
cp .env.example .env                      # preencha AUTH_SECRET e ADMIN_INITIAL_PASSWORD
npx prisma migrate dev
npx prisma db seed
npm run dev
```

- Página pública: http://localhost:3000
- Painel: http://localhost:3000/admin (usuário e senha definidos no `.env`)

O Postgres local muda de porta se for recriado — confira com
`npx prisma dev ls` e ajuste `DATABASE_URL`.

## Ecossistema

O painel é uma casa para vários módulos internos — Reservas é o primeiro.
`/admin` é a home do ecossistema; cada módulo mora em `/admin/<slug>/...` e a
navegação é uma barra lateral em dois níveis (módulos → seções do módulo
ativo).

Para adicionar um módulo:

1. adicione a entrada em [lib/modules.ts](lib/modules.ts) (com
   `enabled: false` até estar pronto — aparece na home como "em preparação");
2. crie as rotas em `app/admin/<slug>/...` (o middleware já as protege);
3. troque para `enabled: true`. Home e barra lateral se ajustam sozinhas.

## O que o módulo Reservas faz

- **Agenda por turno** (almoço/jantar), com a hora como âncora e o **pico de
  ocupação simultânea** como métrica principal — não a soma do dia, que
  engana (almoço e jantar não disputam as mesmas cadeiras).
- **Anotar reserva de balcão**: o telefone tocou, o atendente registra na
  hora. As regras da página pública não se aplicam (quem atende decide);
  só a lotação continua inegociável.
- Aprovação de pendentes, cancelamento, chegada e falta com **confirmação
  inline** — sem diálogo do navegador.
- **Editar reserva na linha** (pessoas, data, hora, observações) — a
  capacidade do horário destino é conferida excluindo a própria reserva.
- **Busca em todas as datas**: com o campo de busca preenchido, a agenda
  varre de hoje em diante — quem liga raramente lembra a data.
- **Histórico do cliente** ao lado do telefone ("3ª visita · 1 falta"),
  agregado das reservas passadas pelo número.
- **Reserva pública duplicada é bloqueada** (mesmo telefone, horário
  sobreposto); o balcão pode duplicar de propósito.

## Lembrete pré-visita

`/api/cron/reminders` envia e-mail de lembrete para reservas confirmadas
dentro da janela de `sendReminderHours` (tela Avisos), no máximo uma vez por
reserva. O `vercel.json` agenda a chamada **uma vez por dia** (o plano Hobby
da Vercel não deixa mais que isso); a rota exige
`Authorization: Bearer $CRON_SECRET`. Sem `RESEND_API_KEY`, responde com
no-op explicado.

## E-mail

Desligado por decisão do dono (outubro de 2026): sem domínio próprio, o
Resend só entrega no e-mail da própria conta, e não valia a dor de cabeça.
Sem `RESEND_API_KEY` nada quebra: o envio é pulado, o lembrete de reserva não
sai e o relatório semanal de compras chega só como aviso no celular.

Para religar: domínio verificado no Resend, e na Vercel `RESEND_API_KEY`,
`RESEND_FROM` (ex.: `Canto Verde <avisos@seu-dominio>`) e `APP_URL` (o
endereço do site, para os links dos e-mails). Depois, Redeploy.

## Cancelamento pelo cliente

Cada reserva tem um link único de cancelamento (`/reserva/cancelar/[token]`),
mostrado na página de confirmação e enviado no e-mail (configure `APP_URL`
para o link sair correto). Renderizar a página **não** cancela — apps de
mensagem pré-carregam links; o cancelamento só acontece no clique, e apenas
até o horário da reserva.

## ⚠️ ANTES DE DIVULGAR O LINK — checklist de lançamento

- [x] Remover a recuperação de senha sem proteção (`app/admin/recuperar/`
      e a action que trocava a senha sem conferir nada): já saiu do código.
- [ ] Desligar as reservas no FastGet (dois sistemas juntos = overbooking).

## Migrations em produção

A publicação de produção aplica as migrations sozinha. O `npm run build` roda
`scripts/migrar-em-producao.mjs` entre o `prisma generate` e o `next build`, e
ele chama `prisma migrate deploy` **só quando `VERCEL_ENV=production`**. Prévia
de ramo, build local e sessão na nuvem pulam esse passo e não tocam no banco.

Por que assim: quem cuida do projeto trabalha pelo celular, e a regra antiga
(rodar `npm run db:migrate` na própria máquina antes do push) travava toda
mudança de banco até alguém sentar no computador.

A trava da prévia não pode sair: a prévia enxerga as mesmas variáveis de
banco, e sem ela a migration de um ramo não aprovado iria para produção.

Se a migration falhar, o build para e a Vercel mantém no ar a versão anterior.
A conta da Vercel avisa por e-mail quando um deploy falha, e o rodapé do menu
mostra a versão no ar (`versão c579e72 · 08/10 17:05`): se não for a última
publicada, a publicação parou no caminho.
Já aconteceu uma vez (o build não alcançava o banco, commit `a9db700`). A causa
provável é a conexão direta do Supabase, que só aceita IPv6, enquanto o build
da Vercel é IPv4. O conserto, no painel da Vercel (Settings → Environment
Variables): `DIRECT_URL` com a conexão do **Session pooler** do Supabase
(porta 5432), que aceita IPv4 e comandos de migration; depois, Redeploy.

Segunda causa já vista (PR #40): a variável `SHADOW_DATABASE_URL` existia
vazia na Vercel, e o Prisma 7 recusa texto vazio (`P1013 ... shadowDatabaseUrl
... must not be an empty string`). O `prisma7.config.ts` agora troca vazio por
"não definida", como já fazia com a `DIRECT_URL`.

Terceira causa já vista (PR #58, 11/10): logo depois do merge, no mesmo
minuto, o mesmo commit foi empurrado para o ramo de trabalho. A Vercel montou
só a prévia do ramo, e a publicação de produção da master nem foi criada. Por
isso, depois de um merge, espere a publicação de produção ficar Ready (e o
rodapé do menu mostrar a versão nova) antes de empurrar o mesmo commit para
outro ramo. E nunca use **Promote to Production** numa prévia: ela pulou as
migrations, e o código novo no ar sem as tabelas novas dá erro.

Quarta causa já vista (PR #63, 12/10): `Git information retrieval failed for
this deployment`. A Vercel não conseguiu buscar o commit no GitHub e o build
nem começou (falha em segundos, sem log). O app da Vercel no GitHub estava
instalado e com acesso: foi passageiro. O conserto é **Redeploy** na versão
que falhou (se for a de produção, Redeploy nela, nunca Promote); ou um merge
novo na master, que cria outra publicação de produção.

Rodar na mão continua possível, com o `.env` apontando para produção:

```bash
npm run db:migrate
```

## Checagem automática (CI)

`.github/workflows/checagem.yml` roda em toda PR para o `master`: tipos
(`tsc`), lint, migrations num Postgres vazio, seed, `npm run test:regras`
(as regras testadas sem consultar o banco) e o build. Com a regra do branch
ligada no GitHub, a PR só entra com a checagem verde.

Rodar o mesmo na mão:

```bash
npx tsc --noEmit && npm run lint && npm run test:regras && npm run build
```

Um teste novo de regra entra no `test:regras` do `package.json`.

## Testes e dados de demonstração

```bash
npm run db:test
npm run db:demo   # popula uma semana verossímil (apaga as reservas atuais)
```

Rodam contra o banco do `.env`. Nunca aponte o `.env` para a produção ao
rodar estes dois.

Cobre a lógica crítica direto no banco: contagem de sobreposição, bloqueio de
overbooking no limite exato, corrida entre dois pedidos simultâneos pelo
último lugar, reserva pendente ocupando capacidade, cancelamento liberando,
feriados futuros fechando o dia e datas vencidas sendo ignoradas.

## Desempenho

O que deixa o painel lento quase nunca é o número de consultas: é quantas
idas ao banco uma tela faz **uma depois da outra**. Cada uma custa a distância
até o banco, e com o banco longe da função da Vercel isso vira meio segundo
ou mais por toque. As regras, para toda tela nova:

- **Busque junto o que não depende um do outro**: um `Promise.all` só, em vez
  de `await` em fila. Se a busca B precisa de ids da A, veja se ela não pode
  usar o mesmo filtro da A (ex.: `situacaoDasRotinas({ diaSemana })`), com o
  mesmo limite da tela (as vinte mais recentes, como em Contar estoque):
  filtro sem limite cresce com o histórico.
- **Componente que busca sozinho** (como `RotinasDeHoje`) só começa quando a
  tela termina: exporte a busca com `cache()` do React e chame-a no começo da
  tela (`void rotinasDeHoje(tz)`).
- **Leitura não escreve**: configuração de uma linha se lê com `findUnique` e
  só se cria quando falta; trabalho que basta uma vez por dia (contas fixas)
  vai num `unstable_cache` por dia.
- **Módulo com `layout.tsx` próprio precisa de `loading.tsx`** logo abaixo
  dele, senão a troca entre as telas do módulo fica sem sinal até o servidor
  responder.
- A conta da sessão fica guardada 30 s (`getCurrentUser`): toda ação que muda
  conta ou permissão chama `limparUsuarios()`.

Para medir, com o banco atrasado de propósito (`scripts/desempenho/`):

```bash
node scripts/desempenho/atraso.mjs 5434 5432 75 &        # banco a 150 ms
DATABASE_URL=...porta 5434... PRISMA_LOG=query npx next start -p 3200 > app.log 2>&1 &
MEDIR_USUARIO=... MEDIR_SENHA=... node scripts/desempenho/medir.mjs http://localhost:3200 app.log
```

O tempo de cada tela dividido por 150 dá quantas idas em fila ela faz. Hoje
as telas ficam em 1 a 3.

## Deploy (Vercel + Supabase)

O projeto já está publicado; isto é o que existe e para que serve.

1. Banco no Supabase. Na Vercel:
   - `DATABASE_URL`: conexão do pooler do Supabase (o site usa esta);
   - `DIRECT_URL`: conexão do **Session pooler** (porta 5432), usada pelas
     migrations. A conexão direta do Supabase só aceita IPv6 e o build da
     Vercel é IPv4.
2. Outras variáveis em Production: `AUTH_SECRET` (`npx auth secret`),
   `ADMIN_USERNAME`, `CRON_SECRET` (texto aleatório longo; a Vercel manda no
   cabeçalho dos crons), `NEXT_PUBLIC_VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`
   (avisos no celular; `npx web-push generate-vapid-keys`). E-mail: ver
   "E-mail". `SHADOW_DATABASE_URL` não serve em produção.
3. Publicar é fazer merge no `master`: a Vercel roda o build, que aplica as
   migrations sozinho (ver "Migrations em produção").
4. Seed só uma vez, num banco novo, com `ADMIN_INITIAL_PASSWORD` definida;
   depois a variável pode sair da Vercel.
5. Antes de divulgar o link de reservas, confirme em **Comercial →
   Configurações** a lotação real do salão e os horários de cada dia.

## Estrutura

```
app/page.tsx                        página pública (o link de reservas)
app/reserva/[id]/                   confirmação
app/admin/reservas/                 agenda do dia (aprovar, cancelar, no-show)
app/admin/configuracoes/regras      antecedência, grupos, aprovação
app/admin/configuracoes/capacidade  lotação, duração, grade semanal, feriados
app/admin/configuracoes/notificacoes  avisos por e-mail
lib/availability.ts                 lógica de disponibilidade (o núcleo)
lib/actions/reservations.ts         criação com transação + advisory lock
prisma/schema.prisma                modelo de dados
```

## Decisões de arquitetura

- **Três domínios de configuração separados** (regras / capacidade /
  notificação). Misturá-los é o que permite estados incoerentes como
  "aprova sozinho sem saber a lotação" ou "confirma sozinho mas o aviso é
  manual".
- **`durationMinutes` é snapshot na reserva** — mudar a duração padrão não
  altera reservas já feitas.
- **Reserva pendente ocupa capacidade** — senão o intervalo entre pedido e
  aprovação viraria porta para overbooking.
- **Falha de e-mail nunca derruba a reserva** — o aviso é best-effort, com log.
- **A página pública só promete o que está ligado** — o texto de fila de
  espera, por exemplo, só aparece com a flag ativa.
